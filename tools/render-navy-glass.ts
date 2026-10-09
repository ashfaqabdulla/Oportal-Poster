import { loadTemplate, render, shutdown } from '../services/render/render.js';
import { writeFileSync } from 'node:fs';

const DATA = {
    title: 'Registered Adult Nursing Job',
    cos: 'CoS Available',
    job_id: 'JB2116',
    job_title: 'Staff Nurse - Chemotherapy Services',
    location: 'Derbyshire (England)',
    salary: '£32,073 - £39,043 Per Annum',
    cta: 'Apply Now',
    website: 'joblist.oportal.uk',
};

async function main() {
    const tpl = await loadTemplate('./templates/navy-glass');
    const png = await render(tpl, DATA, { format: 'png', scale: 0.5 });
    writeFileSync('out-navy-glass.png', png);
    console.log('  wrote out-navy-glass.png');
    await shutdown();
}

main().catch(console.error);