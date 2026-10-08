const crypto = require('crypto');
const querystring = require('querystring');
const axios = require('axios');
const QRCode = require('qrcode');
const Order = require('../models/Order');
const AccessKey = require('../models/AccessKey');
const PLANS = require('../config/plans');

function genOrderCode() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `DH${ts}${rand}`;
}

function formatPrice(p) {
    return p === 0 ? 'Miễn phí' : p.toLocaleString('vi-VN') + 'đ';
}

async function deliverKey(order) {
    if (order.status === 'delivered') return order;

    const key = await AccessKey.findOneAndUpdate(
        { isUsed: false },
        {
            $set: {
                note: `Order ${order.orderCode} - ${order.plan}`,
                plan: order.plan,
                durationHours: order.durationHours
            }
        },
        { sort: { createdAt: 1 }, new: true }
    );

    if (!key) {
        try {
            const { bot } = require('../bot');
            if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
                await bot.telegram.sendMessage(
                    process.env.TELEGRAM_ADMIN_CHAT_ID,
                    `⚠️ Hết key! Order ${order.orderCode} chưa giao.`,
                    { parse_mode: 'HTML' }
                );
            }
        } catch {}
        return null;
    }

    order.status = 'delivered';
    order.keyId = key._id;
    order.keyValue = key.key;
    order.deliveredAt = new Date();
    await order.save();

    try {
        const { bot } = require('../bot');
        if (order.chatId) {
            await bot.telegram.sendMessage(
                order.chatId,
                `<b>Thanh toán thành công</b>\n\n` +
                `Mã đơn: <code>${order.orderCode}</code>\n` +
                `Gói: <b>${PLANS[order.plan]?.name || order.plan}</b>\n` +
                `Thời hạn: <b>${order.durationHours}h</b>\n\n` +
                `Key của bạn:\n<code>${key.key}</code>\n\n` +
                `Vào website nhập key để xem phim.`,
                { parse_mode: 'HTML' }
            );
        }
        if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(
                process.env.TELEGRAM_ADMIN_CHAT_ID,
                `<b>Đơn hoàn tất</b>\n` +
                `Mã: <code>${order.orderCode}</code>\n` +
                `Gói: ${order.plan} — ${formatPrice(order.price)}\n` +
                `Key: <code>${key.key}</code>`,
                { parse_mode: 'HTML' }
            );
        }
    } catch {}

    return order;
}

exports.createVietQR = async (req, res) => {
    try {
        const { plan, chatId, email } = req.body;
        const planInfo = PLANS[plan];
        if (!planInfo) return res.status(400).json({ error: 'Gói không hợp lệ' });

        const orderCode = genOrderCode();
        const order = await Order.create({
            orderCode,
            chatId: chatId || null,
            customerEmail: email || null,
            plan,
            durationHours: planInfo.durationHours,
            price: planInfo.price,
            paymentMethod: planInfo.price === 0 ? 'free' : 'vietqr',
            status: 'pending'
        });

        if (planInfo.price === 0) {
            order.paidAt = new Date();
            await order.save();
            const delivered = await deliverKey(order);
            return res.json({ success: true, free: true, order: delivered, key: delivered?.keyValue });
        }

        const qrUrl =
            `https://img.vietqr.io/image/${process.env.BANK_ID}-${process.env.BANK_ACCOUNT}-` +
            `${process.env.BANK_TEMPLATE || 'compact2'}.png?amount=${planInfo.price}` +
            `&addInfo=${encodeURIComponent(orderCode)}` +
            `&accountName=${encodeURIComponent(process.env.BANK_ACCOUNT_NAME || '')}`;

        res.json({
            success: true,
            order,
            qrUrl,
            bankInfo: {
                bankId: process.env.BANK_ID,
                account: process.env.BANK_ACCOUNT,
                accountName: process.env.BANK_ACCOUNT_NAME,
                amount: planInfo.price,
                description: orderCode
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.vietqrWebhook = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (process.env.VIETQR_WEBHOOK_SECRET) {
            const expected = `Apikey ${process.env.VIETQR_WEBHOOK_SECRET}`;
            if (authHeader !== expected) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        const transactions = Array.isArray(req.body.data) ? req.body.data : [req.body];

        for (const tx of transactions) {
            const description = tx.description || tx.content || '';
            const amount = tx.amount || tx.transferAmount;
            const transactionId = tx.tid || tx.id || tx.referenceCode;

            const match = String(description).match(/DH[A-Z0-9]+/i);
            if (!match) continue;

            const orderCode = match[0].toUpperCase();
            const order = await Order.findOne({ orderCode });
            if (!order || order.status === 'delivered') continue;
            if (Number(amount) < order.price) continue;

            order.status = 'paid';
            order.paidAt = new Date();
            order.paymentRef = transactionId;
            order.paymentData = tx;
            await order.save();
            await deliverKey(order);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('VietQR webhook:', e);
        res.status(500).json({ error: e.message });
    }
};

exports.getQRImage = async (req, res) => {
    try {
        const order = await Order.findOne({ orderCode: req.params.orderCode });
        if (!order) return res.status(404).send('Not found');
        const qrUrl =
            `https://img.vietqr.io/image/${process.env.BANK_ID}-${process.env.BANK_ACCOUNT}-compact2.png` +
            `?amount=${order.price}&addInfo=${encodeURIComponent(order.orderCode)}` +
            `&accountName=${encodeURIComponent(process.env.BANK_ACCOUNT_NAME || '')}`;
        const buffer = await QRCode.toBuffer(qrUrl);
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (e) { res.status(500).send(e.message); }
};

exports.createVNPay = async (req, res) => {
    try {
        const { plan, chatId } = req.body;
        const planInfo = PLANS[plan];
        if (!planInfo) return res.status(400).json({ error: 'Gói không hợp lệ' });
        if (planInfo.price === 0) return res.status(400).json({ error: 'Dùng VietQR cho gói free' });

        const orderCode = genOrderCode();
        const order = await Order.create({
            orderCode, chatId: chatId || null,
            plan, durationHours: planInfo.durationHours,
            price: planInfo.price, paymentMethod: 'vnpay', status: 'pending'
        });

        const ipAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const date = new Date();
        const pad = n => String(n).padStart(2, '0');
        const createDate = `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

        let params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: process.env.VNPAY_TMN_CODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: orderCode,
            vnp_OrderInfo: `Thanh toan ${orderCode}`,
            vnp_OrderType: 'other',
            vnp_Amount: planInfo.price * 100,
            vnp_ReturnUrl: `${process.env.PUBLIC_URL}/api/payment/vnpay/return`,
            vnp_IpAddr: ipAddr,
            vnp_CreateDate: createDate
        };

        const sorted = {};
        Object.keys(params).sort().forEach(k => { sorted[k] = params[k]; });
        const signData = querystring.stringify(sorted, { encode: false });
        const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
        sorted['vnp_SecureHash'] = signed;

        const payUrl = process.env.VNPAY_URL + '?' + querystring.stringify(sorted, { encode: false });
        res.json({ success: true, order, payUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.vnpayReturn = async (req, res) => {
    try {
        const params = { ...req.query };
        const secureHash = params['vnp_SecureHash'];
        delete params['vnp_SecureHash'];
        delete params['vnp_SecureHashType'];
        const sorted = {};
        Object.keys(params).sort().forEach(k => { sorted[k] = params[k]; });
        const signData = querystring.stringify(sorted, { encode: false });
        const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        if (secureHash !== signed) {
            return res.redirect('/payment-result.html?status=invalid');
        }

        const order = await Order.findOne({ orderCode: params['vnp_TxnRef'] });
        if (!order) return res.redirect('/payment-result.html?status=notfound');

        if (params['vnp_ResponseCode'] === '00') {
            if (order.status !== 'delivered') {
                order.status = 'paid';
                order.paidAt = new Date();
                order.paymentRef = params['vnp_TransactionNo'];
                order.paymentData = params;
                await order.save();
                await deliverKey(order);
            }
            return res.redirect(`/payment-result.html?status=success&order=${order.orderCode}&key=${order.keyValue || ''}`);
        } else {
            order.status = 'cancelled';
            await order.save();
            return res.redirect(`/payment-result.html?status=failed&order=${order.orderCode}`);
        }
    } catch (e) {
        res.redirect('/payment-result.html?status=error');
    }
};

exports.vnpayIPN = async (req, res) => {
    try {
        const params = { ...req.query };
        const secureHash = params['vnp_SecureHash'];
        delete params['vnp_SecureHash'];
        delete params['vnp_SecureHashType'];
        const sorted = {};
        Object.keys(params).sort().forEach(k => { sorted[k] = params[k]; });
        const signData = querystring.stringify(sorted, { encode: false });
        const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        if (secureHash !== signed) return res.json({ RspCode: '97', Message: 'Invalid' });

        const order = await Order.findOne({ orderCode: params['vnp_TxnRef'] });
        if (!order) return res.json({ RspCode: '01', Message: 'Not found' });
        if (order.status === 'delivered') return res.json({ RspCode: '02', Message: 'Confirmed' });

        if (params['vnp_ResponseCode'] === '00') {
            order.status = 'paid';
            order.paidAt = new Date();
            order.paymentRef = params['vnp_TransactionNo'];
            order.paymentData = params;
            await order.save();
            await deliverKey(order);
        }
        res.json({ RspCode: '00', Message: 'Success' });
    } catch (e) { res.json({ RspCode: '99', Message: e.message }); }
};

exports.createMoMo = async (req, res) => {
    try {
        const { plan, chatId } = req.body;
        const planInfo = PLANS[plan];
        if (!planInfo) return res.status(400).json({ error: 'Gói không hợp lệ' });
        if (planInfo.price === 0) return res.status(400).json({ error: 'Dùng VietQR cho gói free' });

        const orderCode = genOrderCode();
        const order = await Order.create({
            orderCode, chatId: chatId || null,
            plan, durationHours: planInfo.durationHours,
            price: planInfo.price, paymentMethod: 'momo', status: 'pending'
        });

        const requestId = orderCode + '_' + Date.now();
        const orderInfo = `Thanh toan ${orderCode}`;
        const redirectUrl = `${process.env.PUBLIC_URL}/api/payment/momo/return`;
        const ipnUrl = `${process.env.PUBLIC_URL}/api/payment/momo/notify`;
        const requestType = 'captureWallet';
        const extraData = '';

        const rawSig =
            `accessKey=${process.env.MOMO_ACCESS_KEY}` +
            `&amount=${planInfo.price}` +
            `&extraData=${extraData}` +
            `&ipnUrl=${ipnUrl}` +
            `&orderId=${orderCode}` +
            `&orderInfo=${orderInfo}` +
            `&partnerCode=${process.env.MOMO_PARTNER_CODE}` +
            `&redirectUrl=${redirectUrl}` +
            `&requestId=${requestId}` +
            `&requestType=${requestType}`;

        const signature = crypto.createHmac('sha256', process.env.MOMO_SECRET_KEY)
            .update(rawSig).digest('hex');

        const body = {
            partnerCode: process.env.MOMO_PARTNER_CODE,
            partnerName: 'PhimHay',
            storeId: 'PhimHayStore',
            requestId, amount: planInfo.price, orderId: orderCode,
            orderInfo, redirectUrl, ipnUrl, lang: 'vi',
            extraData, requestType, signature
        };

        const { data } = await axios.post(process.env.MOMO_ENDPOINT, body);
        if (data.resultCode !== 0) {
            order.status = 'cancelled';
            await order.save();
            return res.status(400).json({ error: data.message });
        }

        res.json({
            success: true, order,
            payUrl: data.payUrl,
            qrCodeUrl: data.qrCodeUrl
        });
    } catch (e) {
        console.error('MoMo:', e.response?.data || e.message);
        res.status(500).json({ error: e.message });
    }
};

exports.momoReturn = async (req, res) => {
    try {
        const { orderId, resultCode, transId } = req.query;
        const order = await Order.findOne({ orderCode: orderId });
        if (!order) return res.redirect('/payment-result.html?status=notfound');

        if (resultCode === '0') {
            if (order.status !== 'delivered') {
                order.status = 'paid';
                order.paidAt = new Date();
                order.paymentRef = transId;
                order.paymentData = req.query;
                await order.save();
                await deliverKey(order);
            }
            return res.redirect(`/payment-result.html?status=success&order=${orderId}&key=${order.keyValue || ''}`);
        }
        order.status = 'cancelled';
        await order.save();
        res.redirect(`/payment-result.html?status=failed&order=${orderId}`);
    } catch (e) {
        res.redirect('/payment-result.html?status=error');
    }
};

exports.momoNotify = async (req, res) => {
    try {
        const { orderId, resultCode, transId } = req.body;
        const order = await Order.findOne({ orderCode: orderId });
        if (!order) return res.json({ message: 'Not found' });

        if (resultCode === 0 && order.status !== 'delivered') {
            order.status = 'paid';
            order.paidAt = new Date();
            order.paymentRef = transId;
            order.paymentData = req.body;
            await order.save();
            await deliverKey(order);
        }
        res.json({ message: 'OK' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getOrderStatus = async (req, res) => {
    const order = await Order.findOne({ orderCode: req.params.orderCode });
    if (!order) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({
        orderCode: order.orderCode,
        status: order.status,
        plan: order.plan,
        price: order.price,
        keyValue: order.status === 'delivered' ? order.keyValue : null,
        paidAt: order.paidAt,
        deliveredAt: order.deliveredAt
    });
};

exports.deliverKey = deliverKey;
