/**
 * Test Script: Simulate MikroTik Router callback
 * 
 * This script calls the backend API to mark vouchers as used,
 * mimicking the HTTP POST that a MikroTik router sends when
 * a hotspot user connects with a voucher.
 * 
 * Usage:
 *   node test-mikrotik.js TEST001                          # Use with random MAC
 *   node test-mikrotik.js TEST001 "AA:BB:CC:DD:EE:FF"     # Use with specific MAC
 *   node test-mikrotik.js all                              # Use ALL requested vouchers
 */

const http = require('http');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const CODE_ARG = process.argv[2];
const MAC_ARG = process.argv[3];

function randomMAC() {
    return Array.from({ length: 6 }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()
    ).join(':');
}

function markUsed(code, mac) {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/voucher/use', BASE_URL);
        const body = JSON.stringify({ code, mac });

        const req = http.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function getVouchers() {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/vouchers', BASE_URL);
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve([]);
                }
            });
        }).on('error', reject);
    });
}

async function useOne(code, mac) {
    const macAddr = mac || randomMAC();
    try {
        const result = await markUsed(code, macAddr);
        if (result.status === 200) {
            if (result.data.voucher && result.data.voucher.used_at) {
                console.log(`  ✅ Voucher ${code} marked as used (MAC: ${macAddr})`);
            } else if (result.data.message?.includes('already')) {
                console.log(`  ⚠️  Voucher ${code} was already used`);
            } else {
                console.log(`  ✅ ${result.data.message}`);
            }
        } else {
            console.log(`  ❌ Error for ${code}: ${result.data.error || JSON.stringify(result.data)}`);
        }
    } catch (err) {
        console.log(`  ❌ Connection error: ${err.message}`);
        console.log(`     Make sure the server is running at ${BASE_URL}`);
    }
}

async function main() {
    if (!CODE_ARG) {
        console.log(`
  MikroTik Router Simulator
  =========================
  Usage:
    node test-mikrotik.js <VOUCHER_CODE> [MAC_ADDRESS]
    node test-mikrotik.js all

  Examples:
    node test-mikrotik.js TEST001
    node test-mikrotik.js TEST001 "AA:BB:CC:DD:EE:FF"
    node test-mikrotik.js all
    `);
        process.exit(1);
    }

    if (CODE_ARG.toLowerCase() === 'all') {
        console.log('\n  📡 Simulating MikroTik usage for all requested vouchers...\n');
        const vouchers = await getVouchers();
        const requested = vouchers.filter(v => v.requested_at && !v.used_at);

        if (requested.length === 0) {
            console.log('  No requested vouchers found. Run test-ticket.js first.\n');
            return;
        }

        for (const v of requested) {
            await useOne(v.code, randomMAC());
        }
    } else {
        console.log(`\n  📡 Simulating MikroTik usage for voucher ${CODE_ARG}...\n`);
        await useOne(CODE_ARG, MAC_ARG);
    }

    console.log('\n  Done! Check the frontend dashboard to see the updates.\n');
}

main();
