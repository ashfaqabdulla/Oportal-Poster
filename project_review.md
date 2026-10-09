# Project Review & Architecture Feedback

Here is a comprehensive review of the `Poster` project, focusing on the rendering engine, template architecture, and our upcoming production deployment. 

Overall, the core architecture is extremely solid. The constraint-based auto-shrink engine is a brilliant approach for dynamic text, and standardizing templates into HTML/CSS/JSON bundles makes the system highly scalable.

However, there are a few architectural quirks and optimization opportunities we should address before pushing this to a production server.

---

## 1. The Render Engine (`services/render/render.ts`)

### **What's Working Well:**
*   **Binary Search Auto-Shrink:** Using a binary search between `data-min-size` and `data-max-size` is highly efficient compared to shrinking by 1px in a linear loop.
*   **Shadow Bleed Fix:** Our recent update to check for `hasFixedHeight` successfully solved the Chromium `scrollHeight` bug where text-shadows caused false-positive overflow errors.

### **Recommended Updates:**
*   **Asset Loading is Brittle:** Currently, the engine uses Regex to find `src="..."` and `url(...)` and replaces them with inline base64 strings. This is fragile and can easily break on complex CSS or HTML. 
    *   **Fix:** Instead of regex inlining, we should use Puppeteer's request interception to serve local files directly, or simply inject a `<base href="file:///...">` tag into the HTML `<head>`.
*   **Browser Instance Pooling:** Right now, every call to `render()` launches a brand new Chromium browser (`puppeteer.launch()`) and closes it. This is very slow (~500ms+ overhead per render) and CPU intensive.
    *   **Fix:** We need to implement a persistent browser instance or use `puppeteer-cluster` to reuse browser pages across multiple API requests.
*   **Magic Numbers:** The `6px` tolerance is still hardcoded. It would be safer to dynamically calculate tolerance based on `lineHeight * 0.1` or completely rely on line counting.

---

## 2. Template Architecture

### **What's Working Well:**
*   **Componentization:** Keeping `template.html`, `styles.css`, and `schema.json` in isolated folders per design makes it incredibly easy for designers to drop in new templates without touching the TypeScript backend.
*   **Slot System:** The `class="slot" data-field="title"` pattern is clean and standardizes how the engine injects text.

### **Recommended Updates:**
*   **Violating DRY (Don't Repeat Yourself):** Currently, constraints like `maxLines` exist in **both** `schema.json` and `template.html` (`data-max-lines="2"`). This caused our earlier bug where the schema disagreed with the HTML. 
    *   **Fix:** `schema.json` should be the single source of truth. The engine should read `schema.json` and automatically enforce `maxLines`, ignoring whatever is hardcoded in the HTML.
*   **Template CSS Variables:** We should standardize a set of CSS variables (`--primary`, `--accent`) across all templates so that colors can be overridden dynamically via the API (e.g., passing a company's brand colors in the API payload).

---

## 3. API & Production Readiness (Phase 3)

We previously discussed building a native Node.js HTTP server. Before taking it live, we must address these production risks:

### **Recommended Updates:**
*   **Concurrency Limits:** Puppeteer takes about 100-200MB of RAM per open page. If the API receives 50 requests at once, the server will instantly run out of memory (OOM) and crash. 
    *   **Fix:** Implement a queue (like `p-queue`) to limit concurrent renders to `Math.max(1, os.cpus().length - 1)`.
*   **Timeouts & Zombie Processes:** If a template has a broken script or infinite loop, Puppeteer will hang forever, leaving a "zombie" Chrome process running on the server.
    *   **Fix:** Enforce a strict `timeout: 10000` (10 seconds) on all Puppeteer operations, and ensure `browser.close()` runs inside a `finally` block even if the server crashes.
*   **API Validation:** The HTTP endpoint needs strict schema validation. If a user submits a payload missing a `required: true` field from `schema.json`, the API should immediately reject it with a `400 Bad Request` before even booting up Puppeteer.

---

## Proposed Next Steps

If you agree with this assessment, here is the order in which we should tackle the updates:

1.  **Refactor `render.ts`** to use a persistent Browser instance (dramatically increasing render speed).
2.  **Unify Constraints:** Make `schema.json` the single source of truth for `maxLines` so we don't have to update both HTML and JSON anymore.
3.  **Build the Production API:** Wrap the engine in a hardened native HTTP server with concurrency queuing and timeout protections.
4.  **Tackle the Canva Design:** Finally implement the `Oportal Template - 1` design you embedded earlier.

How does this roadmap look to you? Let me know which step you'd like to dive into first!
