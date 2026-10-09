require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

app.use('/api/payment/vietqr/webhook', express.json({ limit: '5mb' }));
app.use('/api/payment/momo/notify', express.json({ limit: '5mb' }));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

const { setupWebhook, registerWebhook } = require('./bot/webhook');
setupWebhook(app);

const { checkAccess } = require('./controllers/accessController');

app.use('/api/access', require('./routes/access'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/trial', require('./routes/trial'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/multi', checkAccess, require('./routes/multiApi'));
app.use('/api/comments', require('./routes/comments'));

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
            vietqr: !!process.env.BANK_ID,
            mail: !!process.env.MAIL_USER
        }
    });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    if (req.path.startsWith('/admin')) return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    if (req.path.startsWith('/auth')) return res.sendFile(path.join(__dirname, 'public', 'auth.html'));
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
