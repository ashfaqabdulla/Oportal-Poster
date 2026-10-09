# PosterForge — Project Handover & Dockerization Plan

## 1. Executive Summary
**PosterForge** is a templated poster rendering service. It combines fixed-design templates (HTML/CSS) with variable JSON data to produce rendered PNG/WebP images via a Fastify API. 
The core rendering engine uses **Playwright** (Chromium) as a pure function. A React+Vite frontend (`/ui`) provides a dynamic form-driven interface based on template schemas.

## 2. Project Status
- **Completed:** Loop mechanics, Template system (HTML/CSS/JSON), Sync API (Fastify), 5 Base Templates, React UI.
- **Pending/Next Steps:** Batch API (Phase 5), Browser Context pooling/persistence, hardening the API (queue/concurrency limits).

---

## 3. Full Project Directory Structure
Below is the complete file manifest (excluding `node_modules` and `.git`):

```text
/Poster
├── package.json               # Backend/API dependencies (Fastify, Playwright, tsx)
├── package-lock.json
├── project-brain.md           # Core architectural constraints and decisions
├── project_review.md          # Feedback for production readiness
├── README-templates.md
├── public/                    # Sample output renders
│   ├── out-editorial-light.png
│   ├── out-emerald-clean.png
│   ├── out-glass-navy.png
│   ├── out-navy-glass.png
│   └── out-sky-glass.png
├── services/                  # Core Microservices
│   ├── api/
│   │   └── index.ts           # Fastify HTTP Server (Phase 3+)
│   └── render/
│       └── render.ts          # Playwright Renderer (Pure Function)
├── templates/                 # Declarative Template Modules
│   ├── fonts/                 # Shared local fonts
│   │   ├── Prompt-Bold.woff2
│   │   ├── Prompt-Light.woff2
│   │   └── Prompt-Medium.woff2
│   ├── editorial-light/       # [Template components: html, css, json, assets...]
│   ├── emerald-clean/
│   ├── glass-navy/
│   ├── navy-glass/
│   └── sky-glass/
├── tools/                     # Utility and CLI Scripts
│   ├── generate-sky-glass.ts
│   ├── render-all.ts
│   ├── render-editorial.ts
│   ├── render-emerald-clean.ts
│   ├── render-glass.ts
│   ├── render-navy-glass.ts
│   ├── render-once.ts         # Initial Phase 1 CLI renderer
│   ├── render-sky-glass.ts
│   ├── test-api.ts
│   └── test-eval.ts
└── ui/                        # React + Vite Frontend
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.app.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── index.html
    ├── public/
    │   ├── favicon.svg
    │   └── icons.svg
    └── src/
        ├── App.css
        ├── App.tsx
        ├── index.css
        ├── main.tsx
        └── assets/
```

---

## 4. Architectural Highlights & Constraints
- **Pure Function Renderer:** `render(templateVersion, data, opts) -> Buffer`. It must have zero side-effects.
- **Shrink-To-Fit:** We never auto-wrap or clip text explicitly. If text overflows `data-min-size`, the renderer throws a `422` error.
- **Template Contracts:** The `schema.json` within each template directory dictates required variables, character limits, and lines.

---

## 5. Dockerization Plan
Dockerizing PosterForge introduces a specific challenge because it relies on **Playwright (Chromium)**.

### A. Recommended Docker Strategy (Multi-Stage Build)
Use the official Microsoft Playwright image to avoid nightmare scenarios with missing Linux dependencies (like libnss3, libatk, etc.).

1. **Frontend Build Stage:** Node image to build the `/ui` folder using Vite.
2. **Backend/Runtime Stage:** `mcr.microsoft.com/playwright:v1.48.0-noble` (matching your `package.json` version). 
3. **Execution:** Use `@fastify/static` in the Fastify server to serve the React UI's `dist/` folder alongside the `/v1/render` API endpoints.

### B. Draft `Dockerfile`

```dockerfile
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
# Stage 2: Build & Run API + Playwright
# ==========================================
# Use official Playwright image for OS-level dependencies
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS runner

WORKDIR /app

# Copy root package details and install
COPY package*.json ./
RUN npm ci --omit=dev

# Copy templates and backend services
COPY services/ ./services/
COPY templates/ ./templates/

# Copy the built UI from Stage 1 into a public folder Fastify can serve
COPY --from=ui-builder /app/ui/dist ./public

# Expose the API port
EXPOSE 3000

# Environment settings for Playwright to run optimally in Docker
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Ensure fastify binds to 0.0.0.0, not just localhost
ENV HOST=0.0.0.0 

# Start the Fastify server (Requires updating package.json scripts to have a 'start' command)
# e.g., "start": "tsx services/api/index.ts"
CMD ["npm", "run", "start"]
```

### C. Docker Gotchas & Important Flags
- **Memory Limits (OOM):** Headless Chromium eats memory. Set Docker container memory limits (e.g., `--memory="2g"`) and ensure `p-queue` or similar concurrency limit is applied in `services/api/index.ts`.
- **IPC Space:** Playwright often crashes in Docker due to shared memory limits. Run the container with `--shm-size="1gb"`.
- **Zombie Processes:** Implement proper `process.on('SIGINT')` and `SIGTERM` handlers in the Fastify server to gracefully call `browser.close()` before the Node process exits.

---

## 6. Handover Action Items for Next Developer
1. **Concurrency Control:** Implement browser context reuse in `services/render/render.ts` to prevent launching a new Chromium instance per request.
2. **Batch API:** Build the `/v1/batch` route (Phase 5).
3. **Refactor HTML Constraints:** Modify the renderer so `schema.json` is the sole source of truth for `maxLines`, overriding HTML attributes to ensure consistency.
4. **Finalize API scripts:** Add a stable `"start"` script to the root `package.json` pointing to the API index.
