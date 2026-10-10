# Stage 1: Build React/Vite frontend
FROM node:20-alpine AS ui-builder

WORKDIR /app/ui

COPY ui/package*.json ./
RUN npm ci

COPY ui/ ./
RUN npm run build

# Stage 2: Run Fastify API and Playwright
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS runner

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY services/ ./services/
COPY templates/ ./templates/

COPY --from=ui-builder /app/ui/dist ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 3000

CMD ["node_modules/.bin/tsx", "services/api/index.ts"]
