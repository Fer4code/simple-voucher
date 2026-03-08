/**
 * Test Script: Simulate Telegram /ticket request
 * 
 * This script calls the backend API to request vouchers,
 * mimicking what happens when a salesperson sends /ticket in the Ventas group.
 * 
 * Usage:
 *   node test-ticket.js                    # Request 1 voucher
 *   node test-ticket.js 3                  # Request 3 vouchers
 *   node test-ticket.js 2 "Juan Perez"     # Request 2 as "Juan Perez"
 */

const http = require('http');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const COUNT = parseInt(process.argv[2]) || 1;
const REQUESTER = process.argv[3] || 'Test Salesperson';

function requestVoucher(requester) {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/voucher/request', BASE_URL);
        const body = JSON.stringify({ requester });

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

async function main() {
    console.log(`\n  🎫 Simulating ${COUNT} /ticket request(s) as "${REQUESTER}"...\n`);

    for (let i = 0; i < COUNT; i++) {
        try {
            const result = await requestVoucher(REQUESTER);
            if (result.status === 200) {
                const v = result.data.voucher;
                console.log(`  ✅ [${i + 1}/${COUNT}] Voucher assigned: ${v.code} (requested at: ${v.requested_at})`);
            } else {
                console.log(`  ❌ [${i + 1}/${COUNT}] Error: ${result.data.error || JSON.stringify(result.data)}`);
            }
        } catch (err) {
            console.log(`  ❌ [${i + 1}/${COUNT}] Connection error: ${err.message}`);
            console.log(`     Make sure the server is running at ${BASE_URL}`);
            break;
        }
    }

    console.log('\n  Done! Check the frontend dashboard to see the updates.\n');
}

main();
