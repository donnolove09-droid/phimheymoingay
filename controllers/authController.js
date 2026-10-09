const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Otp = require('../models/Otp');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

async function sendOtpEmail(email, code) {
    const html = `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#141416;color:#f5f5f7;border-radius:10px">
            <h1 style="color:#e50914;text-align:center;margin-bottom:20px">PhimHay</h1>
            <h2 style="text-align:center;margin-bottom:20px">Xác thực email</h2>
            <p style="margin-bottom:20px">Mã OTP của bạn là:</p>
            <div style="background:#0a0a0b;border:2px dashed #e50914;border-radius:8px;padding:20px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#e50914">${code}</div>
            <p style="color:#9a9aa3;margin-top:20px;font-size:13px">Mã có hiệu lực trong <b style="color:#f5f5f7">5 phút</b>. Không chia sẻ mã này với bất kỳ ai.</p>
        </div>
    `;
    await transporter.sendMail({
        from: `"PhimHay" <${process.env.MAIL_USER}>`,
        to: email,
        subject: 'Mã xác thực PhimHay',
        html
    });
}

function genOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

exports.register = async (req, res) => {
    try {
        const { email, username, password } = req.body;
        if (!email || !username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
        if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu từ 6 ký tự' });
        if (username.length < 3) return res.status(400).json({ error: 'Username từ 3 ký tự' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });

        const normalizedEmail = email.toLowerCase();
        const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { username }] });
        if (existing) {
            if (existing.isVerified) return res.status(409).json({ error: 'Email hoặc username đã tồn tại' });
            await existing.deleteOne();
        }

        await User.create({ email: normalizedEmail, username, password, isVerified: false });

        const code = genOtp();
        await Otp.deleteMany({ email: normalizedEmail, used: false });
        await Otp.create({
            email: normalizedEmail,
            code,
            type: 'register',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });

        await sendOtpEmail(normalizedEmail, code);
        res.json({ success: true, message: 'OTP đã gửi đến email', email: normalizedEmail });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Lỗi gửi email. Kiểm tra MAIL_USER/MAIL_PASS.' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Thiếu thông tin' });
        const normalizedEmail = email.toLowerCase();

        const otp = await Otp.findOne({ email: normalizedEmail, code, used: false });
        if (!otp) return res.status(400).json({ error: 'Mã OTP không đúng hoặc đã dùng' });
        if (new Date(otp.expiresAt) < new Date()) return res.status(400).json({ error: 'Mã OTP đã hết hạn' });

        otp.used = true;
        await otp.save();

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });

        user.isVerified = true;
        await user.save();

        const token = jwt.sign(
            { userId: user._id.toString(), username: user.username, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            token,
            user: { id: user._id, email: user.email, username: user.username, role: user.role }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.login = async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;
        if (!emailOrUsername || !password) return res.status(400).json({ error: 'Thiếu thông tin' });

        const user = await User.findOne({
            $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }]
        });
        if (!user) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
        if (!user.isVerified) return res.status(403).json({ error: 'Tài khoản chưa xác thực email' });

        const ok = await user.comparePassword(password);
        if (!ok) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { userId: user._id.toString(), username: user.username, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            token,
            user: { id: user._id, email: user.email, username: user.username, role: user.role }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.resendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Thiếu email' });
        const normalizedEmail = email.toLowerCase();

        const user = await User.findOne({ email: normalizedEmail, isVerified: false });
        if (!user) return res.status(404).json({ error: 'Không tìm thấy user chưa xác thực' });

        const code = genOtp();
        await Otp.deleteMany({ email: normalizedEmail, used: false });
        await Otp.create({
            email: normalizedEmail,
            code,
            type: 'register',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });

        await sendOtpEmail(normalizedEmail, code);
        res.json({ success: true, message: 'Đã gửi lại OTP' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
};
