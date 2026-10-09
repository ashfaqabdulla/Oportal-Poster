# ==========================================
# Stage 1: Build the UI (React/Vite)
# ==========================================
FROM node:20-alpine AS ui-builder
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# ==========================================
# Stage 2: Runtime with Playwright
# ==========================================
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS runner

WORKDIR /app

# Install root dependencies (tsx must be in "dependencies")
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend services and templates
COPY services/ ./services/
COPY templates/ ./templates/

# Copy built UI from Stage 1 into the public folder
COPY --from=ui-builder /app/ui/dist ./public

# Environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8433
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 8433

# ✅ Run local tsx directly so Node receives SIGTERM/SIGINT (bypassing npx network check)
CMD ["node_modules/.bin/tsx", "services/api/index.ts"]
