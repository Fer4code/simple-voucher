#!/usr/bin/env node
const fs = require('fs');
const { insertVoucher } = require('./db');

function printUsage() {
    console.log(`
  Voucher Seed Tool
  =================
  Usage:
    node seed.js CODE1,CODE2,CODE3,...
    node seed.js --file vouchers.txt

  The text file should have one voucher code per line.
  Duplicate codes are silently skipped.
  `);
}

function seedFromList(codes) {
    let inserted = 0;
    let skipped = 0;

    for (const code of codes) {
        const trimmed = code.trim();
        if (!trimmed) continue;

        if (insertVoucher(trimmed)) {
            inserted++;
        } else {
            skipped++;
        }
    }

    console.log(`\n  Done! Inserted: ${inserted}, Skipped (duplicates): ${skipped}\n`);
}

const args = process.argv.slice(2);

if (args.length === 0) {
    printUsage();
    process.exit(1);
}

if (args[0] === '--file') {
    if (!args[1]) {
        console.error('  Error: Please provide a file path after --file');
        process.exit(1);
    }
    const filePath = args[1];
    if (!fs.existsSync(filePath)) {
        console.error(`  Error: File not found: ${filePath}`);
        process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const codes = content.split(/\r?\n/).filter(line => line.trim());
    console.log(`  Loading ${codes.length} voucher codes from ${filePath}...`);
    seedFromList(codes);
} else {
    // Comma-separated codes
    const codes = args.join(',').split(',').filter(c => c.trim());
    console.log(`  Seeding ${codes.length} voucher codes...`);
    seedFromList(codes);
}
