import { chromium } from 'playwright';

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  
  await p.setContent('<div id="test"></div>');
  const payload = { text: 'hello' };
  
  const fn = new Function('data', `
    document.getElementById("test").textContent = data.text;
  `);
  
  await p.evaluate(fn as any, payload);
  
  const html = await p.content();
  console.log("HTML:", html);

  await b.close();
})();
