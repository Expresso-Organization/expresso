/* 실행: NODE_PATH=<playwright 설치 경로> node scripts/verify-deck-keyboard.cjs */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.DECK_BASE || 'http://127.0.0.1:8938';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  });
  try {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/${encodeURIComponent('최종-발표-개정.html')}#10`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.deck?.slides[9].dataset.step === '1');
      // 녹화 화면의 autofocus가 실행될 때까지 기다린 뒤 실제 키 입력만 사용합니다.
      await page.waitForTimeout(2500);
      assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'IFRAME');
      await page.keyboard.press('f');
      await page.waitForFunction(() => !!document.fullscreenElement);
      for (let step = 2; step <= 8; step++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(n => deck.i === 9 && deck.slides[9].dataset.step === String(n), step);
        await page.waitForTimeout(step === 6 ? 3000 : 400);
        assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'IFRAME');
      }
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => deck.slides[9].dataset.step === '7');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => deck.slides[9].dataset.step === '8');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => deck.i === 10);
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => deck.i === 9 && deck.slides[9].dataset.step === '8');
      await page.keyboard.press('f');
      await page.waitForFunction(() => !document.fullscreenElement);
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => deck.slides[9].dataset.step === '7');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/expresso-deck-fixed-${reducedMotion}.png` });
      console.log(`PASS ${reducedMotion}: fullscreen, 8 steps, reverse, reentry, exit; no page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
