// Renders each .reel in reels.html to reels/<id>.mp4 (10 s, 30 fps) and a cover reels/<id>.png.
// Usage: node render-reels.js [reel-id ...]   (needs ffmpeg)
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FPS = 30;
const DURATION = 10000;

(async () => {
  const out = path.join(__dirname, 'reels');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(__dirname, 'reels.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.fit());
  const ids = process.argv.slice(2).length ? process.argv.slice(2)
    : await page.$$eval('.reel', (els) => els.map((e) => e.id));

  for (const id of ids) {
    await page.evaluate((id) => window.solo(id), id);
    const frames = fs.mkdtempSync(path.join(require('os').tmpdir(), 'reel-'));
    const total = Math.round((DURATION / 1000) * FPS);
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.setT(t), (i * 1000) / FPS);
      await page.screenshot({ path: path.join(frames, String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 95 });
    }
    await page.evaluate((t) => window.setT(t), DURATION);
    await page.screenshot({ path: path.join(out, id + '.png') });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.jpg'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
      path.join(out, id + '.mp4')]);
    fs.rmSync(frames, { recursive: true, force: true });
    console.log(id);
  }
  await browser.close();
})();
