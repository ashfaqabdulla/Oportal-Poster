# PROJECT BRIEF: PosterForge — Templated Poster Render Service

## Mission
A service that takes fixed-design poster templates + variable data and produces
rendered posters (PNG/WebP) via API. 5 templates to start, authored from PSDs
converted to HTML/CSS. Primary consumer is a developer calling an endpoint;
a thin UI wraps the same API.

## Current status
- Phase 1-4 [COMPLETED]
- Phase 6 (UI) [COMPLETED] — React/Vite app dynamically driven by schema.json.
- Phase 5 (Batch API) — [PENDING]
- 5 templates scaffolded: `editorial-light`, `emerald-clean`, `glass-navy`, `navy-glass`, `sky-glass`.
- API is running on Fastify with SHA-256 caching and concurrency limits.

---

## Non-negotiable architectural constraints

1. **The renderer is a pure function.**
   `render(templateVersion, data, opts) -> Buffer`
   No DB writes, no network calls except fetching assets declared by the template,
   no global mutable state. Everything downstream (caching, batching, retries,
   testing) becomes trivial when this holds. This is the single highest-leverage
   constraint in the project.

2. **Templates are declarative data, never code.**
   HTML + CSS + `data-field` attributes. No arbitrary JS inside templates.
   Text injected via `textContent` — never `innerHTML`.

3. **Template versions are immutable and pinned.**
   Callers always specify `template` + `version`. Never mutate a published version.

4. **One overflow strategy: shrink-to-fit.**
   Do not implement grow-box, clamp, or ellipsis until a specific template fails
   with shrink-to-fit. Let the browser do line breaking — never compute breaks
   manually.

5. **Inputs are constrained at the API boundary.**
   Every field declares `maxChars` and `maxLines` in schema.json. Reject over-limit
   input with a clear 422. Pushing limits upstream deletes entire categories of
   layout bugs before they exist.

6. **Never auto-convert PSDs with a black-box tool.**
   Plonto, Avocode, and similar PSD→HTML tools flatten to a single base64 PNG.
   They produce a *picture* of a poster, not a *template*. We extract geometry
   with a custom ExtendScript and hand-write the HTML/CSS.

7. **Shrink-to-fit has a hard floor. Hitting it is an error, not a fallback.**
   `data-min-size` on each slot is the smallest the design tolerates before it
   stops being the design. If the content doesn't fit at that size, `render()`
   returns 422 with the offending fields. It never shrinks below the floor and
   it never silently clips. Silent clipping is the worst possible outcome:
   the API returns 200 with a broken poster, and the caller finds out on paper.

---

## Tech stack
- Node 20+ / TypeScript, ESM (`"type": "module"`)
- Playwright (Chromium) for rendering — launched ONCE, reused across renders
- tsx for TS execution (with the string-evaluate workaround, see Gotchas)
- Fastify for the API (Phase 3+)
- Postgres for template versions + job records (Phase 3+)
- S3-compatible storage for outputs (Phase 3+)
- React + Vite for UI (Phase 6 only)
- BullMQ/SQS — only if a batch job exceeds ~60s

## Repo layout
```
/services
  /render        # Playwright render service (the pure function)
  /api           # Fastify HTTP layer — calls /render (Phase 3+)
  /ui            # React form + preview (Phase 6 only)
/templates
  /nurses-day
    template.html
    styles.css
    schema.json
    background.png       # flattened PSD, non-text layers only, 2x size
    thumbnail.png
    fonts/
      Prompt-Bold.woff2
      Prompt-Medium.woff2
      Prompt-Light.woff2
/tools
  render-once.ts         # Phase 1 CLI
  convert-fonts.mjs      # ttf -> woff2
  extract-poster.jsx     # ExtendScript, runs in Photoshop
```

---

## Data contracts

### templates/<name>/schema.json
```json
{
  "name": "nurses-day",
  "version": 1,
  "canvas": { "width": 2480, "height": 3508 },
  "fonts": [
    { "family": "Prompt", "weight": 700, "file": "fonts/Prompt-Bold.woff2" },
    { "family": "Prompt", "weight": 500, "file": "fonts/Prompt-Medium.woff2" },
    { "family": "Prompt", "weight": 300, "file": "fonts/Prompt-Light.woff2" }
  ],
  "fields": [
    { "id": "title",       "type": "text", "maxChars": 40,  "maxLines": 2,  "required": true },
    { "id": "date",        "type": "text", "maxChars": 20,  "maxLines": 1,  "required": true },
    { "id": "description", "type": "text", "maxChars": 900, "maxLines": 12 },
    { "id": "website",     "type": "text", "maxChars": 40,  "maxLines": 1 }
  ]
}
```

### Template HTML convention
```html
<div class="canvas">
  <img class="bg" src="background.png" alt="">
  <div class="slot slot--title" data-field="title"
       data-min-size="180" data-max-size="290" data-max-lines="2"></div>
  <!-- one .slot per variable field -->
</div>
```
- Slots are absolutely positioned in PSD pixel space
- Scaling happens via `deviceScaleFactor`, never post-resize
- Background image is 2x the CSS canvas size; browser downscales

### API (Phase 3+)
```
POST /v1/render
  { "template": "nurses-day", "version": 1,
    "data": { "title": "...", "subtitle": "..." },
    "output": { "format": "webp", "scale": 1 } }
  -> 200 { "url": "...", "expiresAt": "..." }
  -> 422 { "error": "title exceeds 40 chars (got 57)" }

POST /v1/batch          # Phase 5 only
  -> 202 { "jobId": "..." }
GET  /v1/templates
GET  /v1/jobs/:id
```

---

## The render loop (core of the system)

```
getBrowser(): launch Chromium ONCE, cache for process lifetime.
  Fallback if `npx playwright install` fails: channel: 'chrome' | 'msedge'

loadTemplate(dir):
  1. read schema.json, template.html, styles.css
  2. inline fonts as data: URIs in CSS
  3. inline background.png as data: URI in HTML
  4. inline CSS into <style> tag
  5. cache by absolute path

render(tpl, data, opts):
  1. validate data against schema -> 422 on failure
  2. compute cacheKey = sha256(schema.name@version + data + opts)
     return cached buffer if present
  3. acquire browser context (not a new browser)
  4. page = context.newPage()
     viewport = canvas dims, deviceScaleFactor = opts.scale
  5. page.setContent(inlinedHTML, { waitUntil: 'load' })
  6. inject text via page.evaluate(STRING FORM) -> textContent
  7. await page.evaluate('document.fonts.ready')   // MANDATORY
  8. shrinkToFit(page)
  9. bytes = await page.screenshot({ type: 'png' })
 10. close page, release context, return bytes
```

### shrinkToFit — the only text algorithm
```js
for (const el of document.querySelectorAll('[data-field]')) {
  const min = +el.dataset.minSize, max = +el.dataset.maxSize;
  const maxLines = +(el.dataset.maxLines || 0);
  if (!min || !max) continue;

  const fits = () => {
    if (el.scrollHeight > el.clientHeight) return false;
    if (maxLines) {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      if (Math.round(el.scrollHeight / lh) > maxLines) return false;
    }
    return true;
  };

  el.style.fontSize = max + 'px';
  if (fits()) continue;

  let lo = min, hi = max;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    el.style.fontSize = mid + 'px';
    if (fits()) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}
```

---

## Gotchas (read before debugging)

### 1. `__name is not defined` — tsx + Playwright
tsx uses esbuild, which injects a `__name` helper around function expressions.
`page.evaluate(fn)` serializes `fn.toString()` and sends it to the browser,
which chokes on the undefined `__name` reference.

**Fix:** pass evaluate bodies as **strings**, not functions.
```ts
// Breaks under tsx:
await page.evaluate((x) => { ... }, data);

// Works:
await page.evaluate(`(x) => { ... }`, data);
```
This is why every `page.evaluate` in the renderer is a template literal.
Do not "clean up" these back to function form.

### 2. PSD reports default font sizes for transformed groups
If text layers live inside groups that were Free-Transformed, the PSD DOM
reports `textItem.size = 19.685` — Photoshop's default for a new text layer —
for every layer. The rendered text is actually 200-300px, but the DOM says 19.685.

**Symptom:** `layers.json` shows identical `sizePx` for wildly different layers.

**Fix:** ignore `sizePx` and `leadingPx` from the JSON entirely. Derive sizes
from `inkBounds` height: `fontSize ≈ boundsHeight / (lineCount * 1.2)`.
Verify by opening the PSD and reading the Character panel — that's ground truth.

### 3. Ink bounds ≠ layout box
PSD `bounds` (ink bounds) clips tight to glyph pixels. CSS boxes include
side-bearings and ascender/descender. In practice:

- Add ~10-15% horizontal padding
- Add ~20% vertical padding
- Set `line-height` explicitly (never rely on defaults)

Without this, text renders ~5-15px high and looks "off" in a way that's hard
to articulate. Every slot in `styles.css` should carry the compensation.

### 4. `document.fonts.ready` before every measure and screenshot
Skipping it means the first render per worker uses fallback metrics — text lands
in the wrong place, wrapping differs, and it's nondeterministic across workers.
Brutal to debug because "sometimes it works."

### 5. Font licensing is a project-killer, check it early
A PSD names a font by PostScript name. That says nothing about web rights.
Verify every font's license BEFORE converting templates. If the brand font
isn't licensable, either ship a metric-compatible substitute or pick a
different font and re-tune the slot.
(Prompt is SIL OFL — fine for commercial use.)

### 6. Chromium download can time out on slow/mirror-blocked networks
`npx playwright install chromium` pulls ~150MB from `cdn.playwright.dev`.
Fixes, in order:
- Use system Chrome: `chromium.launch({ channel: 'chrome' })` — zero download
- Raise timeout: `$env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=300000`
- Use a mirror: `$env:PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright"`

### 7. Auto-converters produce pictures, not templates
Plonto, Avocode, and "PSD to HTML" tools typically flatten everything to one
giant base64 PNG in a single `<div>`. That's a *screenshot*, not a template.
Even the "semantic HTML" modes produce inline-styled `position:absolute` divs
with no clean slot structure.

**Rule:** extract geometry with the custom ExtendScript, hand-build the HTML/CSS.

### 8. Playwright evaluate must run after `setContent` resolves
If you see "Execution context was destroyed" errors, you're running an
evaluate before the page navigation completes. Always `await page.setContent`
with `{ waitUntil: 'load' }` before any evaluate.

---

## PSD extraction procedure (one-time, per template)

### Step 1 — Export flattened background
1. Open PSD, close everything else in Photoshop
2. Identify variable text layers (title, date, description, website)
3. Identify the image placeholder layer — it's variable too, hide it
4. Hide all of the above
5. File → Export → Export As → PNG, Scale 200%, save as `background.png`
6. Verify: PNG shows design with text hidden and image placeholder hidden

### Step 2 — Extract geometry via ExtendScript
`tools/extract-poster.jsx` produces `<name>-layers.json` containing:
- Layer tree with paths and kinds
- `inkBounds` for every layer (absolute document coords)
- `text` object for text layers: contents, font, colors, justification
- `textKind`: "point" or "paragraph"
- `textBox`: paragraph text layout box, or null

See the script file for full details. Guard every property read with try/catch
(Photoshop throws `Error 8800` on black text color, on style-overridden layers,
and on various version regressions).

### Step 3 — Hand-write the template
For each variable text layer, create a `.slot--x` rule:
- `left: inkBounds.left - padX`
- `top: inkBounds.top - padY`
- `width: (inkBounds.right - inkBounds.left) + 2*padX`
- `height: (inkBounds.bottom - inkBounds.top) + 2*padY`
- `font-weight`, `font-size`, `line-height`, `color` from the Character panel

Then run `npm run render` and nudge positions until render matches PSD.

---

## Build order — work phase by phase, checkpoint after each

**Phase 1 — Prove the loop.** [COMPLETED]
CLI script: hardcoded data + one template -> PNG on disk.
Includes shrink-to-fit and the `document.fonts.ready` wait.
CHECKPOINT: `npm run render` produces a correct-looking poster.

**Phase 2 — Templates as data.** [COMPLETED]
Template folder convention, schema.json loader, placeholder injection,
validation against schema.
CHECKPOINT: adding a template folder requires zero code changes.

**Phase 3 — Sync API.** [COMPLETED]
POST /v1/render, single render, content-hash caching, artifact storage,
signed URLs. Browser pool with warm contexts.
CHECKPOINT: 100 sequential renders with correct output and no memory growth.

**Phase 4 — Convert remaining 4 templates.** [COMPLETED]
Expect per-template tuning. Budget 1-2 hours each.

**Phase 5 — Batch.** [PENDING]
POST /v1/batch as a loop over Phase 3. Add queue ONLY if a job exceeds ~60s.
CHECKPOINT: 1000-item batch completes without OOM.

**Phase 6 — UI.** [COMPLETED]
Auto-generated form from schema.json. Debounced low-res preview (~400px,
~300ms) hitting the SAME public API. Full-res only on export.
CHECKPOINT: non-technical user fills a form and downloads a poster.

---

## DO NOT BUILD (guardrails — will feel tempting)

- NO drag-and-drop editor. Form input only.
- NO manual line-break calculation. Let the browser wrap.
- NO Kubernetes, microservices, multi-region.
- NO queue before Phase 5, and only if measurement demands it.
- NO PDF/print path until a user explicitly asks. Color management + canvas
  ceiling rabbit hole.
- NO render-at-huge-then-downscale. Render at target via `deviceScaleFactor`.
- NO arbitrary user HTML in text fields. `textContent` only.
- NO unpinned template versions.
- NO new browser instance per render. Reuse contexts.
- NO new overflow strategy until a real template fails with shrink-to-fit.
- NO auto-converter tools (Plonto, Avocode, etc.).
- NO function-form `page.evaluate` under tsx.

## Definition of done (project level)
- 5 templates renderable via API, versioned and reproducible
- 1000-poster batch completes without intervention
- Output is pixel-consistent across worker restarts (fonts proven)
- Adding template #6 takes <1 hour and no code changes