// Renders every .post in posts.html to png/<id>.png (2x for sharpness is not needed: sizes are native).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const out = path.join(__dirname, 'png');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await page.goto('file://' + path.join(__dirname, 'posts.html'));
  await page.evaluate(() => document.fonts.ready);
  for (const el of await page.$$('.post')) {
    const id = await el.getAttribute('id');
    await el.screenshot({ path: path.join(out, id + '.png') });
    console.log(id);
  }
  await browser.close();
})();
