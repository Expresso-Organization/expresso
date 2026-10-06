import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const report=JSON.parse(fs.readFileSync(path.join(root,'docs/library/previews/component-motion-coverage.json')));
const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8928/docs';
const cases=[['watermelon','contact-1','shared_reveal'],['watermelon','auth-02','shared_reveal'],['watermelon','hero-1','preserve_native'],['componentry','orbit-card-stack','preserve_native']];
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
 for(const [source,name,strategy] of cases){
  const item=report.items.find(entry=>entry.source===source&&entry.name===name);
  assert.ok(item,`${source}/${name}`);
  assert.equal(item.strategy,strategy,item.id);
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const url=base+'/'+item.previewUrl.replace(/^\.\//,'').replace(/^library\//,'library/');
   const mode=strategy==='shared_reveal'?'showcase':'none';
   await page.goto(`${url}?exMotion=${mode}`);
   await page.waitForFunction(()=>document.documentElement.dataset.exMotionState==='ready');
   const state=await page.evaluate(()=>({mode:document.documentElement.dataset.exMotionMode,strategy:document.documentElement.dataset.exMotionStrategy,react:document.documentElement.dataset.exMotionReact||null,visible:!!(document.querySelector('#demo,#root')?.getClientRects().length)}));
   assert.equal(state.mode,mode,item.id);
   assert.equal(state.strategy,strategy,item.id);
   assert.equal(state.visible,true,item.id);
   if(mode==='none')assert.equal(await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length),0,item.id);
   assert.deepEqual(errors,[],item.id);
   results.push({id:item.id,width,mode,...state});
   await page.close();
  }
 }
 const item=report.items.find(entry=>entry.source==='watermelon'&&entry.name==='contact-1');
 const reduced=await browser.newPage({reducedMotion:'reduce'});
 await reduced.goto(base+'/'+item.previewUrl.replace(/^\.\//,'')+'?exMotion=showcase');
 await reduced.waitForFunction(()=>document.documentElement.dataset.exMotionState==='ready');
 assert.equal(await reduced.evaluate(()=>document.getAnimations().filter(animation=>animation.id?.startsWith('expresso:')).length),0);
 await reduced.close();

 const portal=await browser.newPage({viewport:{width:1280,height:900}}),portalErrors=[];
 portal.on('pageerror',error=>portalErrors.push(error.message));
 await portal.goto(base+'/Expresso%20%EA%B0%9C%EB%B0%9C%20%ED%8F%AC%ED%84%B8.dc.html#/library/basic-ui/'+item.id);
 const select=portal.getByRole('combobox',{name:'컴포넌트 모션'});
 await select.waitFor();
 assert.deepEqual(await select.locator('option').allTextContents(),['원본','최소화','차분하게','쇼케이스']);
 await select.selectOption('showcase');
 await portal.waitForFunction(()=>document.querySelector('.lib-detail iframe')?.src.includes('exMotion=showcase'));
 await portal.waitForFunction(()=>document.querySelector('[data-motion-status]')?.textContent.includes('공통 등장'));
 const before=await portal.locator('.lib-detail iframe').getAttribute('src');
 await portal.getByRole('button',{name:'다시 재생'}).click();
 const after=await portal.locator('.lib-detail iframe').getAttribute('src');
 assert.notEqual(before,after);
 assert.match(after,/exReplay=1/);
 assert.deepEqual(portalErrors,[]);
 await portal.close();
 console.log(JSON.stringify({checked:results.length,reducedMotion:true,portalControls:true,results},null,2));
}finally{await browser.close();}
