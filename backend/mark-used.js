const http = require('http');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const CODE_ARG = process.argv[2];
const MAC_ARG = process.argv[3];

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

async function main() {
    if (!CODE_ARG) {
        console.log(`
  Usage:
    node mark-used.js <VOUCHER_CODE> [MAC_ADDRESS]

  Examples:
    node mark-used.js TEST001
    node mark-used.js TEST001 "AA:BB:CC:DD:EE:FF"
        `);
        process.exit(1);
    }

    const macAddr = MAC_ARG || 'AA:BB:CC:DD:EE:FF';
    console.log(`\n📡 Marking voucher ${CODE_ARG} as used with MAC ${macAddr}...\n`);

    try {
        const result = await markUsed(CODE_ARG, macAddr);
        if (result.status === 200) {
            console.log(`✅ Success:`, result.data);
        } else {
            console.log(`❌ Error ${result.status}:`, result.data);
        }
    } catch (err) {
        console.log(`❌ Connection error: ${err.message}`);
    }
}

main();
