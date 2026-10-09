/**
 * render-once.ts
 * 
 * A CLI utility script to render a single template for testing purposes (Phase 1/2).
 * It loads the 'nurses-day' template, injects the provided DATA payload,
 * and writes the resulting PNG to the file system.
 */
import { loadTemplate, render, shutdown } from '../services/render/render.js';
import { writeFileSync } from 'node:fs';

const DATA = {
  title: 'International',
  date: '12th May',
  description:
    'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  website: 'www.inursesday.com',
};

const tpl = await loadTemplate('./templates/nurses-day');
const png = await render(tpl, DATA, { format: 'png', scale: 0.5 });

writeFileSync('out.png', png);
console.log(`wrote out.png (${png.length} bytes)`);

await shutdown();