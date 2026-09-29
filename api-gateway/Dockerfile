# -----------------------------------------------------------------------
# Dockerfile — api-gateway (Lab 07)
# Base:  node:20-alpine  (small, production-ready)
# Port:  3000  (can be overridden via PORT env var)
# -----------------------------------------------------------------------

# ── Runtime stage ────────────────────────────────────────────────────────
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy dependency manifests first (leverages Docker layer cache)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy the rest of the application source code
COPY . .

# Document the port the gateway listens on
EXPOSE 3000

# Start the Express gateway
CMD ["node", "server.js"]
