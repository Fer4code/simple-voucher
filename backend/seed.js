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
    node seed.js --rsc mikrotik_import.rsc

  --file: One voucher code per line (defaults to 'paid' type).
  --rsc: Parses a MikroTik .rsc export to extract codes and map profiles to types.
  Duplicate codes are silently skipped.
  `);
}

function seedFromList(codes) {
    let inserted = 0;
    let skipped = 0;

    for (const code of codes) {
        let trimmed = code.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('/') || trimmed.startsWith('#')) continue;

        // If user accidentally imported .rsc with --file
        const match = trimmed.match(/name="([^"]+)"/);
        if (match) {
            trimmed = match[1];
        } else {
            // Also strip headers from Mikrotik exports if they just passed everything
            if (trimmed.includes(' ') || trimmed.length > 20 || trimmed.includes('/ip ')) continue;
        }

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
} else if (args[0] === '--rsc') {
    if (!args[1]) {
        console.error('  Error: Please provide a file path after --rsc');
        process.exit(1);
    }
    const filePath = args[1];
    if (!fs.existsSync(filePath)) {
        console.error(`  Error: File not found: ${filePath}`);
        process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    let inserted = 0;
    let skipped = 0;

    console.log(`  Parsing MikroTik .rsc export from ${filePath}...`);

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('/') || trimmedLine.startsWith('#')) continue;
        if (!trimmedLine.startsWith('add name=')) continue;

        const nameMatch = line.match(/name="([^"]+)"/);
        const profileMatch = line.match(/profile="([^"]+)"/);

        if (nameMatch && profileMatch) {
            const code = nameMatch[1];
            const profile = profileMatch[1];

            let type = 'paid';
            const pLower = profile.toLowerCase();
            if (pLower.includes('friend') && !pLower.includes('not')) {
                type = 'friend';
            } else if (pLower.includes('not quite') || pLower.includes('not-quite')) {
                type = 'nqf';
            }

            if (insertVoucher(code, type)) {
                inserted++;
            } else {
                skipped++;
            }
        }
    }
    console.log(`\n  Done! Inserted: ${inserted}, Skipped (duplicates): ${skipped}\n`);
} else {
    // Comma-separated codes
    const codes = args.join(',').split(',').filter(c => c.trim());
    console.log(`  Seeding ${codes.length} voucher codes...`);
    seedFromList(codes);
}
