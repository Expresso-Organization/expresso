import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {variantFile} from './portfolio/v1/motion.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'docs/library/previews/portfolio'),base=(process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8926/docs')+'/library/previews/portfolio/';
const shots='/tmp/expresso-motion-qa';fs.mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
const settle=page=>page.evaluate(async()=>{await Promise.allSettled(document.getAnimations().map(a=>a.finished));});
try{
 for(const recipe of ['featured','gallery'])for(const preset of ['none','subtle','showcase'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'no-preference',acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.__observers=new Set();const Original=IntersectionObserver;window.IntersectionObserver=class extends Original{constructor(...args){super(...args);window.__observers.add(this);}disconnect(){window.__observers.delete(this);super.disconnect();}};});
  await page.goto(base+`index.html?recipe=${recipe}&motion=${preset}`);await page.locator('[data-motion-effective]').waitFor();await page.evaluate(()=>document.fonts.ready);await settle(page);
  assert.equal(await page.locator('.variant-shell').getAttribute('data-motion-effective'),preset);
  await page.getByRole('button',{name:'구성 JSON'}).click();const plan=JSON.parse(await page.locator('#composition-json pre').innerText());assert.equal(plan.motion.preset,preset);await page.getByRole('button',{name:'구성 JSON'}).click();
  let timing=null;
  if(preset==='none'){
    assert.equal(await page.getByRole('button',{name:'다시 재생'}).isDisabled(),true);
    assert.equal(await page.locator('[data-motion-state=pending]').count(),0);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
  }else{
    await page.getByRole('button',{name:'다시 재생'}).click();
    timing=await page.evaluate(()=>{
      const cues=['hero-label','hero-title','hero-visual','hero-note'];
      const timings=Object.fromEntries(cues.map(c=>{const el=[...document.querySelectorAll(`[data-reveal="${c}"]`)].find(e=>e.getClientRects().length);const a=el.getAnimations()[0];return [c,a?.effect.getTiming()];}));
      for(const a of document.getAnimations()){a.pause();a.currentTime=120;}
      return {timings,titleOpacity:getComputedStyle(document.querySelector('[data-reveal="hero-title"]')).opacity};
    });
    assert.ok(timing.timings['hero-title']);if(width===1440){assert.ok(timing.timings['hero-title'].delay<timing.timings['hero-visual'].delay);assert.ok(timing.timings['hero-visual'].delay<timing.timings['hero-note'].delay);}
    assert.ok(Number(timing.titleOpacity)<1);
    if(recipe==='gallery'&&width===1440)await page.screenshot({path:path.join(shots,preset+'-entrance.png')});
    await page.evaluate(()=>document.getAnimations().forEach(a=>a.play()));await settle(page);
    assert.equal(await page.locator('[data-reveal=hero-title]').evaluate(e=>getComputedStyle(e).opacity),'1');
    // 폴드 아래 요소는 스크롤 진입 후 한 번만 등장합니다.
    const card=page.locator('.visual-project-card').first();assert.equal(await card.getAttribute('data-motion-state'),'pending');
    await card.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.visual-project-card').dataset.motionState!=='pending');await settle(page);assert.equal(await card.getAttribute('data-motion-state'),'shown');
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await card.scrollIntoViewIfNeeded();assert.equal(await card.getAttribute('data-motion-state'),'shown');
    // 대기 중인 링크에 키보드 포커스가 도착하면 지연 없이 표시됩니다.
    const last=page.locator('.visual-project-card').last();await last.locator('a').first().focus();assert.equal(await last.getAttribute('data-motion-state'),'shown');
    await page.evaluate(()=>{for(let i=0;i<12;i++)document.querySelector('.variant-shell').dispatchEvent(new Event('portfolio-motion-replay'));});
    assert.equal(await page.evaluate(()=>window.__observers.size),1);await settle(page);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.variant-shell').dataset.motionEffective==='none');
    assert.equal(await page.locator('[data-motion-state=pending]').count(),0);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);assert.equal(await page.getByRole('button',{name:'다시 재생'}).isDisabled(),true);
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('.variant-shell').dataset.motionEffective!=='none');await settle(page);
  }
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'HTML 저장'}).click();const download=await pending;const file=variantFile(recipe,'standard',preset)+'.static.html';assert.equal(download.suggestedFilename(),file);
  assert.equal(createHash('sha256').update(fs.readFileSync(await download.path())).digest('hex'),createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex'));
  await page.goto(base+file);await page.locator('.portfolio').waitFor();if(preset!=='none'){await page.locator('[data-motion-effective]').waitFor();assert.equal(await page.locator('.variant-shell').getAttribute('data-motion-effective'),preset);await settle(page);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  results.push({recipe,preset,width,entrance:!!timing,download:true,staticRuntime:true,timing});console.log(recipe,preset,width,'passed');await page.close();
 }
 const p=await browser.newPage({viewport:{width:390,height:844}});
 await p.addInitScript(()=>{window.IntersectionObserver=undefined;});await p.goto(base+'index.html?motion=showcase');await p.locator('[data-motion-effective=none]').waitFor();assert.equal(await p.locator('[data-motion-state=pending]').count(),0);await p.close();
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),s=await nojs.newPage();await s.goto(base+'gallery-standard.static.html');assert.equal(await s.locator('[data-motion-state=pending]').count(),0);await s.locator('.showcase-selection label').nth(1).click();assert.equal(await s.locator('.showcase-choice-1').isVisible(),true);await nojs.close();
 const hash=await browser.newPage({viewport:{width:1440,height:1000}});await hash.goto(base+'index.html?recipe=gallery#case-lumen');await hash.locator('[data-motion-effective]').waitFor();assert.equal(await hash.locator('#case-lumen .v-case-heading').evaluate(e=>getComputedStyle(e).opacity),'1');await hash.close();
 const files=JSON.parse(fs.readFileSync(path.join(out,'variants-sources.json'))).variants.flatMap(v=>[v.file+'.json',v.file+'.static.html']);
 const hashes=Object.fromEntries(['variants.js','variants.css','variants-sources.json',...files].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex')]));
 fs.writeFileSync(path.join(out,'motion-verification.json'),JSON.stringify({results,checks:{systemReducedMotion:true,keyboardReveal:true,replayCleanup:true,noObserverFallback:true,noJavascript:true,anchorLanding:true},artifactHashes:hashes},null,2)+'\n');
}finally{await browser.close();}
