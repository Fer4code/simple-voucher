const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const moment = require('moment-timezone');
const TelegramBot = require('node-telegram-bot-api');
const {
    getUnusedVoucher,
    markRequested,
    markUsed,
    getAllVouchers,
    getStats
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve React static files in production
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath));

// ─── Telegram Bot ────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VENTAS_GROUP_ID = process.env.VENTAS_GROUP_ID;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://yourdomain.com

let bot = null;

if (BOT_TOKEN && BOT_TOKEN !== 'your_bot_token_here') {
    // Webhook mode (production) vs Polling mode (development)
    if (WEBHOOK_URL) {
        bot = new TelegramBot(BOT_TOKEN, { webHook: true });
        const webhookPath = `/api/telegram-webhook/${BOT_TOKEN}`;
        bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`);

        // Express route to receive Telegram updates
        app.post(webhookPath, (req, res) => {
            bot.processUpdate(req.body);
            res.sendStatus(200);
        });

        console.log('🤖 Telegram bot started (webhook mode)');
        console.log(`   Webhook URL: ${WEBHOOK_URL}${webhookPath}`);
    } else {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        bot.on('polling_error', (err) => {
            console.error('Telegram polling error:', err.message);
        });
        console.log('🤖 Telegram bot started (polling mode)');
    }

    // ─── Bot Commands ────────────────────────────────────────────
    bot.onText(/\/ticket/, (msg) => {
        const chatId = msg.chat.id.toString();

        // Only respond in the Ventas group
        if (chatId !== VENTAS_GROUP_ID) {
            return;
        }

        const voucher = getUnusedVoucher();
        if (!voucher) {
            bot.sendMessage(chatId, '⚠️ No hay vouchers disponibles. Contacte al administrador.');
            return;
        }

        const now = moment().tz('America/Caracas').format('YYYY-MM-DD HH:mm:ss');
        markRequested(voucher.id, now);

        const userName = msg.from.first_name || msg.from.username || 'Usuario';

        // Reply in Ventas group
        bot.sendMessage(chatId,
            `🎫 *Voucher asignado*\n\n` +
            `Código: \`${voucher.code}\`\n` +
            `Solicitado por: ${userName}\n` +
            `Fecha: ${now}`,
            { parse_mode: 'Markdown' }
        );

        // Notify Admin group
        if (ADMIN_GROUP_ID) {
            bot.sendMessage(ADMIN_GROUP_ID,
                `📋 *Voucher Solicitado*\n\n` +
                `Código: \`${voucher.code}\`\n` +
                `Solicitado por: ${userName}\n` +
                `Fecha: ${now}`,
                { parse_mode: 'Markdown' }
            );
        }
    });
} else {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — bot disabled. Set it in .env');
    console.warn('   (Looking for .env at:', path.join(__dirname, '.env') + ')');
}

// ─── REST API ────────────────────────────────────────────────────

// Request a voucher (simulates /ticket command via API)
app.post('/api/voucher/request', (req, res) => {
    try {
        const { requester } = req.body;
        const voucher = getUnusedVoucher();
        if (!voucher) {
            return res.status(404).json({ error: 'No vouchers available' });
        }

        const now = moment().tz('America/Caracas').format('YYYY-MM-DD HH:mm:ss');
        markRequested(voucher.id, now);

        const name = requester || 'Test User';

        // Notify Admin group if bot is connected
        if (bot && ADMIN_GROUP_ID) {
            bot.sendMessage(ADMIN_GROUP_ID,
                `📋 *Voucher Solicitado*\n\n` +
                `Código: \`${voucher.code}\`\n` +
                `Solicitado por: ${name}\n` +
                `Fecha: ${now}`,
                { parse_mode: 'Markdown' }
            );
        }

        res.json({
            message: 'Voucher assigned',
            voucher: { ...voucher, requested_at: now },
            requester: name
        });
    } catch (err) {
        console.error('Error requesting voucher:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all vouchers
app.get('/api/vouchers', (req, res) => {
    try {
        const vouchers = getAllVouchers();
        res.json(vouchers);
    } catch (err) {
        console.error('Error fetching vouchers:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get stats
app.get('/api/vouchers/stats', (req, res) => {
    try {
        const stats = getStats();
        res.json(stats);
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// MikroTik callback: voucher used
app.post('/api/voucher/use', (req, res) => {
    try {
        const { code, mac } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Missing "code" in request body' });
        }

        const now = moment().tz('America/Caracas').format('YYYY-MM-DD HH:mm:ss');
        const result = markUsed(code, mac || 'N/A', now);

        if (!result.found) {
            return res.status(404).json({ error: 'Voucher not found' });
        }

        if (result.alreadyUsed) {
            return res.json({ message: 'Voucher was already used', voucher: result.voucher });
        }

        // Notify Admin group about first usage
        if (bot && ADMIN_GROUP_ID) {
            bot.sendMessage(ADMIN_GROUP_ID,
                `🟢 *Voucher Utilizado*\n\n` +
                `Código: \`${code}\`\n` +
                `MAC: \`${mac || 'N/A'}\`\n` +
                `Fecha: ${now}`,
                { parse_mode: 'Markdown' }
            );
        }

        res.json({ message: 'Voucher marked as used', voucher: result.voucher });
    } catch (err) {
        console.error('Error marking voucher as used:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// SPA fallback — serve index.html for page navigations only (not asset files)
app.get('*', (req, res) => {
    // Skip requests that look like static files (have a file extension)
    if (path.extname(req.path)) {
        return res.status(404).end();
    }
    const indexPath = path.join(frontendPath, 'index.html');
    if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Frontend not built yet. Run the frontend build first.' });
    }
});

// ─── Start Server ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
