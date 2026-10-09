/**
 * render-all.ts
 * 
 * A CLI utility script to render a batch of templates iteratively.
 * It loops through an array of template names, loading and rendering
 * each one with the same data payload, and outputs a series of PNG files.
 */
import { loadTemplate, render, shutdown } from '../services/render/render.js';
import { writeFileSync } from 'node:fs';

const DATA = {
  title: 'Registered Nurse — Critical Care',
  location: 'Bengaluru, India',
  salary: '\u20B96\u20139 LPA + benefits',
  cta: 'Apply Now',
  website: 'joblist.oportal.uk',
  job_id: 'JB2116',
  job_title: 'Staff Nurse',
  cos: 'CoS Available'
};

// const templates = ['clinical-clean', 'warm-care', 'joblist-long', 'joblist-short', 'joblist-medium', 'night-shift', 'emergency-bold', 'pediatric-soft'];
const templates = ['editorial-light', 'glass-navy', 'navy-glass', 'emerald-clean'];

for (const name of templates) {
  console.log('rendering ' + name + '...');
  const tpl = await loadTemplate('./templates/' + name);
  const png = await render(tpl, DATA, { format: 'png', scale: 0.5 });
  writeFileSync('out-' + name + '.png', png);
  console.log('  wrote out-' + name + '.png');
}

await shutdown();
