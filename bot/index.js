const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const Order = require('../models/Order');
const TelegramUser = require('../models/TelegramUser');
const TrialToken = require('../models/TrialToken');
const trialTokenCtrl = require('../controllers/trialTokenController');
const PLANS = require('../config/plans');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const PUBLIC_URL = process.env.PUBLIC_URL;

async function upsertUser(ctx) {
    const from = ctx.from;
    if (!from) return null;
    return TelegramUser.findOneAndUpdate(
        { chatId: String(from.id) },
        {
            chatId: String(from.id),
            username: from.username,
            firstName: from.first_name,
            lastName: from.last_name,
            lastInteraction: new Date()
        },
        { upsert: true, new: true }
    );
}

function formatPrice(p) {
    return p === 0 ? 'Miễn phí' : p.toLocaleString('vi-VN') + 'đ';
}

function mainMenu() {
    const buttons = Object.entries(PLANS).map(([code, p]) => [
        Markup.button.callback(
            `${p.emoji} ${p.name} — ${p.durationHours}h — ${formatPrice(p.price)}`,
            `buy_${code}`
        )
    ]);
    buttons.push([Markup.button.callback('Lấy key dùng thử miễn phí', 'trial_free')]);
    buttons.push([Markup.button.callback('Key của tôi', 'my_keys')]);
    return Markup.inlineKeyboard(buttons);
}

bot.start(async (ctx) => {
    await upsertUser(ctx);
    await ctx.replyWithHTML(
        `<b>Chào mừng đến PhimHay</b>\n\n` +
        `Bot giúp bạn nhận key xem phim.\n\n` +
        `<b>Lệnh chính:</b>\n` +
        `/getkeyfree - Lấy key dùng thử miễn phí\n` +
        `/menu - Xem các gói trả phí\n` +
        `/mykeys - Key đã nhận\n` +
        `/help - Trợ giúp`,
        mainMenu()
    );
});

bot.command('menu', async (ctx) => {
    await upsertUser(ctx);
    await ctx.replyWithHTML('<b>Chọn gói:</b>', mainMenu());
});

bot.command('help', async (ctx) => {
    await ctx.replyWithHTML(
        `<b>Hướng dẫn</b>\n\n` +
        `/getkeyfree - Lấy key dùng thử 1 giờ miễn phí\n` +
        `/menu - Xem các gói trả phí\n` +
        `/mykeys - Key đã nhận\n\n` +
        `Mỗi người lấy được 1 key / 24h`
    );
});

bot.command('mykeys', async (ctx) => {
    await upsertUser(ctx);
    const orders = await Order.find({ chatId: String(ctx.from.id), status: 'delivered' })
        .sort({ deliveredAt: -1 }).limit(10);
    if (!orders.length) return ctx.replyWithHTML('Chưa có key nào. Gõ /menu để mua.');

    let msg = '<b>Key đã nhận:</b>\n\n';
    for (const o of orders) {
        const expired = new Date(o.deliveredAt).getTime() + o.durationHours * 3600 * 1000 < Date.now();
        msg += `<b>${PLANS[o.plan]?.name || o.plan}</b>\n`;
        msg += `<code>${o.keyValue}</code>\n`;
        msg += `Nhận: ${new Date(o.deliveredAt).toLocaleString('vi-VN')}\n`;
        msg += `Thời hạn: ${o.durationHours}h — ${expired ? 'Hết hạn' : 'Còn dùng'}\n\n`;
    }
    await ctx.replyWithHTML(msg);
});

/* ---------- /getkeyfree ---------- */
bot.command('getkeyfree', async (ctx) => {
    await upsertUser(ctx);

    const chatId = String(ctx.from.id);
    const username = ctx.from.username || '';

    const loadingMsg = await ctx.replyWithHTML('Đang tạo link lấy key...');

    try {
        const result = await trialTokenCtrl.createToken(chatId, username);

        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

        if (!result.success) {
            if (result.reason === 'cooldown') {
                return ctx.replyWithHTML(
                    `<b>Bạn đã lấy key hôm nay rồi</b>\n\n` +
                    `Vui lòng thử lại sau <b>${result.remainMin} phút</b>.\n\n` +
                    `Mỗi người chỉ được lấy 1 key mỗi 24 giờ.`
                );
            }
            if (result.reason === 'out_of_stock') {
                return ctx.replyWithHTML(
                    `<b>Đã hết key dùng thử</b>\n\n` +
                    `Vui lòng quay lại sau hoặc liên hệ admin.`
                );
            }
            return ctx.reply('Không thể tạo link, vui lòng thử lại sau.');
        }

        const expiresInMin = Math.floor((new Date(result.expiresAt) - Date.now()) / 60000);

        await ctx.replyWithHTML(
            `<b>Link lấy key dùng thử của bạn</b>\n\n` +
            `Bấm nút bên dưới để nhận key miễn phí.\n\n` +
            `Lưu ý:\n` +
            `- Link chỉ dùng được <b>1 lần</b>\n` +
            `- Hết hạn sau <b>${expiresInMin} phút</b>\n` +
            `- Key dùng được <b>1 giờ</b> xem phim\n` +
            `- Mỗi người lấy được 1 key / 24h`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.url('Lấy key ngay', result.url)],
                    [Markup.button.callback('Kiểm tra trạng thái', 'check_trial_status')]
                ])
            }
        );
    } catch (e) {
        console.error('getkeyfree error:', e);
        ctx.reply('Có lỗi xảy ra, vui lòng thử lại sau.');
    }
});

/* ---------- Check trial status ---------- */
bot.action('check_trial_status', async (ctx) => {
    await ctx.answerCbQuery();

    const chatId = String(ctx.from.id);
    const lastUsed = await TrialToken.findOne({ chatId, isUsed: true }).sort({ usedAt: -1 });

    if (!lastUsed) {
        return ctx.replyWithHTML(`Bạn chưa lấy key nào.\nGõ /getkeyfree để lấy key dùng thử.`);
    }

    const nextAt = new Date(lastUsed.usedAt.getTime() + 24 * 3600 * 1000);
    const remainMin = Math.ceil((nextAt - Date.now()) / 60000);

    if (remainMin > 0) {
        await ctx.replyWithHTML(
            `<b>Key gần nhất</b>\n\n` +
            `Key: <code>${lastUsed.keyIssued}</code>\n` +
            `Lấy lúc: ${new Date(lastUsed.usedAt).toLocaleString('vi-VN')}\n\n` +
            `Có thể lấy key mới sau <b>${remainMin} phút</b>.`
        );
    } else {
        await ctx.replyWithHTML(
            `<b>Key gần nhất</b>\n\n` +
            `Key: <code>${lastUsed.keyIssued}</code>\n\n` +
            `Bạn đã có thể lấy key mới.\nGõ /getkeyfree để lấy.`
        );
    }
});

/* ---------- Action trial_free → trigger getkeyfree ---------- */
bot.action('trial_free', async (ctx) => {
    await ctx.answerCbQuery();
    return bot.handleUpdate({
        update_id: Date.now(),
        message: {
            message_id: Date.now(),
            from: ctx.from,
            chat: ctx.chat,
            date: Math.floor(Date.now() / 1000),
            text: '/getkeyfree',
            entities: [{ type: 'bot_command', offset: 0, length: 11 }]
        }
    });
});

/* ---------- Buy plans ---------- */
bot.action(/^buy_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await upsertUser(ctx);
    const planCode = ctx.match[1];
    const plan = PLANS[planCode];
    if (!plan) return ctx.reply('Gói không tồn tại');

    if (plan.price === 0) {
        try {
            await axios.post(`${PUBLIC_URL}/api/payment/vietqr/create`, {
                plan: planCode, chatId: String(ctx.from.id)
            });
        } catch (e) {
            ctx.reply('Lỗi: ' + (e.response?.data?.error || e.message));
        }
        return;
    }

    const methods = Markup.inlineKeyboard([
        [Markup.button.callback('VietQR (chuyển khoản)', `pay_vietqr_${planCode}`)],
        [Markup.button.callback('VNPay', `pay_vnpay_${planCode}`)],
        [Markup.button.callback('MoMo', `pay_momo_${planCode}`)],
        [Markup.button.callback('Quay lại', 'back_menu')]
    ]);

    await ctx.editMessageText(
        `<b>${plan.emoji} ${plan.name}</b>\n\nThời hạn: <b>${plan.durationHours}h</b>\nGiá: <b>${formatPrice(plan.price)}</b>\n\nChọn phương thức:`,
        { parse_mode: 'HTML', ...methods }
    );
});

bot.action('back_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('<b>Chọn gói:</b>', { parse_mode: 'HTML', ...mainMenu() });
});

bot.action(/^pay_(vietqr|vnpay|momo)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, method, planCode] = ctx.match;
    const plan = PLANS[planCode];
    if (!plan) return ctx.reply('Gói không tồn tại');

    await ctx.editMessageText('Đang tạo đơn hàng...');

    try {
        const res = await axios.post(`${PUBLIC_URL}/api/payment/${method}/create`, {
            plan: planCode, chatId: String(ctx.from.id)
        });
        const data = res.data;

        if (method === 'vietqr') {
            const { order, qrUrl, bankInfo } = data;
            const caption =
                `<b>Đơn ${order.orderCode}</b>\n\nGói: <b>${plan.name}</b>\nSố tiền: <b>${formatPrice(plan.price)}</b>\n\n` +
                `<b>Chuyển khoản:</b>\n` +
                `NH: <code>${bankInfo.bankId}</code>\n` +
                `STK: <code>${bankInfo.account}</code>\n` +
                `Chủ TK: <code>${bankInfo.accountName}</code>\n` +
                `Nội dung: <code>${order.orderCode}</code>\n\n` +
                `Quét QR hoặc chuyển khoản đúng nội dung.\nBot sẽ tự gửi key sau khi nhận tiền.`;
            await ctx.deleteMessage().catch(() => {});
            await ctx.replyWithPhoto(qrUrl, { caption, parse_mode: 'HTML' });
        } else if (method === 'vnpay') {
            const { order, payUrl } = data;
            await ctx.editMessageText(
                `<b>Đơn ${order.orderCode}</b>\n\nGói: <b>${plan.name}</b>\nSố tiền: <b>${formatPrice(plan.price)}</b>\n\nBấm để thanh toán:`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.url('Thanh toán VNPay', payUrl)]])
                }
            );
        } else if (method === 'momo') {
            const { order, payUrl, qrCodeUrl } = data;
            const caption =
                `<b>Đơn ${order.orderCode}</b>\n\nGói: <b>${plan.name}</b>\nSố tiền: <b>${formatPrice(plan.price)}</b>\n\nQuét QR hoặc bấm nút để thanh toán MoMo`;
            await ctx.deleteMessage().catch(() => {});
            if (qrCodeUrl) {
                await ctx.replyWithPhoto(qrCodeUrl, {
                    caption, parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.url('Mở MoMo', payUrl)]])
                });
            } else {
                await ctx.replyWithHTML(caption, Markup.inlineKeyboard([
                    [Markup.button.url('Mở MoMo', payUrl)]
                ]));
            }
        }
    } catch (e) {
        console.error(e.response?.data || e.message);
        await ctx.editMessageText('Lỗi tạo đơn: ' + (e.response?.data?.error || e.message));
    }
});

bot.action('my_keys', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML('Gõ /mykeys để xem danh sách key.');
});

/* ---------- Admin commands ---------- */
bot.command('stats', async (ctx) => {
    if (String(ctx.from.id) !== String(process.env.TELEGRAM_ADMIN_CHAT_ID)) return;
    const AccessKey = require('../models/AccessKey');
    const [total, used, unused, pending, delivered] = await Promise.all([
        AccessKey.countDocuments(),
        AccessKey.countDocuments({ isUsed: true }),
        AccessKey.countDocuments({ isUsed: false }),
        Order.countDocuments({ status: 'pending' }),
        Order.countDocuments({ status: 'delivered' })
    ]);
    await ctx.replyWithHTML(
        `<b>Thống kê</b>\n\nKey tổng: <b>${total}</b>\nChưa dùng: <b>${unused}</b>\nĐã dùng: <b>${used}</b>\n\nĐơn chờ: <b>${pending}</b>\nĐơn giao: <b>${delivered}</b>`
    );
});

bot.command('confirm', async (ctx) => {
    if (String(ctx.from.id) !== String(process.env.TELEGRAM_ADMIN_CHAT_ID)) return;
    const orderCode = ctx.message.text.split(' ')[1];
    if (!orderCode) return ctx.reply('Dùng: /confirm <orderCode>');

    const order = await Order.findOne({ orderCode });
    if (!order) return ctx.reply('Không tìm thấy');
    if (order.status === 'delivered') return ctx.reply('Đã giao rồi');

    order.status = 'paid';
    order.paidAt = new Date();
    await order.save();

    const { deliverKey } = require('../controllers/paymentController');
    await deliverKey(order);
    ctx.reply(`Đã xác nhận và gửi key cho đơn ${orderCode}`);
});

module.exports = { bot };
