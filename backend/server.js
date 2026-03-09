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
    getStats,
    insertVoucher,
    getDailyReport
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
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://yourdomain.com

// Parse SALES_GROUPS: JSON map of { "SalespersonName": "groupId", ... }
let SALES_GROUPS = {};
try {
    SALES_GROUPS = JSON.parse(process.env.SALES_GROUPS || '{}');
} catch (err) {
    console.error('⚠️  Failed to parse SALES_GROUPS from .env:', err.message);
}

// Build a reverse lookup: groupId → salesperson name
const GROUP_TO_SALESPERSON = {};
for (const [name, groupId] of Object.entries(SALES_GROUPS)) {
    GROUP_TO_SALESPERSON[groupId.toString()] = name;
}

// ─── Telegram Message Log (last 25 incoming messages) ────────
const telegramLog = [];
const MAX_LOG = 25;

function logTelegramMessage(update) {
    const entry = {
        timestamp: moment().tz('America/Caracas').format('YYYY-MM-DD HH:mm:ss'),
        update_id: update.update_id,
        chat_id: update.message?.chat?.id,
        chat_title: update.message?.chat?.title || 'DM',
        from: update.message?.from?.first_name || 'unknown',
        text: update.message?.text || '(no text)',
        raw_update: update // store the full JSON
    };
    telegramLog.push(entry);
    if (telegramLog.length > MAX_LOG) telegramLog.shift();

    console.log(`\n📩 TG msg Summary: [${entry.chat_title}] ${entry.from}: ${entry.text}`);
    console.log('📦 Raw JSON:');
    console.log(JSON.stringify(update, null, 2));
    console.log('---------------------------------------------------\n');
}

let bot = null;

if (BOT_TOKEN && BOT_TOKEN !== 'your_bot_token_here') {
    // Webhook mode (production) vs Polling mode (development)
    if (WEBHOOK_URL) {
        bot = new TelegramBot(BOT_TOKEN, { webHook: true });
        const webhookPath = `/api/telegram-webhook/${BOT_TOKEN}`;
        bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`);

        // Express route to receive Telegram updates
        app.post(webhookPath, (req, res) => {
            logTelegramMessage(req.body);
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
        bot.on('message', (msg) => {
            logTelegramMessage({ update_id: Date.now(), message: msg });
        });
        console.log('🤖 Telegram bot started (polling mode)');
    }

    // ─── Bot Commands ────────────────────────────────────────────
    bot.onText(/^[Tt]$/i, (msg) => {
        const chatId = msg.chat.id.toString();

        // Only respond in registered sales groups
        const salesperson = GROUP_TO_SALESPERSON[chatId];
        if (!salesperson) {
            return;
        }

        const voucher = getUnusedVoucher();
        if (!voucher) {
            bot.sendMessage(chatId, '⚠️ No hay vouchers disponibles. Contacte al administrador.');
            return;
        }

        const now = moment().tz('America/Caracas').format('YYYY-MM-DD HH:mm:ss');
        markRequested(voucher.id, now, salesperson);

        // Reply in the salesperson's private group
        bot.sendMessage(chatId,
            `🎫 *Voucher asignado*\n\n` +
            `Código: \`${voucher.code}\`\n` +
            `Vendedor: ${salesperson}\n` +
            `Fecha: ${now}`,
            { parse_mode: 'Markdown' }
        );

        // Notify Admin group
        if (ADMIN_GROUP_ID) {
            bot.sendMessage(ADMIN_GROUP_ID,
                `📋 *Voucher Solicitado*\n\n` +
                `Código: \`${voucher.code}\`\n` +
                `Vendedor: ${salesperson}\n` +
                `Fecha: ${now}`,
                { parse_mode: 'Markdown' }
            );
        }
    });

    // Utility: reply with chat ID so you can discover group IDs easily
    bot.onText(/\/chatid/, (msg) => {
        bot.sendMessage(msg.chat.id, `ℹ️ Chat ID: \`${msg.chat.id}\``, { parse_mode: 'Markdown' });
    });
} else {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — bot disabled. Set it in .env');
    console.warn('   (Looking for .env at:', path.join(__dirname, '.env') + ')');
}

// ─── REST API ────────────────────────────────────────────────────
const cron = require('node-cron');

// Helper to get 6 AM boundaries for a given date
function getReportBoundaries(dateStr) {
    // dateStr is 'YYYY-MM-DD'
    // The report for 'YYYY-MM-DD' covers 6 AM the day before, to 6 AM that day.
    const until = moment.tz(`${dateStr} 06:00:00`, 'America/Caracas');
    const since = until.clone().subtract(24, 'hours');

    return {
        since: since.format('YYYY-MM-DD HH:mm:ss'),
        until: until.format('YYYY-MM-DD HH:mm:ss')
    };
}

// REST endpoint to get the daily report
app.get('/api/report/daily', (req, res) => {
    try {
        // Default to today if no date provided
        const dateStr = req.query.date || moment().tz('America/Caracas').format('YYYY-MM-DD');
        const { since, until } = getReportBoundaries(dateStr);

        const report = getDailyReport(since, until);
        res.json(report);
    } catch (err) {
        console.error('Error fetching daily report:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Cron job to run every day at 6:00 AM Caracas time
cron.schedule('0 6 * * *', () => {
    try {
        console.log('⏰ Running daily report cron job...');

        // Today is the date we run it
        const today = moment().tz('America/Caracas').format('YYYY-MM-DD');
        const { since, until } = getReportBoundaries(today);

        const report = getDailyReport(since, until);

        if (bot && ADMIN_GROUP_ID) {
            let msg = `📊 *Reporte Diario de Vouchers*\n`;
            msg += `Período: ${since} - ${until}\n\n`;
            msg += `*Totales:*\n`;
            msg += `• Solicitados: ${report.totals.requested}\n`;
            msg += `• Usados: ${report.totals.used}\n`;
            msg += `• Total a pagar: $${report.totals.totalPayment.toFixed(2)}\n`;
            msg += `• Disponibles en stock: ${report.totals.availableInStock}\n\n`;

            if (report.sellers.length > 0) {
                msg += `*Por Vendedor:*\n`;
                for (const s of report.sellers) {
                    msg += `👤 *${s.seller}*\n`;
                    msg += `  - Solicitados: ${s.requested}\n`;
                    msg += `  - Usados: ${s.used}\n`;
                    msg += `  - Pago: $${s.payment.toFixed(2)}\n`;
                }
            } else {
                msg += `_No hubo actividad en este período._`;
            }

            bot.sendMessage(ADMIN_GROUP_ID, msg, { parse_mode: 'Markdown' });
            console.log('✅ Daily report sent to Telegram Admin group');
        } else {
            console.log('⚠️ Cron ran, but Telegram bot / ADMIN_GROUP_ID not configured.');
        }
    } catch (err) {
        console.error('❌ Error running daily report cron:', err);
    }
}, {
    timezone: 'America/Caracas'
});

// View last 25 Telegram messages received by this server
app.get('/api/telegram-log', (req, res) => {
    res.json({ count: telegramLog.length, messages: [...telegramLog].reverse() });
});

// Seed vouchers via API (so you can add while the app is running)
app.post('/api/vouchers/seed', (req, res) => {
    try {
        const { codes } = req.body;
        if (!codes) {
            return res.status(400).json({ error: 'Missing "codes" — provide an array or comma-separated string' });
        }

        const codeList = Array.isArray(codes) ? codes : codes.split(',');
        let inserted = 0;
        let skipped = 0;

        for (const code of codeList) {
            const trimmed = code.trim();
            if (!trimmed) continue;
            if (insertVoucher(trimmed)) {
                inserted++;
            } else {
                skipped++;
            }
        }

        res.json({ message: `Inserted: ${inserted}, Skipped: ${skipped}`, inserted, skipped });
    } catch (err) {
        console.error('Error seeding vouchers:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Request a voucher (simulates /ticket command via API)
app.post('/api/voucher/request', (req, res) => {
    try {
        const { requester } = req.body;
        const voucher = getUnusedVoucher();
        if (!voucher) {
            return res.status(404).json({ error: 'No vouchers available' });
        }

        const now = moment().tz('America/Caracas').format('YYYY-MM-DD HH:mm:ss');
        const name = requester || 'Test User';
        markRequested(voucher.id, now, name);

        // Notify Admin group if bot is connected
        if (bot && ADMIN_GROUP_ID) {
            bot.sendMessage(ADMIN_GROUP_ID,
                `📋 *Voucher Solicitado*\n\n` +
                `Código: \`${voucher.code}\`\n` +
                `Vendedor: ${name}\n` +
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

        // Notify the salesperson who requested this voucher
        if (bot && result.voucher.requested_by) {
            const salespersonGroupId = SALES_GROUPS[result.voucher.requested_by];
            if (salespersonGroupId) {
                bot.sendMessage(salespersonGroupId,
                    `🟢 *Voucher en uso*\n\n` +
                    `Código: \`${code}\`\n` +
                    `MAC: \`${mac || 'N/A'}\`\n` +
                    `Fecha: ${now}`,
                    { parse_mode: 'Markdown' }
                );
            }
        }

        // Notify Admin group about first usage
        if (bot && ADMIN_GROUP_ID) {
            bot.sendMessage(ADMIN_GROUP_ID,
                `🟢 *Voucher Utilizado*\n\n` +
                `Código: \`${code}\`\n` +
                `Vendedor: ${result.voucher.requested_by || 'N/A'}\n` +
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
