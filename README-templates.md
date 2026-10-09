# Nurse Job Poster Templates

Five ready-to-render templates. All share the same seven text fields.

## Layout

\`\`\`
templates/
  fonts/                     <- put Prompt-*.woff2 here
  clinical-clean/            <- teal on near-white, medical cross
  warm-care/                 <- peach gradient, pulse line
  night-shift/               <- dark navy, stars and moon
  emergency-bold/            <- red diagonal bands, high contrast
  pediatric-soft/            <- pastel blobs, soft rounded card
\`\`\`

## Setup

1. Download the Prompt font family (SIL OFL, commercial use OK):
   https://fonts.google.com/specimen/Prompt

2. Convert the three .ttf files to .woff2 (any online converter works)
   and place them in \`templates/fonts/\`:
   - Prompt-Bold.woff2
   - Prompt-Medium.woff2
   - Prompt-Light.woff2

3. Render all five to PNG:

   npx tsx tools/render-all.ts

   You'll get out-clinical-clean.png through out-pediatric-soft.png.

## Fields

Every template accepts these seven:

| id          | maxChars | maxLines |
|-------------|----------|----------|
| title       | 40       | 2        |
| subtitle    | 60       | 2        |
| location    | 30       | 1        |
| salary      | 30       | 1        |
| description | 220      | 5        |
| cta         | 20       | 1        |
| website     | 40       | 1        |

## Notes

- Canvas is 1080x1350 for all five. Renders fast, prints fine at 2x.
- Backgrounds are CSS/SVG - no PNG assets needed. If you later have
  real PSD-derived backgrounds, replace the .canvas background rule
  and swap in <img class="bg" src="background.png">.
- If content exceeds schema limits, render() throws 422. That is
  correct behavior, not a bug.
