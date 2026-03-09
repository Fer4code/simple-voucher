/**
 * Load Test Script for Voucher System
 * 
 * Tests concurrent connections and throughput against the voucher API.
 * Runs from Windows, hitting the remote server.
 * 
 * Usage:
 *   node load-test.js                                # Default: 50 concurrent, 200 total
 *   node load-test.js 100 500                        # 100 concurrent, 500 total requests
 *   node load-test.js 100 500 https://vouchers.com   # Custom URL
 */

const http = require('http');
const https = require('https');

const CONCURRENT = parseInt(process.argv[2]) || 50;
const TOTAL_REQUESTS = parseInt(process.argv[3]) || 200;
const BASE_URL = process.argv[4] || 'http://vouchers.netsvo.com';

const url = new URL(BASE_URL);
const client = url.protocol === 'https:' ? https : http;

// Stats
let completed = 0;
let successes = 0;
let failures = 0;
let responseTimes = [];
let statusCodes = {};
let startTime;

function makeRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve) => {
        const reqStart = Date.now();
        const reqUrl = new URL(endpoint, BASE_URL);

        const options = {
            hostname: reqUrl.hostname,
            port: reqUrl.port,
            path: reqUrl.pathname,
            method,
            headers: {},
        };

        if (body) {
            const bodyStr = JSON.stringify(body);
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const elapsed = Date.now() - reqStart;
                resolve({ status: res.statusCode, elapsed, data });
            });
        });

        req.on('error', (err) => {
            const elapsed = Date.now() - reqStart;
            resolve({ status: 0, elapsed, error: err.message });
        });

        req.setTimeout(30000, () => {
            req.destroy();
            const elapsed = Date.now() - reqStart;
            resolve({ status: 0, elapsed, error: 'timeout' });
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function progressBar(current, total, width = 30) {
    const pct = current / total;
    const filled = Math.round(width * pct);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    return `[${bar}] ${current}/${total} (${(pct * 100).toFixed(0)}%)`;
}

async function runTest(name, endpoint, method = 'GET', bodyFn = null) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  TEST: ${name}`);
    console.log(`  ${method} ${endpoint}`);
    console.log(`  Concurrency: ${CONCURRENT} | Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`${'─'.repeat(60)}\n`);

    completed = 0;
    successes = 0;
    failures = 0;
    responseTimes = [];
    statusCodes = {};
    startTime = Date.now();

    const queue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
    const workers = [];

    for (let w = 0; w < CONCURRENT; w++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const idx = queue.shift();
                if (idx === undefined) break;

                const body = bodyFn ? bodyFn(idx) : null;
                const result = await makeRequest(endpoint, method, body);

                responseTimes.push(result.elapsed);
                statusCodes[result.status] = (statusCodes[result.status] || 0) + 1;

                if (result.status >= 200 && result.status < 400) {
                    successes++;
                } else {
                    failures++;
                }

                completed++;
                process.stdout.write(`\r  ${progressBar(completed, TOTAL_REQUESTS)}`);
            }
        })());
    }

    await Promise.all(workers);

    const totalTime = Date.now() - startTime;
    responseTimes.sort((a, b) => a - b);

    const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const min = responseTimes[0];
    const max = responseTimes[responseTimes.length - 1];
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
    const p90 = responseTimes[Math.floor(responseTimes.length * 0.9)];
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
    const rps = (TOTAL_REQUESTS / (totalTime / 1000)).toFixed(1);

    console.log(`\n\n  RESULTS`);
    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  Total time:      ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`  Requests/sec:    ${rps}`);
    console.log(`  Successes:       ${successes}`);
    console.log(`  Failures:        ${failures}`);
    console.log(`  `);
    console.log(`  Response Times (ms):`);
    console.log(`    Min:    ${min}ms`);
    console.log(`    Avg:    ${avg.toFixed(1)}ms`);
    console.log(`    P50:    ${p50}ms`);
    console.log(`    P90:    ${p90}ms`);
    console.log(`    P95:    ${p95}ms`);
    console.log(`    P99:    ${p99}ms`);
    console.log(`    Max:    ${max}ms`);
    console.log(`  `);
    console.log(`  Status Codes:`);
    for (const [code, count] of Object.entries(statusCodes).sort()) {
        const label = code === '0' ? 'Error/Timeout' : `HTTP ${code}`;
        console.log(`    ${label}: ${count}`);
    }
    console.log();

    return { rps, avg, p95, successes, failures };
}

async function main() {
    console.log(`\n  ⚡ Voucher System Load Test`);
    console.log(`  Target: ${BASE_URL}`);
    console.log(`  Concurrency: ${CONCURRENT} | Total: ${TOTAL_REQUESTS}`);

    // Test 1: GET /api/vouchers (dashboard data)
    await runTest(
        'Fetch Voucher List (Dashboard)',
        '/api/vouchers',
        'GET'
    );

    // Test 2: GET /api/vouchers/stats (pie chart data)
    await runTest(
        'Fetch Stats (Pie Chart)',
        '/api/vouchers/stats',
        'GET'
    );

    // Test 3: POST /api/voucher/request (simulate /ticket)
    await runTest(
        'Request Voucher (Telegram /ticket)',
        '/api/voucher/request',
        'POST',
        (i) => ({ requester: `LoadTest-User-${i}` })
    );

    // Test 4: POST /api/voucher/use (simulate MikroTik)
    await runTest(
        'Mark Voucher Used (MikroTik)',
        '/api/voucher/use',
        'POST',
        (i) => ({
            code: `VCH${String(i + 1).padStart(5, '0')}`,
            mac: `LD:TE:ST:${String(i % 256).padStart(2, '0')}:${String(Math.floor(i / 256) % 256).padStart(2, '0')}:FF`
        })
    );

    console.log(`\n  ✅ Load test complete!\n`);
}

main().catch(console.error);
