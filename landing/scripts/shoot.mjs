/* Screenshot the journey stations: node scripts/shoot.mjs [url] */
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5199/';
const out = (n) => `/tmp/shots/${n}.png`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});

async function shoot(label, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => {
    sessionStorage.setItem('booted', '1');
    document.getElementById('boot')?.classList.add('done');
    document.body.classList.add('booted');
  });
  await page.waitForFunction('window.__redsight && window.__redsight.ready === true', { timeout: 12000 }).catch(() => {});
  await page.waitForFunction('window.__journey !== undefined', { timeout: 6000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1100));
  await page.screenshot({ path: out(`${label}-hero`) });

  const ids = await page.$$eval('[data-cam]', (els) => els.map((el) => el.id || el.dataset.cam));
  for (let i = 1; i < ids.length; i++) {
    await page.evaluate((idx) => window.__journey.go(idx), i);
    await page.waitForFunction(
      (idx) => window.__journey && Math.abs(window.__journey.cur - idx) < 0.02,
      { timeout: 20000 }, i
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({ path: out(`${label}-${ids[i]}`) });
  }
  await page.close();
  console.log(label, 'done:', ids.join(','));
}

await shoot('desktop', { width: 1440, height: 900 });
await shoot('mobile', { width: 390, height: 844 });
await browser.close();
console.log('ALL SHOTS DONE');
