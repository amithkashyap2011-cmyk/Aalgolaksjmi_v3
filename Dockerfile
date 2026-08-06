# HFT Quantitative Trading Platform Dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./

# Define separate server and client builds if monorepo
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies concurrently for monorepo efficiency
RUN npm install
RUN cd server && npm install
RUN cd client && npm install

COPY . .

# Build Client
RUN cd client && npm run build

# Build Server (TSC)
RUN cd server && npm run build

# Stage 2: Production Environment
FROM node:20-alpine AS production
ENV NODE_ENV=production

WORKDIR /app
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/client/dist ./client/dist

# Install only production server deps
RUN cd server && npm ci --production

# Expose API gateway / WebSockets port
EXPOSE 3000

# Start HFT orchestrator service
CMD ["node", "server/dist/index.js"]
