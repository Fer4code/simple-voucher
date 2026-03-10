const Database = require('better-sqlite3');
const path = require('path');

// Store DB in /app/data when running in Docker, otherwise in ./data
const DB_DIR = process.env.DB_PATH || path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'vouchers.db');

// Ensure data directory exists
const fs = require('fs');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_FILE);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create vouchers table
db.exec(`
  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    requested_at TEXT DEFAULT NULL,
    used_at TEXT DEFAULT NULL,
    mac_address TEXT DEFAULT NULL,
    requested_by TEXT DEFAULT NULL
  )
`);

// Add requested_by column if upgrading an existing database
try {
  db.exec(`ALTER TABLE vouchers ADD COLUMN requested_by TEXT DEFAULT NULL`);
} catch (err) {
  // Column already exists — ignore
}

// Add logout_at column if upgrading an existing database
try {
  db.exec(`ALTER TABLE vouchers ADD COLUMN logout_at TEXT DEFAULT NULL`);
} catch (err) {
  // Column already exists — ignore
}

// Add type column if upgrading an existing database
try {
  db.exec(`ALTER TABLE vouchers ADD COLUMN type TEXT DEFAULT 'paid'`);
} catch (err) {
  // Column already exists — ignore
}

/**
 * Get one voucher that has not been requested yet
 */
function getUnusedVoucher(type = 'paid') {
  return db.prepare(`
    SELECT * FROM vouchers
    WHERE requested_at IS NULL AND type = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(type);
}

/**
 * Mark a voucher as requested (assigned to a salesperson)
 */
function markRequested(id, timestamp, requestedBy) {
  return db.prepare(`
    UPDATE vouchers SET requested_at = ?, requested_by = ? WHERE id = ?
  `).run(timestamp, requestedBy || null, id);
}

/**
 * Mark a voucher as used (MikroTik reported first usage)
 * Only marks if not already used (first use wins)
 */
function markUsed(code, mac, timestamp) {
  const voucher = db.prepare(`SELECT * FROM vouchers WHERE code = ?`).get(code);
  if (!voucher) return { found: false };
  if (voucher.used_at) return { found: true, alreadyUsed: true, voucher };

  db.prepare(`
    UPDATE vouchers SET used_at = ?, mac_address = ? WHERE code = ?
  `).run(timestamp, mac, code);

  return {
    found: true,
    alreadyUsed: false,
    voucher: db.prepare(`SELECT * FROM vouchers WHERE code = ?`).get(code)
  };
}

/**
 * Mark a voucher connection as logged out
 */
function markLogout(code, mac, timestamp) {
  const voucher = db.prepare(`SELECT * FROM vouchers WHERE code = ?`).get(code);
  if (!voucher) return { found: false };

  db.prepare(`
    UPDATE vouchers SET logout_at = ? WHERE code = ?
  `).run(timestamp, code);

  return {
    found: true,
    voucher: db.prepare(`SELECT * FROM vouchers WHERE code = ?`).get(code)
  };
}

/**
 * Get all vouchers ordered by id
 */
function getAllVouchers() {
  return db.prepare(`SELECT * FROM vouchers ORDER BY id ASC`).all();
}

/**
 * Get usage statistics
 */
function getStats() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM vouchers`).get().count;
  const used = db.prepare(`SELECT COUNT(*) as count FROM vouchers WHERE used_at IS NOT NULL`).get().count;
  const requested = db.prepare(`SELECT COUNT(*) as count FROM vouchers WHERE requested_at IS NOT NULL AND used_at IS NULL`).get().count;
  const unused = db.prepare(`SELECT COUNT(*) as count FROM vouchers WHERE requested_at IS NULL`).get().count;

  return { total, used, requested, unused };
}

/**
 * Insert a voucher code (ignores duplicates)
 */
function insertVoucher(code, type = 'paid') {
  try {
    db.prepare(`INSERT INTO vouchers (code, type) VALUES (?, ?)`).run(code.trim(), type);
    return true;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) return false;
    throw err;
  }
}

/**
 * Get daily report data for a given period
 * @param {string} since - Start timestamp (YYYY-MM-DD HH:mm:ss)
 * @param {string} until - End timestamp (YYYY-MM-DD HH:mm:ss)
 * @returns {{ sellers: Array, totals: Object, period: Object }}
 */
function getDailyReport(since, until) {
  const voucherPrice = parseFloat(process.env.VOUCHER_PRICE) || 1;

  // Per-seller breakdown: vouchers requested (but not yet used) in the period
  const requestedBySeller = db.prepare(`
    SELECT requested_by AS seller,
           COUNT(*) AS requested_count
    FROM vouchers
    WHERE requested_at >= ? AND requested_at < ?
      AND requested_by IS NOT NULL AND used_at IS NULL
    GROUP BY requested_by
    ORDER BY requested_count DESC
  `).all(since, until);

  // Per-seller breakdown: vouchers used in the period
  const usedBySeller = db.prepare(`
    SELECT requested_by AS seller,
           COUNT(*) AS used_count
    FROM vouchers
    WHERE used_at >= ? AND used_at < ?
      AND requested_by IS NOT NULL
    GROUP BY requested_by
    ORDER BY used_count DESC
  `).all(since, until);

  // Build a combined map per seller
  const sellerMap = {};
  for (const row of requestedBySeller) {
    sellerMap[row.seller] = { seller: row.seller, requested: row.requested_count, used: 0, payment: 0 };
  }
  for (const row of usedBySeller) {
    if (!sellerMap[row.seller]) {
      sellerMap[row.seller] = { seller: row.seller, requested: 0, used: 0, payment: 0 };
    }
    sellerMap[row.seller].used = row.used_count;
    sellerMap[row.seller].payment = row.used_count * voucherPrice;
  }

  const sellers = Object.values(sellerMap).sort((a, b) => b.used - a.used);

  // Totals for the period (requested but not yet used)
  const totalRequested = db.prepare(`
    SELECT COUNT(*) AS count FROM vouchers
    WHERE requested_at >= ? AND requested_at < ? AND used_at IS NULL
  `).get(since, until).count;

  const totalUsed = db.prepare(`
    SELECT COUNT(*) AS count FROM vouchers
    WHERE used_at >= ? AND used_at < ?
  `).get(since, until).count;

  // Overall inventory snapshot
  const totalAvailable = db.prepare(`
    SELECT COUNT(*) AS count FROM vouchers WHERE requested_at IS NULL
  `).get().count;

  const totalInInventory = db.prepare(`
    SELECT COUNT(*) AS count FROM vouchers
  `).get().count;

  // Calculate average and max connection time in minutes
  const sessionStats = db.prepare(`
    SELECT 
      MAX((julianday(logout_at) - julianday(used_at)) * 24 * 60) as max_minutes,
      AVG((julianday(logout_at) - julianday(used_at)) * 24 * 60) as avg_minutes
    FROM vouchers
    WHERE used_at IS NOT NULL AND logout_at IS NOT NULL
      AND used_at >= ? AND used_at < ?
  `).get(since, until);

  const totalPaymentFromSellers = sellers.reduce((sum, s) => sum + s.payment, 0);

  return {
    sellers,
    totals: {
      requested: totalRequested,
      used: totalUsed,
      totalPayment: totalPaymentFromSellers,
      availableInStock: totalAvailable,
      totalInInventory: totalInInventory,
      voucherPrice,
      maxSessionMinutes: sessionStats.max_minutes || 0,
      avgSessionMinutes: sessionStats.avg_minutes || 0
    },
    period: { from: since, to: until }
  };
}

module.exports = {
  db,
  getUnusedVoucher,
  markRequested,
  markUsed,
  markLogout,
  getAllVouchers,
  getStats,
  insertVoucher,
  getDailyReport
};
