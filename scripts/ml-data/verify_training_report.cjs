/* 학습 리포트의 화면 크기별 내용, 그래프, 링크와 인쇄 레이아웃을 확인합니다. */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require(process.env.EXPRESSO_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const output = path.join(root, 'var/reports/p5-training-results-2026-09-06-qa');
  fs.mkdirSync(output, {recursive:true});
  const executablePath = process.env.EXPRESSO_CHROME_PATH || [
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(p=>fs.existsSync(p));
  if(!executablePath)throw new Error('Installed Chromium is required; set EXPRESSO_CHROME_PATH');
  const browser = await chromium.launch({executablePath, headless:true});
  const page = await browser.newPage();
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  const url=pathToFileURL(path.join(root,'docs/p5-model-training-results-2026-09-06.html')).href;
  const results=[];
  for(const [width,height] of [[1440,1000],[900,1000],[390,844],[360,800]]) {
    await page.setViewportSize({width,height});
    await page.goto(url,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const state=await page.evaluate(()=>({sections:document.querySelectorAll('main .sec').length,figures:document.querySelectorAll('main figure.fig').length,toc:document.querySelectorAll('#tocList li').length,overflow:document.documentElement.scrollWidth>innerWidth,brokenSvgReferences:[...document.querySelectorAll('main svg use')].filter(n=>!document.getElementById((n.getAttribute('href')||n.getAttribute('xlink:href')||'').slice(1))).length,placeholders:/문서 제목을|이 양식의 부품|무슨 일이 있었고/.test(document.querySelector('main').innerText)}));
    if(state.sections!==9||state.figures!==7||state.toc!==9||state.overflow||state.brokenSvgReferences||state.placeholders)throw new Error(JSON.stringify({width,...state}));
    await page.screenshot({path:path.join(output,`cover-${width}.png`)});
    if(width===1440) {
      for(const id of ['process','data','training','architectures','usage','results','next','conclusion']) {
        await page.locator('#'+id).screenshot({path:path.join(output,`${id}-desktop.png`)});
      }
      await page.locator('.source summary').first().click();
      if(!await page.locator('.source').first().getAttribute('open').then(x=>x!==null))throw new Error('Source details failed');
    }
    results.push({width,...state});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({media:'print'});
  await page.pdf({path:path.join(output,'print-check.pdf'),printBackground:true,preferCSSPageSize:true});
  const localLinks=await page.evaluate(()=>[...document.querySelectorAll('main a[href]')].map(a=>a.getAttribute('href')).filter(h=>!h.startsWith('#')&&!/^https?:/.test(h)));
  for(const link of localLinks)if(!fs.existsSync(path.resolve(root,'docs',link)))throw new Error('Missing link '+link);
  if(errors.length)throw new Error(errors.join('\n'));
  const receipt={status:'PASS',results,localLinks:localLinks.length,javascriptErrors:errors,print:'PDF generated for layout inspection'};
  fs.writeFileSync(path.join(output,'qa.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
