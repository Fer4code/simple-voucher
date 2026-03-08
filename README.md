# 📡 Voucher Management System

A full-stack system for managing MikroTik hotspot vouchers with a Telegram bot and React dashboard.

## Quick Start (Docker)

```bash
# 1. Configure environment
cp backend/.env.example backend/.env
# 2. Edit backend/.env with your tokens (see below)
# 3. Seed vouchers
cd backend && npm install && node seed.js V001,V002,V003 && cd ..
# 4. Deploy
docker compose up -d --build
# Dashboard at http://your-server:3001
```

## Quick Start (Development)

```bash
# Backend
cd backend
npm install
node seed.js V001,V002,V003,V004,V005
node server.js

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:5173
```

---

## 🔑 Setting Up Telegram Tokens

### Step 1: Create the Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the **Bot Token** (looks like `123456789:ABCdefGHIjklmNOPqrs-TUVwxyz`)

### Step 2: Create the Groups

1. Create two Telegram groups:
   - **Ventas** (for salesperson voucher requests)
   - **Admin** (for usage notifications)
2. **Add the bot** to both groups as a member

### Step 3: Get Group Chat IDs

The easiest way to get chat IDs:

1. Add the bot to the group
2. Send any message in the group
3. Open this URL in your browser (replace `YOUR_BOT_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. Find the `"chat":{"id": ...}` value — this is the group ID (it's a **negative number** like `-1001234567890`)
5. Repeat for the other group

### Step 4: Configure `.env`

Edit `backend/.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmNOPqrs-TUVwxyz
VENTAS_GROUP_ID=-1001234567890
ADMIN_GROUP_ID=-1009876543210
PORT=3001
```

> ⚠️ **Important**: The `.env` file must be in the `backend/` folder. Restart the server after changing it.

---

## 🎫 Loading Vouchers

Vouchers must be pre-loaded into the database before they can be distributed:

```bash
cd backend

# From comma-separated list
node seed.js VOUCHER001,VOUCHER002,VOUCHER003

# From a text file (one code per line)
node seed.js --file vouchers.txt
```

---

## 🧪 Test Scripts

### Simulate Telegram `/ticket` (voucher request)

```bash
cd backend

# Request 1 voucher
node test-ticket.js

# Request 3 vouchers as "Maria"
node test-ticket.js 3 "Maria"
```

### Simulate MikroTik Router (voucher usage)

```bash
cd backend

# Mark a specific voucher as used
node test-mikrotik.js TEST001

# Mark with a specific MAC address
node test-mikrotik.js TEST001 "AA:BB:CC:DD:EE:FF"

# Mark ALL requested vouchers as used
node test-mikrotik.js all
```

---

## 🔌 MikroTik Configuration

Configure your MikroTik router to send an HTTP POST when a hotspot voucher is used.

### On-Login Script (RouterOS)

```routeros
/ip hotspot user profile
set [find name=default] on-login="/tool fetch url=\"http://YOUR_SERVER_IP:3001/api/voucher/use\" \
  http-method=post http-content-type=\"application/json\" \
  http-data=\"{\\\"code\\\":\\\"$user\\\",\\\"mac\\\":\\\"$mac-address\\\"}\" \
  keep-result=no"
```

Replace `YOUR_SERVER_IP` with the IP address of the server running this system.

---

## API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/vouchers` | — | List all vouchers |
| `GET` | `/api/vouchers/stats` | — | Usage statistics |
| `POST` | `/api/voucher/request` | `{ "requester": "Name" }` | Request a voucher (like /ticket) |
| `POST` | `/api/voucher/use` | `{ "code": "V001", "mac": "AA:BB:..." }` | Mark voucher as used (MikroTik) |
