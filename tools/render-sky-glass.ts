import { loadTemplate, render, shutdown } from '../services/render/render.js';
import { writeFileSync } from 'node:fs';

const DATA = {
    title: 'Registered\nAdult Nursing Job',
    cos: 'CoS Available',
    job_id: 'JB2116',
    location: 'Derbyshire\n(England)',
    job_title: 'Staff Nurse\n(Chemotherapy Services)',
    salary: '£32,073 - £39,043\nPer Annum',
    cta: 'Apply Now',
    website: 'joblist.oportal.uk',
};

async function main() {
    const tpl = await loadTemplate('./templates/sky-glass');
    const png = await render(tpl, DATA, { format: 'png', scale: 0.5 });
    writeFileSync('out-sky-glass.png', png);
    console.log('  wrote out-sky-glass.png');
    await shutdown();
}

main().catch(console.error);