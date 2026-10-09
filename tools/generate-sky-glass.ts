import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function write(rel: string, content: string) {
    const abs = path.join(ROOT, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
    console.log('  ' + rel);
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="canvas">

    <!-- Full background image: sky gradient + nurse -->
    <img class="bg" src="background.png" alt="" onerror="this.style.display='none'" />

    <!-- Logo (top center) -->
    <div class="logo">
      <img class="logo-img" src="logo.png" alt="" onerror="this.style.display='none'" />
      <div class="logo-text">Oportal</div>
    </div>

    <!-- Hero title (dark blue) -->
    <div class="slot title" data-field="title" data-min-size="52" data-max-size="88" data-max-lines="3"></div>

    <!-- CoS Available (black, bold) -->
    <div class="slot cos-text" data-field="cos" data-min-size="24" data-max-size="38" data-max-lines="1"></div>

    <!-- Subtle glass panel -->
    <div class="glass">

      <div class="row">
        <span class="label">JOB ID :</span>
        <div class="value-wrap">
          <div class="slot value" data-field="job_id" data-min-size="22" data-max-size="34" data-max-lines="1"></div>
        </div>
      </div>

      <div class="row">
        <span class="label">LOCATION :</span>
        <div class="value-wrap">
          <div class="slot value" data-field="location" data-min-size="22" data-max-size="34" data-max-lines="2"></div>
        </div>
      </div>

      <div class="row">
        <span class="label">JOB TITLE :</span>
        <div class="value-wrap">
          <div class="slot value" data-field="job_title" data-min-size="22" data-max-size="34" data-max-lines="2"></div>
        </div>
      </div>

      <div class="row">
        <span class="label">SALARY :</span>
        <div class="value-wrap">
          <div class="slot value" data-field="salary" data-min-size="22" data-max-size="34" data-max-lines="2"></div>
        </div>
      </div>

    </div>

    <!-- Wide white CTA banner -->
    <div class="cta-banner">
      <div class="slot cta-text" data-field="cta" data-min-size="34" data-max-size="52" data-max-lines="1"></div>
    </div>

    <!-- Website footer -->
    <div class="slot website" data-field="website" data-min-size="18" data-max-size="26" data-max-lines="1"></div>

  </div>
</body>
</html>
`;

const CSS = `@font-face { font-family:'Prompt'; font-weight:700; src:url('../fonts/Prompt-Bold.woff2') format('woff2'); }
@font-face { font-family:'Prompt'; font-weight:500; src:url('../fonts/Prompt-Medium.woff2') format('woff2'); }
@font-face { font-family:'Prompt'; font-weight:300; src:url('../fonts/Prompt-Light.woff2') format('woff2'); }

:root {
  --title:      #2A7BA8;
  --cos:        #0B0F14;
  --label:      #2A7BA8;
  --value:      #0B0F14;
  --cta-text:   #2A7BA8;
  --website:    #0B0F14;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

.canvas {
  position: relative;
  width: 1080px;
  height: 1350px;
  overflow: hidden;
  font-family: 'Prompt', sans-serif;
  color: var(--value);
  background: #C9E1F2; /* fallback only */
}

/* ---------- Full background image ---------- */
.bg {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
}

/* ---------- Logo (top center) ---------- */
.logo {
  position: absolute;
  top: 55px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 14px;
}
.logo-img {
  height: 58px;
  width: auto;
  display: block;
}
.logo-text {
  font-size: 40px;
  font-weight: 700;
  color: var(--cos);
  letter-spacing: -0.01em;
}

/* ---------- Slot base ---------- */
.slot {
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

/* ---------- Hero title ---------- */
.title {
  position: absolute;
  top: 165px;
  left: 55px;
  width: 830px;
  height: 250px;
  z-index: 3;
  font-weight: 700;
  font-size: 88px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--title);
}

/* ---------- CoS Available ---------- */
.cos-text {
  position: absolute;
  top: 440px;
  left: 55px;
  width: 500px;
  z-index: 3;
  font-weight: 700;
  font-size: 38px;
  line-height: 1.4;
  color: var(--cos);
  letter-spacing: -0.01em;
}

/* ---------- Subtle glass panel ---------- */
.glass {
  position: absolute;
  top: 530px;
  left: 55px;
  width: 640px;
  z-index: 3;
  padding: 44px 44px 40px;
  border-radius: 28px;
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.55) 0%,
    rgba(220, 235, 250, 0.40) 100%);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow:
    0 20px 50px rgba(42, 123, 168, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 20px;
}

.label {
  flex-shrink: 0;
  width: 175px;
  font-weight: 700;
  font-size: 24px;
  line-height: 1.4;
  color: var(--label);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.value-wrap {
  flex: 1;
}

.value {
  font-weight: 700;
  font-size: 34px;
  line-height: 1.25;
  color: var(--value);
}

/* ---------- Wide white CTA banner ---------- */
.cta-banner {
  position: absolute;
  top: 1085px;
  left: 30px;
  width: 720px;
  height: 130px;
  z-index: 3;
  background: #FFFFFF;
  border-radius: 16px;
  display: flex;
  align-items: center;
  padding-left: 60px;
  box-shadow:
    0 16px 44px rgba(42, 123, 168, 0.18),
    0 4px 12px rgba(42, 123, 168, 0.08);
}

.cta-text {
  font-weight: 700;
  font-size: 52px;
  line-height: 1.4;
  letter-spacing: 0.02em;
  color: var(--cta-text);
  text-transform: uppercase;
}

/* ---------- Website footer ---------- */
.website {
  position: absolute;
  bottom: 55px;
  left: 55px;
  z-index: 4;
  font-weight: 700;
  font-size: 26px;
  line-height: 1.4;
  color: var(--website);
  letter-spacing: 0.01em;
}
`;

const FIELDS = `[
    { "id": "title",     "type": "text", "maxChars": 60, "maxLines": 3, "required": true },
    { "id": "cos",       "type": "text", "maxChars": 20, "maxLines": 1 },
    { "id": "job_id",    "type": "text", "maxChars": 20, "maxLines": 1 },
    { "id": "location",  "type": "text", "maxChars": 40, "maxLines": 2 },
    { "id": "job_title", "type": "text", "maxChars": 40, "maxLines": 2 },
    { "id": "salary",    "type": "text", "maxChars": 40, "maxLines": 2 },
    { "id": "cta",       "type": "text", "maxChars": 20, "maxLines": 1 },
    { "id": "website",   "type": "text", "maxChars": 40, "maxLines": 1 }
  ]`;

const FONTS_BLOCK = `"fonts": [
    { "family": "Prompt", "weight": 700, "file": "../fonts/Prompt-Bold.woff2" },
    { "family": "Prompt", "weight": 500, "file": "../fonts/Prompt-Medium.woff2" },
    { "family": "Prompt", "weight": 300, "file": "../fonts/Prompt-Light.woff2" }
  ],`;

const SCHEMA = `{
  "name": "sky-glass",
  "version": 1,
  "canvas": { "width": 1080, "height": 1350 },
  ${FONTS_BLOCK}
  "fields": ${FIELDS}
}
`;

async function main() {
    console.log('Generating sky-glass...');
    await write('templates/sky-glass/schema.json', SCHEMA);
    await write('templates/sky-glass/template.html', HTML);
    await write('templates/sky-glass/styles.css', CSS);
    console.log('\\nDone.');
    console.log('Next steps:');
    console.log('  1. Copy background.png + logo.png into templates/sky-glass/');
    console.log('  2. Add sky-glass to render-all.ts');
    console.log('  3. Run: npx tsx tools/render-all.ts');
}

main().catch(console.error);