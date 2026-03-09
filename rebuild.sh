#!/bin/bash
# rebuild.sh — Rebuild Docker container with no cache, preserving voucher data
# The SQLite DB lives in ./data (a Docker volume), so it survives rebuilds.

set -e

echo "🛑 Stopping current container..."
docker compose down

echo "🔨 Rebuilding with no cache..."
docker compose build --no-cache

echo "🚀 Starting fresh container..."
docker compose up -d

echo ""
echo "✅ Done! Container rebuilt with latest .env and code."
echo "   Voucher data preserved in ./data volume."
echo ""
echo "📋 Logs:"
docker compose logs -f
