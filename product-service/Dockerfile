# -----------------------------------------------------------------------
# Dockerfile — product-service (Lab 06)
# Base:  node:20-alpine  (small, production-ready)
# Port:  3002  (can be overridden via PORT env var)
# -----------------------------------------------------------------------

# ── Runtime stage ────────────────────────────────────────────────────────
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy dependency manifests first (leverages Docker layer cache)
# If only source files change, the npm install layer is reused
COPY package*.json ./

# Install production dependencies only (skips devDependencies like nodemon)
RUN npm install --omit=dev

# Copy the rest of the application source code
COPY . .

# Document the port the app listens on (informational only)
EXPOSE 3002

# Start the Express server
CMD ["node", "server.js"]
