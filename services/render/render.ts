import { chromium, type Browser } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let browser: Browser | null = null;

/**
 * Initializes and caches a single Playwright Chromium browser instance for the lifetime
 * of the Node process. We reuse this instance to dramatically improve performance.
 */
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  }
  return browser;
}

/**
 * Closes the cached browser instance. Must be called before process exit to avoid zombie processes.
 */
export async function shutdown() {
  await browser?.close();
  browser = null;
}

/** Represents a single configurable slot within a template's schema.json */
export interface Field {
  id: string;
  type: 'text' | 'image';
  maxChars?: number;
  maxLines?: number;
  required?: boolean;
}

/** The structure of a template's schema.json */
export interface Schema {
  name: string;
  version: number;
  canvas: { width: number; height: number };
  fields: Field[];
}

/**
 * A loaded template ready for rendering. 
 * The `html` string has all fonts, images, and stylesheets completely inlined via base64 data URIs.
 */
export interface Template {
  dir: string;
  schema: Schema;
  html: string;
}

export class RenderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- Template loading: read once, inline all assets ----------
// We cache parsed templates by their absolute directory path so subsequent renders are nearly instantaneous.
const templateCache = new Map<string, Template>();

/**
 * Loads a template from disk. This reads the schema, HTML, and CSS, and then automatically
 * base64-encodes all external assets (like local fonts and background images). 
 * This creates a single, self-contained HTML string that Playwright can render instantly 
 * without making any network or disk requests.
 * 
 * @param dir The relative or absolute path to the template directory (e.g., './templates/warm-care')
 */
export async function loadTemplate(dir: string): Promise<Template> {
  const abs = path.resolve(dir);
  if (templateCache.has(abs)) return templateCache.get(abs)!;

  const schema = JSON.parse(await readFile(path.join(abs, 'schema.json'), 'utf8')) as Schema;
  let html = await readFile(path.join(abs, 'template.html'), 'utf8');
  let css  = await readFile(path.join(abs, 'styles.css'), 'utf8');

  // Inline CSS assets (fonts) as data URIs
  css = await inlineUrls(css, abs);
  // Inline HTML assets (background.png) as data URIs
  html = await inlineSrcs(html, abs);
  // Inline the stylesheet itself
  html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);

  const tpl: Template = { dir: abs, schema, html };
  templateCache.set(abs, tpl);
  return tpl;
}

/**
 * Parses a CSS string, finds all `url(...)` declarations, and resolves the files relative to 
 * the provided `dir`. It then base64-encodes the files and replaces the URLs with data URIs.
 * This is primarily used to inline font files like .woff2 directly into the stylesheet.
 */
async function inlineUrls(css: string, dir: string): Promise<string> {
  const re = /url\(['"]?([^'")]+)['"]?\)/g;
  const matches = [...css.matchAll(re)];
  for (const [, rel] of matches) {
    if (rel.startsWith('data:')) continue;
    const buf = await readFile(path.join(dir, rel));
    const mime = rel.endsWith('.woff2') ? 'font/woff2'
               : rel.endsWith('.woff')  ? 'font/woff'
               : rel.endsWith('.png')   ? 'image/png'
               : 'application/octet-stream';
    css = css.replaceAll(rel, `data:${mime};base64,${buf.toString('base64')}`);
  }
  return css;
}

/**
 * Parses an HTML string, finds all `<img src="...">` tags, resolves the local files, 
 * base64-encodes them, and replaces the src attribute with data URIs.
 * This is primarily used to inline the main background.png of the template.
 */
async function inlineSrcs(html: string, dir: string): Promise<string> {
  const re = /src="([^"]+)"/g;
  const matches = [...html.matchAll(re)];
  for (const [, rel] of matches) {
    if (rel.startsWith('data:') || rel.startsWith('http')) continue;
    try {
      const buf = await readFile(path.join(dir, rel));
      const mime = rel.endsWith('.png') ? 'image/png'
                 : rel.endsWith('.jpg') || rel.endsWith('.jpeg') ? 'image/jpeg'
                 : rel.endsWith('.webp') ? 'image/webp'
                 : 'application/octet-stream';
      html = html.replaceAll(`src="${rel}"`, `src="data:${mime};base64,${buf.toString('base64')}"`);
    } catch (e) {
      console.warn(`    Warning: Could not inline ${rel}`);
    }
  }
  return html;
}

// ---------- Validation ----------
/**
 * Strict data validation against a template's schema.
 * Checks for missing required fields, enforces strict string typing, 
 * and ensures string lengths don't exceed the `maxChars` limits.
 */
export function validate(schema: Schema, data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const f of schema.fields) {
    const v = data[f.id];
    if (f.required && (v == null || v === '')) {
      errors.push(`${f.id} is required`);
      continue;
    }
    if (v == null) continue;
    if (f.type === 'text' && typeof v === 'string' && f.maxChars != null) {
      if (v.length > f.maxChars) {
        errors.push(`${f.id} exceeds ${f.maxChars} chars (got ${v.length})`);
      }
    }
    if (typeof v !== 'string') {
      errors.push(`${f.id} must be a string`);
    }
  }
  return errors;
}

// ---------- The render function (pure) ----------
export interface RenderOpts {
  format?: 'png' | 'webp';
  scale?: number;   // deviceScaleFactor; default 1 (e.g. 0.5 cuts resolution in half)
}

/**
 * The core render engine. This is a pure function: it takes a template and data, 
 * and outputs a buffer. It handles schema validation, Playwright context creation, 
 * data injection, dynamic shrink-to-fit typography, and screenshotting.
 * 
 * @param tpl The loaded and inlined Template object
 * @param data The key-value payload to inject into the template placeholders
 * @param opts Rendering options (format and resolution scale)
 */
export async function render(
  tpl: Template,
  data: Record<string, unknown>,
  opts: RenderOpts = {}
): Promise<Buffer> {
  const errors = validate(tpl.schema, data);
  if (errors.length) throw new RenderError(422, errors.join('; '));

  const { width, height } = tpl.schema.canvas;
  const scale = opts.scale ?? 1;
  const format = opts.format ?? 'png';

  const b = await getBrowser();
  const context = await b.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });

  try {
    const page = await context.newPage();
    await page.setContent(tpl.html, { waitUntil: 'load' });

    // Inject text via textContent (never innerHTML)
    const injectFn = new Function('payload', `
      for (const [id, val] of Object.entries(payload)) {
        const el = document.querySelector(\`[data-field="\${id}"]\`);
        if (!el || typeof val !== 'string') continue;
        if (el.tagName.toLowerCase() === 'img') {
          el.src = val;
        } else if (el.dataset.type === 'image') {
          el.style.backgroundImage = 'url(' + val + ')';
        } else {
          el.textContent = val;
        }
      }
    `);
    await page.evaluate(injectFn as any, data);

    // Mandatory: wait for fonts before measuring
    await page.evaluate('document.fonts.ready');

    // Shrink-to-fit
    const fitFn = new Function('schemaFields', `
      const failures = [];
      const fieldMap = new Map(schemaFields.map(f => [f.id, f]));
      
      for (const el of document.querySelectorAll('[data-field]')) {
        const fieldId = el.dataset.field;
        const field = fieldMap.get(fieldId);
        if (!field) continue;
        
        const minStr = el.dataset.minSize;
        const maxStr = el.dataset.maxSize;
        if (!minStr || !maxStr) continue;

        const min = +minStr;
        const max = +maxStr;
        const maxLines = field.maxLines || 0;

        const fits = () => {
          // Temporarily remove fixed height to measure true content height
          const originalHeight = el.style.height;
          const originalMaxHeight = el.style.maxHeight;
          const beforeHeight = el.clientHeight;
          
          el.style.height = 'auto';
          el.style.maxHeight = 'none';
          
          const contentHeight = el.scrollHeight;
          const autoHeight = el.clientHeight;
          
          el.style.height = originalHeight;
          el.style.maxHeight = originalMaxHeight;

          const hasFixedHeight = Math.abs(beforeHeight - autoHeight) > 2;

          // If it has a fixed height, ensure it fits visually without clipping.
          if (hasFixedHeight && contentHeight > el.clientHeight + 6) return false;

          if (maxLines) {
            const style = getComputedStyle(el);
            const lh = parseFloat(style.lineHeight);
            const pt = parseFloat(style.paddingTop);
            const pb = parseFloat(style.paddingBottom);
            if (Math.round((autoHeight - pt - pb) / lh) > maxLines) return false;
          } else if (!hasFixedHeight) {
            // Fallback if no maxLines and no fixed height
            if (contentHeight > el.clientHeight + 6) return false;
          }
          return true;
        };

        // Fast path: does max size fit?
        el.style.fontSize = max + 'px';
        if (fits()) continue;

        // Binary search
        let lo = min, hi = max;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          el.style.fontSize = mid + 'px';
          if (fits()) lo = mid; else hi = mid;
        }
        el.style.fontSize = lo + 'px';
        
        if (!fits()) {
          const lh = parseFloat(getComputedStyle(el).lineHeight);
          failures.push({
            field: el.dataset.field,
            fontSize: lo,
            minSize: min,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            lineHeight: lh,
            computedLines: el.scrollHeight / lh,
            maxLines,
            text: el.textContent
          });
        }
      }
      return failures;
    `);
    const overflowFailures = await page.evaluate(fitFn as any, tpl.schema.fields) as any[];
    if (overflowFailures.length) {
      throw new RenderError(422, `fields do not fit at minimum font size: ${
        JSON.stringify(overflowFailures, null, 2)
      }`);
    }

    const png = await page.screenshot({ type: 'png', fullPage: false });

    if (format === 'webp') {
      const sharp = (await import('sharp')).default;
      return await sharp(png).webp({ lossless: true }).toBuffer();
    }
    return png;
  } finally {
    await context.close();
  }
}