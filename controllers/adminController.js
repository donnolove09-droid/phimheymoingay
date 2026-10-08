const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Setting = require('../models/Setting');
const AccessKey = require('../models/AccessKey');
const Order = require('../models/Order');
const { deliverKey } = require('./paymentController');

exports.login = async (req, res) => {
    const { username, password } = req.body;
    if (username !== process.env.ADMIN_USERNAME) {
        return res.status(401).json({ error: 'Sai thông tin' });
    }
    const hashSetting = await Setting.findOne({ key: 'admin_password_hash' });
    let ok = hashSetting?.value
        ? await bcrypt.compare(password, hashSetting.value)
        : password === process.env.ADMIN_PASSWORD;

    if (!ok) return res.status(401).json({ error: 'Sai thông tin' });

    const token = jwt.sign(
        { role: 'admin', username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.json({ success: true, token, username });
};

exports.getSettings = async (req, res) => {
    const setting = await Setting.findOne({ key: 'access_key' });
    res.json({
        accessKey: setting?.value || process.env.ACCESS_KEY,
        hasCustom: !!setting
    });
};

exports.updateAccessKey = async (req, res) => {
    const { accessKey } = req.body;
    if (!accessKey || accessKey.length < 4) {
        return res.status(400).json({ error: 'Key từ 4 ký tự' });
    }
    await Setting.findOneAndUpdate(
        { key: 'access_key' },
        { value: accessKey, updatedAt: new Date() },
        { upsert: true }
    );
    res.json({ success: true, accessKey });
};

exports.changePassword = async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu từ 6 ký tự' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await Setting.findOneAndUpdate(
        { key: 'admin_password_hash' },
        { value: hash, updatedAt: new Date() },
        { upsert: true }
    );
    res.json({ success: true });
};

exports.getKeyStats = async (req, res) => {
    const [total, used, unused, active, expired] = await Promise.all([
        AccessKey.countDocuments(),
        AccessKey.countDocuments({ isUsed: true }),
        AccessKey.countDocuments({ isUsed: false }),
        AccessKey.countDocuments({ isUsed: true, expiresAt: { $gt: new Date() } }),
        AccessKey.countDocuments({ isUsed: true, expiresAt: { $lt: new Date() } })
    ]);
    res.json({ total, used, unused, active, expired });
};

exports.getUsedKeys = async (req, res) => {
    const page = Number(req.query.page) || 1;
    const items = await AccessKey.find({ isUsed: true })
        .sort({ usedAt: -1 }).skip((page - 1) * 50).limit(50)
        .select('key usedAt expiresAt usedBy');
    res.json(items);
};

exports.resetKey = async (req, res) => {
    const { key } = req.body;
    const record = await AccessKey.findOne({ key: key.toUpperCase() });
    if (!record) return res.status(404).json({ error: 'Không tìm thấy' });
    record.isUsed = false;
    record.usedAt = null;
    record.expiresAt = null;
    record.usedBy = { ip: null, userAgent: null };
    await record.save();
    res.json({ success: true, key: record.key });
};

exports.revokeKey = async (req, res) => {
    const { key } = req.body;
    const record = await AccessKey.findOne({ key: key.toUpperCase() });
    if (!record) return res.status(404).json({ error: 'Không tìm thấy' });
    record.expiresAt = new Date();
    await record.save();
    res.json({ success: true });
};

exports.getOrders = async (req, res) => {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(orders);
};

exports.confirmOrder = async (req, res) => {
    const order = await Order.findOne({ orderCode: req.params.orderCode });
    if (!order) return res.status(404).json({ error: 'Không tìm thấy' });
    if (order.status === 'delivered') return res.json({ success: true, already: true });

    order.status = 'paid';
    order.paidAt = new Date();
    await order.save();
    await deliverKey(order);
    res.json({ success: true, key: order.keyValue });
};

exports.importKeys = async (req, res) => {
    try {
        const { keys } = req.body;
        if (!Array.isArray(keys) || !keys.length) {
            return res.status(400).json({ error: 'Cần mảng keys' });
        }
        const cleaned = [...new Set(keys.map(k => String(k).trim().toUpperCase()).filter(Boolean))];
        const ops = cleaned.map(k => ({
            updateOne: {
                filter: { key: k },
                update: { $setOnInsert: { key: k, isUsed: false } },
                upsert: true
            }
        }));
        const result = await AccessKey.bulkWrite(ops);
        const total = await AccessKey.countDocuments();
        const unused = await AccessKey.countDocuments({ isUsed: false });
        res.json({
            success: true,
            input: cleaned.length,
            inserted: result.upsertedCount,
            total,
            unused
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
