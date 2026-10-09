import { loadTemplate, render, shutdown } from '../services/render/render.js';
import { writeFileSync } from 'node:fs';

const DATA = {
  title: 'Registered Adult Nursing Job',
  cos: 'CoS Available',
  job_id: 'JB2118',
  job_title: 'Staff Nurse Ward Registered Adult Nursing',
  location: 'Gloucestershire (England)\nGloucestershire (England)',
  salary: '32,073 - £39,043 Per Annum',
  cta: 'Apply Now'
};

async function main() {
  const tpl = await loadTemplate('./templates/emerald-clean');
  const png = await render(tpl, DATA, { format: 'png', scale: 1 });
  writeFileSync('out-emerald-clean.png', png);
  console.log('  wrote out-emerald-clean.png');
  await shutdown();
}

main().catch(console.error);
