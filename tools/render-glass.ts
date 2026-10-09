import { loadTemplate, render, shutdown } from '../services/render/render.js';
import { writeFileSync } from 'node:fs';

const DATA = {
  title: 'Registered Adult Nursing Job Registered',
  job_id: '26448',
  cos: 'CoS Available',
  job_title: 'Staff Nurse - Chemotherapy Services Staff Nu',
  location: 'Derbyshire (England)',
  salary: '£32,073 - £39,043 Per Annum',
  website: 'joblist.oportal.uk',
};

async function main() {
  console.log('Rendering glass-navy...');
  const tpl = await loadTemplate('./templates/glass-navy');
  const png = await render(tpl, DATA, { format: 'png', scale: 1 });
  writeFileSync('out-glass-navy2.png', png);
  console.log('  wrote out-glass-navy2.png');
  await shutdown();
}

main().catch(console.error);
