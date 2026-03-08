# ─── Stage 1: Build Frontend ─────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Build Backend Dependencies ─────────────────
FROM node:20-alpine AS backend-build

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

# ─── Stage 3: Production Server (clean, no build tools) ──
FROM node:20-alpine AS production

WORKDIR /app

# Copy pre-built node_modules from Stage 2
COPY --from=backend-build /app/node_modules ./node_modules

# Copy backend source
COPY backend/ ./

# Copy built frontend into backend's public folder
COPY --from=frontend-build /app/frontend/dist ./public

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "server.js"]
