import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {componentMotions} from './portfolio/v1/motion-catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),out=path.join(root,'docs/library/previews/portfolio');
const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8927/docs',url=base+'/library/previews/portfolio/index.html';
let browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
const settle=p=>p.evaluate(()=>Promise.allSettled(document.getAnimations().map(a=>a.finished)));
try{
 for(const [itemIndex,item] of componentMotions.entries()){
  if(itemIndex&&itemIndex%4===0){await browser.close();browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});}
 for(const width of [390,1440]){
  const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:'no-preference'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+`?view=motion-library&component=${item.id}&motion=showcase#motion-preview`);await p.locator('.motion-component-preview').waitFor();await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.locator('.motion-library-link').count(),componentMotions.length);assert.equal(await p.locator('.motion-library-link[aria-current=page]').count(),1);
  assert.equal(await p.locator('#motion-preview-title').innerText(),item.title);
  for(const recipe of ['featured','gallery']){
   await p.getByLabel('미리보기 디자인',{exact:true}).selectOption(recipe);await p.locator('.motion-preview-stage').scrollIntoViewIfNeeded();await settle(p);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,item.id+' overflow');
   assert.equal(await p.locator('.motion-component-preview').getAttribute('data-motion-effective'),'showcase');
   await p.getByRole('button',{name:'다시 재생'}).click();await p.locator('.motion-preview-stage').scrollIntoViewIfNeeded();
   if(item.id==='timeline'||item.id==='career-ribbon'){
    const ids=await p.evaluate(()=>document.getAnimations().map(a=>a.id));assert.ok(ids.includes('component:timeline-node'));assert.ok(ids.includes('component:timeline-copy'));
   }
   await settle(p);results.push({component:item.id,recipe,width,status:'passed'});
  }
  if(item.id==='showcase'){
   const deck=p.locator('.project-showcase');
   for(const [index,direction] of [[2,1],[1,-1]]){
    await deck.locator('.showcase-selection label').nth(index).click();
    const frames=await deck.locator('.showcase-panel:visible [data-reveal=hero-visual]').evaluate(el=>el.getAnimations().find(a=>a.id==='component:stack')?.effect.getKeyframes());
    assert.equal(await p.evaluate(()=>document.getAnimations().filter(a=>a.animationName==='showcase-enter').length),0,'기존 CSS 등장 효과 중복');
    assert.ok(frames?.length);const matrix=frames[0].transform;assert.ok(matrix.includes(`translateX(${direction*32}px)`),matrix);await settle(p);
   }
   await deck.locator('.showcase-selection input').nth(1).focus();await p.keyboard.press('ArrowLeft');assert.equal(await deck.locator('.showcase-choice-0').isVisible(),true);assert.equal(await p.evaluate(()=>document.getAnimations().filter(a=>a.id==='component:stack').length),0);
  }
  if(item.id==='gallery'&&width===1440){
   const cover=p.locator('.visual-project-cover').first(),scene=cover.locator('.project-scene');await p.mouse.move(0,0);await settle(p);const before=await scene.evaluate(e=>getComputedStyle(e).transform);
   await cover.hover();await settle(p);const hover=await scene.evaluate(e=>getComputedStyle(e).transform);assert.notEqual(before,hover);
   await p.mouse.move(0,0);await settle(p);assert.equal(await scene.evaluate(e=>getComputedStyle(e).transform),before);
  }
  if(item.id==='evidence'){
   await p.getByLabel('미리보기 디자인',{exact:true}).selectOption('featured');const summary=p.locator('.v-artifact summary').first();await summary.focus();await p.keyboard.press('Enter');assert.equal(await p.locator('.v-artifact').first().getAttribute('open'),'');await p.keyboard.press('Enter');assert.equal(await p.locator('.v-artifact').first().getAttribute('open'),null);
  }
  if(item.id==='orbit'){
   const first=p.locator('.orbit-radio').first(),second=p.locator('.orbit-radio').nth(1);
   await first.focus();await p.keyboard.press('ArrowRight');assert.equal(await second.isChecked(),true);
   assert.equal(await p.locator('.orbit-case-link:visible').count(),1);
   await p.getByLabel('미리보기 모션',{exact:true}).selectOption('none');
   await second.check({force:true});assert.equal(await second.isChecked(),true);assert.equal(await second.locator('xpath=..').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
   await p.getByLabel('미리보기 모션',{exact:true}).selectOption('showcase');
  }
  if(item.id==='annotation'){
   assert.ok(await p.locator('[data-annotation-drawing]').count()>0);
   await p.getByRole('button',{name:'다시 재생'}).click();
   await p.waitForFunction(()=>document.getAnimations().some(a=>a.id==='component:annotation'));
   await settle(p);
  }
  if(item.id==='headline-lines'){
   assert.equal(await p.locator('.v-headline-line').count(),2);
   await p.getByRole('button',{name:'다시 재생'}).click();await p.waitForFunction(()=>document.getAnimations().some(a=>a.id==='entrance:hero-line'));
   await settle(p);
  }
  if(item.id==='bento'){
   assert.equal(await p.locator('.bento-project').count(),3);
   const image=p.locator('.bento-project-cover img').first();await p.mouse.move(0,0);await settle(p);const before=await image.evaluate(e=>getComputedStyle(e).transform);
   await p.locator('.bento-project-cover').first().hover();await settle(p);assert.notEqual(await image.evaluate(e=>getComputedStyle(e).transform),before);
   await p.mouse.move(0,0);await settle(p);
  }
  if(item.id==='evidence-previews'){
   const summary=p.locator('.evidence-preview-card summary').first();await summary.focus();await p.keyboard.press('Enter');assert.equal(await p.locator('.evidence-preview-card').first().getAttribute('open'),'');await p.keyboard.press('Enter');assert.equal(await p.locator('.evidence-preview-card').first().getAttribute('open'),null);
  }
  if(item.id==='contact-card'){
   assert.equal(await p.locator('.contact-card-link').count(),1);
   const link=await p.locator('.contact-card-link').evaluate(element=>{element.focus();return {href:element.getAttribute('href'),focused:document.activeElement===element};});
   assert.equal(link.href?.startsWith('mailto:'),true);assert.equal(link.focused,true);
  }
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>document.querySelector('.motion-component-preview').dataset.motionEffective==='none');assert.equal(await p.locator('[data-motion-state=pending]').count(),0);assert.equal(await p.getByRole('button',{name:'다시 재생'}).isDisabled(),true);
  await p.emulateMedia({reducedMotion:'no-preference'});await p.getByLabel('미리보기 모션',{exact:true}).selectOption('none');assert.equal(await p.locator('[data-motion-state=pending]').count(),0);assert.equal(await p.getByRole('button',{name:'다시 재생'}).isDisabled(),true);
  assert.deepEqual(errors,[]);console.log(item.id,width,'passed');await p.close();
 }
 }
 const p=await browser.newPage();await p.goto(base+'/Expresso%20개발%20포털.dc.html#/library');await p.getByRole('link',{name:/컴포넌트 모션/}).click();await p.locator('.motion-library').waitFor();await p.getByRole('link',{name:/경력 타임라인/}).click();await p.locator('.career-item').first().waitFor();assert.match(p.url(),/component=timeline/);
 // 단일 HTML에서도 동일한 타임라인 동작을 확인합니다.
 await p.goto(base+'/library/previews/portfolio/featured-standard.static.html');await p.locator('[data-motion-effective]').waitFor();await p.locator('.career').scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.querySelector('.career-item .timeline-dot').dataset.motionState==='shown');assert.equal(await p.locator('.career-item .timeline-dot').first().evaluate(e=>getComputedStyle(e).opacity),'1');await p.close();
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),staticPage=await nojs.newPage();await staticPage.goto(base+'/library/previews/portfolio/gallery-standard-selected.static.html');assert.equal(await staticPage.locator('.orbit-radio').count(),3);assert.equal(await staticPage.locator('.v-drawn-highlight [data-annotation-drawing]').count()>0,true);await staticPage.locator('.orbit-radio').nth(1).check({force:true});assert.equal(await staticPage.locator('.orbit-case-link:visible').count(),1);await nojs.close();
 const files=['component-motion-catalog.json','variants.js','variants.css','variants-sources.json','featured-standard.static.html','gallery-standard-selected.static.html','gallery-standard-bento.static.html'];
 const artifactHashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')]));
 fs.writeFileSync(path.join(out,'motion-library-verification.json'),JSON.stringify({results,checks:{directionalStack:true,keyboardImmediate:true,galleryHoverReverse:true,timelineParts:true,orbitKeyboard:true,annotationDrawing:true,headlineLines:true,bentoHover:true,careerRibbon:true,evidenceDisclosure:true,contactCard:true,reducedMotion:true,nonePreset:true,portalNavigation:true,staticTimeline:true,staticSelectedControls:true},artifactHashes},null,2)+'\n');
}finally{await browser.close();}
