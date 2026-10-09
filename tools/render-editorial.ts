import { loadTemplate, render, shutdown } from '../services/render/render.js';
import { writeFileSync } from 'node:fs';

const DATA = {
    title: 'Registered Adult Nursing Job Registered',
    job_id: '26448',
    cos: 'CoS Available',
    job_title: 'Staff Nurse - Chemotherapy Services ',
    location: 'Derbyshire (England)',
    salary: '£32,073 - £39,043 Per Annum',
    website: 'joblist.oportal.uk',
};

async function main() {
    console.log('Rendering editorial...');
    const tpl = await loadTemplate('./templates/editorial-light');
    const png = await render(tpl, DATA, { format: 'png', scale: 1 });
    writeFileSync('out-editorial-light.png', png);
    console.log('  wrote out-editorial-light.png');
    await shutdown();
}

main().catch(console.error);
