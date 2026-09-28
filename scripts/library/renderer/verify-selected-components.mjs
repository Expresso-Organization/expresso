import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {fixture,scenarios} from './portfolio/v1/fixtures.mjs';
import {recipes} from './portfolio/v1/catalog.mjs';
import {variantFile} from './portfolio/v1/motion.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'docs/library/previews/portfolio');
const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8927/docs';
const url=base+'/library/previews/portfolio/';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
 for(const componentSet of ['selected','bento'])for(const recipe of Object.keys(recipes))for(const scenario of Object.keys(scenarios))for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const data=fixture(scenario),file=variantFile(recipe,scenario,recipe==='gallery'?'showcase':'subtle',componentSet);
  await page.goto(url+`index.html?recipe=${recipe}&scenario=${scenario}&components=${componentSet}`);
  await page.locator(componentSet==='selected'?'.orbit-card':'.bento-project').first().waitFor();
  const live=await page.locator('.portfolio').innerText();
  assert.equal(await page.locator('.orbit-card').count(),componentSet==='selected'?Math.min(data.projects.length,5):0);
  assert.equal(await page.locator('.bento-project').count(),componentSet==='bento'?data.projects.length:0);
  assert.equal(await page.locator('.orbit-more li').count(),componentSet==='selected'?Math.max(data.projects.length-5,0):0);
  assert.equal(await page.locator('.v-drawn-highlight [data-annotation-drawing]').count()>0,true);
  assert.equal(await page.locator('.v-headline-line').count(),data.profile.headline.split('\n').length);
  assert.equal(await page.locator('.career-ribbon-item').count(),data.career.length);
  assert.equal(await page.locator('.evidence-preview-card').count(),data.evidence.length);
  assert.equal(await page.locator('.contact-card-link').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${componentSet}/${recipe}/${scenario}/${width} 가로 넘침`);
  for(const project of data.projects){assert.equal(await page.locator(`#case-${project.id}`).count(),1);assert.ok(live.includes(project.title));}
  for(const evidence of data.evidence)assert.equal(await page.locator(`#${evidence.id}`).count(),1);
  if(componentSet==='selected'){
   await page.locator('.orbit-radio:checked').focus();
   for(let step=0;step<Math.min(data.projects.length,5)-1-Math.floor(Math.min(data.projects.length,5)/2);step++)await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('.orbit-radio').last().isChecked(),true);
   assert.equal(await page.locator('.orbit-case-link:visible').count(),1);
   assert.equal(await page.locator('.orbit-position').last().evaluate(element=>getComputedStyle(element).transitionDuration),'0s');
  }else assert.equal(await page.locator('.bento-project a[href^="#case-"]').count(),data.projects.length*3);
  await page.locator('.evidence-preview-card summary').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.evidence-preview-card').first().getAttribute('open'),'');
  await page.goto(url+file+'.static.html');
  assert.equal(await page.locator('.orbit-card').count(),componentSet==='selected'?Math.min(data.projects.length,5):0);
  assert.equal(await page.locator('.bento-project').count(),componentSet==='bento'?data.projects.length:0);
  assert.equal(await page.locator('.orbit-more li').count(),componentSet==='selected'?Math.max(data.projects.length-5,0):0);
  assert.equal(await page.locator('.portfolio').innerText(),live);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${file} 정적 가로 넘침`);
  assert.deepEqual(errors,[]);
  results.push({componentSet,recipe,scenario,width,status:'passed',projects:data.projects.length,staticParity:true});
  console.log(componentSet,recipe,scenario,width,'passed');await page.close();
 }
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),page=await nojs.newPage();
 await page.goto(url+'gallery-standard-selected.static.html');
 assert.equal(await page.locator('.orbit-radio').count(),3);
 await page.locator('.orbit-radio:checked').focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('.orbit-case-link:visible').count(),1);
 assert.equal(await page.locator('.v-drawn-highlight [data-annotation-drawing]').count()>0,true);
 await page.locator('.evidence-preview-card summary').first().click();assert.equal(await page.locator('.evidence-preview-card').first().getAttribute('open'),'');
 await page.goto(url+'gallery-standard-bento.static.html');assert.equal(await page.locator('.bento-project').count(),3);await page.locator('.evidence-preview-card summary').first().click();assert.equal(await page.locator('.evidence-preview-card').first().getAttribute('open'),'');
 await nojs.close();
 const files=['variants.js','variants.css','variants-sources.json','component-motion-catalog.json',...['selected','bento'].flatMap(componentSet=>Object.keys(recipes).flatMap(recipe=>Object.keys(scenarios).map(scenario=>variantFile(recipe,scenario,recipe==='gallery'?'showcase':'subtle',componentSet)+'.static.html')))];
 const artifactHashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')]));
 fs.writeFileSync(path.join(out,'selected-components-verification.json'),JSON.stringify({method:'chrome_selected_portfolio_components',results,checks:{mobile:true,desktop:true,projectOverflow:true,careerRibbon:true,evidenceDisclosure:true,contactCard:true,staticParity:true,reducedMotion:true,noJavascript:true},artifactHashes},null,2)+'\n');
}finally{await browser.close();}
