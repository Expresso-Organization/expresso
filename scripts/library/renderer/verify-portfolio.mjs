import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {scenarios} from './portfolio/fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'docs/library/previews/portfolio');
const screenshots=process.env.PORTFOLIO_QA_DIR||'/tmp/expresso-portfolio-qa';
fs.mkdirSync(screenshots,{recursive:true});
const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8922/docs';
const url=base+'/library/previews/portfolio/';
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
  for(const scenario of Object.keys(scenarios))for(const width of [390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url+`index.html?scenario=${scenario}`);
    await page.locator('.portfolio h1').waitFor();
    await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode().catch(()=>{});}});
    const inspected=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,
      missingAnchors:[...document.querySelectorAll('.portfolio a[href^="#"]')].map(a=>a.getAttribute('href').slice(1)).filter(id=>!document.getElementById(id)),
      headings:document.querySelectorAll('h1').length,
      projects:document.querySelectorAll('.project-card').length,
      fallbacks:document.querySelectorAll('.image-fallback').length,
      reduced:getComputedStyle(document.querySelector('.project-cover img')||document.querySelector('.project-cover')).transitionDuration,
    }));
    assert.deepEqual(errors,[]);assert.equal(inspected.overflow,false,`${scenario} ${width} 가로 넘침`);assert.equal(inspected.broken,0);
    assert.deepEqual(inspected.missingAnchors,[]);assert.equal(inspected.headings,1);
    assert.equal(inspected.projects,scenario==='many'?8:3);
    if(scenario==='no-images')assert.equal(inspected.fallbacks,3);
    assert.equal(inspected.reduced,'0s');
    const liveText=await page.locator('.portfolio').textContent();
    if((scenario==='standard'&&width!==768)||(width===390&&['long','no-images'].includes(scenario)))await page.screenshot({path:path.join(screenshots,`${scenario}-${width}.png`),fullPage:true});
    await page.goto(url+`${scenario}.static.html`);
    assert.equal(await page.locator('script').count(),0);
    assert.equal(await page.locator('.portfolio').textContent(),liveText,`${scenario} 정적 출력 내용 차이`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    results.push({scenario,width,status:'passed',...inspected,staticContentParity:true});
    console.log(scenario,width,'passed');await page.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  await page.goto(url+'index.html');await page.locator('h1').waitFor();
  await page.selectOption('#scenario','no-images');assert.equal(await page.locator('.image-fallback').count(),3);
  await page.getByRole('button',{name:'구성 JSON'}).click();await page.locator('#composition-json').waitFor();
  assert.match(await page.locator('#composition-json pre').innerText(),/\$state/);
  await page.locator('#moa-flow summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#moa-flow').getAttribute('open'),'');
  await page.keyboard.press('Enter');assert.equal(await page.locator('#moa-flow').getAttribute('open'),null);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'HTML 저장'}).click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'no-images.static.html');assert.equal(await download.failure(),null);
  // 실제 이미지 요청 실패도 동일한 텍스트 대체 화면으로 이어져야 합니다.
  await page.route('**/assets/*.svg',route=>route.abort());await page.reload();await page.selectOption('#scenario','standard');
  await page.evaluate(()=>{for(const img of document.images)img.loading='eager';});
  await page.waitForFunction(()=>document.querySelectorAll('.image-fallback').length===3);
  await page.close();
  const offline=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const staticPage=await offline.newPage();await staticPage.goto(url+'standard.static.html');
  assert.equal(await staticPage.locator('.project-card').count(),3);
  await staticPage.locator('#moa-flow summary').click();assert.equal(await staticPage.locator('#moa-flow').getAttribute('open'),'');
  await offline.close();
  const portal=await browser.newPage();await portal.goto(base+'/Expresso%20개발%20포털.dc.html#/library');
  await portal.getByRole('link',{name:/포트폴리오 조합 예제/}).click();await portal.locator('.portfolio h1').waitFor();await portal.close();
  const files=['app.js','style.css','sources.json',...Object.keys(scenarios).flatMap(s=>[s+'.static.html',s+'.json'])];
  const artifactHashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')]));
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({method:'chrome_browser_and_static_html',results,checks:{scenarioSwitch:true,jsonView:true,keyboardDisclosure:true,htmlDownload:true,brokenImageFallback:true,noJavascript:true,portalNavigation:true},artifactHashes},null,2)+'\n');
}finally{await browser.close();}
