import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8932';
const folder=`${base}/library/previews/portfolio/runs/model-spec-service-designer`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:width===390?900:1100},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(folder+'/index.html');
  assert.equal(response.status(),200);
  const panel=page.locator('.portfolio-comparison'),cards=panel.locator('.comparison-grid a');
  assert.equal(await panel.getAttribute('open'),'');
  assert.equal(await cards.count(),3);
  assert.deepEqual(await cards.evaluateAll(items=>items.map(item=>new URL(item.href).pathname.split('/').at(-2))),['library-ambient-service-designer','library-spotlight-service-designer','library-poster-service-designer']);
  assert.deepEqual(await cards.evaluateAll(items=>items.map(item=>item.target)),['_blank','_blank','_blank']);
  assert.equal(await panel.locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0&&image.src.startsWith('data:image/png;base64,'))),true);
  assert.equal(await page.locator('#intro h1').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await panel.screenshot({path:`/tmp/expresso-comparison-${width}.png`});
  if(width===1440){
   const [opened]=await Promise.all([page.waitForEvent('popup'),cards.first().click()]);
   await opened.waitForLoadState();
   assert.match(opened.url(),/library-ambient-service-designer\/index\.html$/);
   assert.equal(await opened.locator('#intro h1').count(),1);
   await opened.close();
  }
  await panel.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await panel.getAttribute('open'),null);
  assert.equal(await cards.first().isVisible(),false);
  await panel.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await panel.getAttribute('open'),'');
  const previewText=await page.locator('.portfolio').textContent();
  await page.goto(folder+'/portfolio.static.html');
  assert.equal(await page.locator('.portfolio-comparison').count(),0);
  assert.equal(await page.locator('.portfolio').textContent(),previewText);
  assert.deepEqual(errors,[]);
  console.log(width,'comparison and pure portfolio passed');
  await page.close();
 }
 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}}),page=await noJs.newPage();
 await page.goto(folder+'/index.html');
 assert.equal(await page.locator('.comparison-grid a').count(),3);
 await page.locator('.portfolio-comparison summary').click();
 assert.equal(await page.locator('.portfolio-comparison').getAttribute('open'),null);
 await noJs.close();
 console.log('no-JavaScript comparison passed');
}finally{await browser.close();}
