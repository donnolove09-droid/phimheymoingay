const { bot } = require('./index');

function setupWebhook(app) {
    const path = `/api/bot/${process.env.TELEGRAM_BOT_TOKEN}`;
    app.use(bot.webhookCallback(path));
    return path;
}

async function registerWebhook() {
    const url = `${process.env.PUBLIC_URL}/api/bot/${process.env.TELEGRAM_BOT_TOKEN}`;
    try {
        await bot.telegram.setWebhook(url);
        console.log('Webhook set:', url);
    } catch (e) {
        console.error('Set webhook failed:', e.message);
    }
}

module.exports = { setupWebhook, registerWebhook };
