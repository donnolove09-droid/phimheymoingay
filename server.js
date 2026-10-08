require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Webhook routes cần JSON body riêng
app.use('/api/payment/vietqr/webhook', express.json({ limit: '5mb' }));
app.use('/api/payment/momo/notify', express.json({ limit: '5mb' }));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Telegram bot webhook
const { setupWebhook, registerWebhook } = require('./bot/webhook');
setupWebhook(app);

const { checkAccess } = require('./controllers/accessController');

// Public routes
app.use('/api/access', require('./routes/access'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/trial', require('./routes/trial'));

// Protected routes (cần key)
app.use('/api/tmdb', checkAccess, require('./routes/tmdb'));
app.use('/api/ophim', checkAccess, require('./routes/ophim'));
app.use('/api/phimapi', checkAccess, require('./routes/phimapi'));
app.use('/api/movies', checkAccess, require('./routes/movies'));

const customRouter = require('./routes/custom');
app.use('/api/custom', (req, res, next) => {
    if (req.path.startsWith('/admin')) return next();
    return checkAccess(req, res, next);
}, customRouter);

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        services: {
            tmdb: !!process.env.TMDB_API_KEY,
            telegram: !!process.env.TELEGRAM_BOT_TOKEN,
            vietqr: !!process.env.BANK_ID
        }
    });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    if (req.path.startsWith('/admin')) return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    if (req.path.startsWith('/getkeyfree')) return res.sendFile(path.join(__dirname, 'public', 'getkeyfree.html'));
    if (req.path.startsWith('/getkey')) return res.sendFile(path.join(__dirname, 'public', 'getkey.html'));
    if (req.path.startsWith('/payment-result')) return res.sendFile(path.join(__dirname, 'public', 'payment-result.html'));
    if (req.path.startsWith('/payment')) return res.sendFile(path.join(__dirname, 'public', 'payment.html'));
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected');
        app.listen(PORT, async () => {
            console.log(`Server on ${PORT}`);
            if (process.env.PUBLIC_URL && process.env.TELEGRAM_BOT_TOKEN) {
                await registerWebhook();
            }
        });
    })
    .catch(e => { console.error(e); process.exit(1); });
