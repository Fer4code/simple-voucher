# Voucher Management System

A full-stack system for managing MikroTik hotspot vouchers with a Telegram bot and a React dashboard.


## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Telegram Bot Setup](#telegram-bot-setup)
4. [Telegram Webhook Setup (Production)](#telegram-webhook-setup-production)
5. [Loading Vouchers](#loading-vouchers)
6. [Running the Application](#running-the-application)
7. [Docker Deployment](#docker-deployment)
8. [MikroTik Router Configuration](#mikrotik-router-configuration)
9. [Test Scripts](#test-scripts)
10. [API Reference](#api-reference)

---

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- **Docker** and **Docker Compose** (for production deployment)
- A **Telegram account** to create the bot
- A **MikroTik router** with hotspot configured

---

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd voucher-system
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Create the environment file

```bash
cd backend
cp .env.example .env
```

Then edit `backend/.env` with your actual values (see sections below for how to get each value).

---

## Telegram Bot Setup

### Step 1 - Create a new bot

1. Open Telegram and search for **@BotFather**
2. Send the command `/newbot`
3. Follow the prompts to name your bot
4. BotFather will reply with a **Bot Token** that looks like:
   ```
   123456789:ABCdefGHIjklmNOPqrs-TUVwxyz
   ```
5. Copy this token

### Step 2 - Create the Telegram groups

Create two groups in Telegram:

| Group | Purpose |
|-------|---------|
| **Ventas** | Salespeople send `/ticket` here to get vouchers |
| **Admin** | Receives notifications when vouchers are requested or used |

### Step 3 - Add the bot to both groups

1. Open each group
2. Go to group settings > Add Members
3. Search for your bot's username and add it

> **Important**: The bot must be a member of both groups to send and receive messages.

### Step 4 - Get Group Chat IDs

1. Send any message in one of the groups
2. Open this URL in your browser, replacing `YOUR_BOT_TOKEN` with your actual token:
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
3. Look for `"chat":{"id": -100XXXXXXXXXX}` in the response - this is the **Group Chat ID**
   - It will be a **negative number** (e.g., `-1001234567890`)
4. Repeat for the other group

> **Tip**: If the response is empty, send a message in the group first, then refresh the URL.

### Step 5 - Configure the .env file

Open `backend/.env` and fill in the values:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmNOPqrs-TUVwxyz
VENTAS_GROUP_ID=-1001234567890
ADMIN_GROUP_ID=-1009876543210
PORT=3001
```

> **Important**: Always restart the server after changing the `.env` file.

---

## Telegram Webhook Setup (Production)

By default, the bot uses **polling mode** (good for development). For production, you should use **webhook mode** which is more efficient and reliable.

### Requirements for webhook mode

- Your server must be publicly accessible via HTTPS
- You need a domain name or public IP with a valid SSL certificate

### Step 1 - Set the WEBHOOK_URL

Add this to your `backend/.env` file:

```env
WEBHOOK_URL=https://yourdomain.com
```

When this variable is set, the server will automatically:
1. Register the webhook URL with Telegram
2. Listen for updates at `POST /api/telegram-webhook/<BOT_TOKEN>`

### Step 2 - Ensure HTTPS is configured

Telegram only sends webhooks to HTTPS URLs. Options:

- **Option A**: Use a reverse proxy (nginx/Caddy) with Let's Encrypt SSL in front of the Node.js server
- **Option B**: Use Cloudflare Tunnel to expose your local server

**Example nginx config:**

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 3 - Verify the webhook

After starting the server, verify the webhook is registered:

```
https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
```

You should see your URL in the response with `"has_custom_certificate": false` and `"pending_update_count": 0`.

### Switching back to polling mode

Simply remove or comment out the `WEBHOOK_URL` line in `.env` and restart the server. The bot will automatically use polling mode instead.

---

## Loading Vouchers

Vouchers must be pre-loaded into the database before they can be distributed via Telegram.

### From a comma-separated list

```bash
cd backend
node seed.js VOUCHER001,VOUCHER002,VOUCHER003
```

### From a text file (one voucher code per line)

```bash
cd backend
node seed.js --file vouchers.txt
```

Example `vouchers.txt`:
```
VOUCHER001
VOUCHER002
VOUCHER003
```

> Duplicate codes are automatically skipped.

---

## Running the Application

### Development mode (two terminals)

**Terminal 1 - Backend:**
```bash
cd backend
node server.js
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

- Frontend dev server: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### Production mode (single process)

```bash
cd frontend
npm run build

# Copy built files to backend
# On Windows:
Copy-Item -Recurse -Force .\frontend\dist\* .\backend\public\

# On Linux/Mac:
cp -r frontend/dist/* backend/public/

cd backend
node server.js
# Dashboard at http://localhost:3001
```

---

## Docker Deployment

The easiest way to deploy for production:

```bash
# 1. Make sure backend/.env is configured with your tokens
# 2. Build and start
docker compose up -d --build
```

The dashboard will be available at `http://your-server-ip:3001`

### Useful Docker commands

```bash
# View logs
docker compose logs -f

# Restart after .env changes
docker compose restart

# Rebuild after code changes
docker compose up -d --build

# Stop everything
docker compose down
```

### Data persistence

The SQLite database is stored in the `./data/` directory via a Docker volume mount, so your data survives container restarts and rebuilds.

---

## MikroTik Router Configuration

Configure your MikroTik router's hotspot to send a notification when a voucher is used.

### RouterOS on-login script

```routeros
/ip hotspot user profile
set [find name=default] on-login="/tool fetch url=\"http://SERVER_IP:3001/api/voucher/use\" \
  http-method=post \
  http-content-type=\"application/json\" \
  http-data=\"{\\\"code\\\":\\\"$user\\\",\\\"mac\\\":\\\"$mac-address\\\"}\" \
  keep-result=no"
```

Replace `SERVER_IP` with the IP address of the machine running this system.

### What this does

When a hotspot user authenticates with a voucher code, MikroTik sends a POST request to the backend with:
- `code` - the voucher code used
- `mac` - the MAC address of the connecting device

The backend then:
1. Marks the voucher as used in the database
2. Records the MAC address and timestamp
3. Sends a notification to the Admin Telegram group

---

## Test Scripts

### Simulate a Telegram /ticket request

```bash
cd backend

# Request 1 voucher
node test-ticket.js

# Request 3 vouchers as "Maria"
node test-ticket.js 3 "Maria"
```

### Simulate a MikroTik router callback

```bash
cd backend

# Mark a specific voucher as used (random MAC)
node test-mikrotik.js TEST001

# Mark with a specific MAC address
node test-mikrotik.js TEST001 "AA:BB:CC:DD:EE:FF"

# Mark ALL requested vouchers as used
node test-mikrotik.js all
```

---

## API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/vouchers` | - | List all vouchers |
| GET | `/api/vouchers/stats` | - | Get usage statistics `{ total, used, requested, unused }` |
| POST | `/api/voucher/request` | `{ "requester": "Name" }` | Request an unused voucher (like /ticket) |
| POST | `/api/voucher/use` | `{ "code": "V001", "mac": "AA:BB:CC:DD:EE:FF" }` | Mark voucher as used (MikroTik callback) |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot token from @BotFather |
| `VENTAS_GROUP_ID` | Yes | - | Chat ID of the Ventas Telegram group |
| `ADMIN_GROUP_ID` | Yes | - | Chat ID of the Admin Telegram group |
| `WEBHOOK_URL` | No | - | Public HTTPS URL for webhook mode. Leave empty for polling mode |
| `PORT` | No | 3001 | Server port |
| `DB_PATH` | No | `./data` | Directory where SQLite database is stored |
