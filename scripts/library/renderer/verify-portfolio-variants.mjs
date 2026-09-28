import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {recipes,defaultPlan} from './portfolio/v1/catalog.mjs';
import {fixture,scenarios} from './portfolio/v1/fixtures.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'docs/library/previews/portfolio');
const shots=process.env.PORTFOLIO_QA_DIR||'/tmp/expresso-portfolio-variants';fs.mkdirSync(shots,{recursive:true});
const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8924/docs',url=base+'/library/previews/portfolio/';
const normalize=v=>String(v).toLowerCase().replace(/[^\p{L}\p{N}@]/gu,'');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
  for(const recipe of Object.keys(recipes))for(const scenario of Object.keys(scenarios))for(const width of [390,768,1440]){
    const content=fixture(scenario),plan=defaultPlan(content,recipe),page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+`index.html?recipe=${recipe}&scenario=${scenario}`);await page.locator('.portfolio h1').waitFor();
    await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode().catch(()=>{});}});
    const info=await page.evaluate(()=>{
      const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,broken:[...document.images].filter(e=>!e.complete||!e.naturalWidth).length,duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i),missingAnchors:[...document.querySelectorAll('.portfolio a[href^="#"]')].filter(a=>!document.getElementById(a.getAttribute('href').slice(1))).map(a=>a.getAttribute('href')),variants:[...document.querySelectorAll('.v-case')].map(e=>({id:e.dataset.caseId,variant:e.dataset.variant})),h1:document.querySelectorAll('.portfolio h1').length,mediaAlignments:[...document.querySelectorAll('.v-case-media')].map(e=>({id:e.id,offset:Math.abs(e.querySelector('.v-case-heading').getBoundingClientRect().top-e.querySelector('.v-case-visual').getBoundingClientRect().top)})),height:document.body.scrollHeight};
    });
    assert.deepEqual(errors,[]);assert.equal(info.overflow,false,`${recipe}/${scenario}/${width}: 가로 넘침`);assert.equal(info.broken,0);assert.deepEqual(info.duplicateIds,[]);assert.deepEqual(info.missingAnchors,[]);assert.equal(info.h1,1);
    assert.deepEqual(info.variants,plan.cases.map(c=>({id:c.projectId,variant:c.variant})));
    const narrowText=await page.locator('.portfolio h2,.portfolio h3,.portfolio p').evaluateAll(nodes=>nodes.filter(e=>{
      const r=e.getBoundingClientRect();
      return r.height>0&&e.textContent.trim().length>40&&r.width<120;
    }).map(e=>({tag:e.tagName,text:e.textContent.slice(0,60),width:e.getBoundingClientRect().width})));
    assert.deepEqual(narrowText,[],`${recipe}/${scenario}/${width}: 읽기 폭이 부족한 문장`);
    if(width>=650)for(const row of info.mediaAlignments)assert.ok(row.offset<2,`${row.id}: 제목과 이미지 행 밀림 ${row.offset}px`);
    let preserved=0;
    for(const p of content.projects){
      const text=normalize(await page.locator(`[data-case-id="${p.id}"]`).textContent());
      for(const key of ['title','summary','category','role','period','problem','contribution','outcome']){assert.ok(text.includes(normalize(p[key])),`${p.id}.${key} 유실`);preserved++;}
      for(const tag of p.tags){assert.ok(text.includes(normalize(tag)));preserved++;}
    }
    for(const e of content.evidence){
      const text=normalize(await page.locator('#'+e.id).textContent());
      for(const key of ['title','kind','summary','body']){assert.ok(text.includes(normalize(e[key])),`${e.id}.${key} 유실`);preserved++;}
    }
    const all=normalize(await page.locator('.portfolio').textContent());
    for(const value of [content.profile.name,content.profile.role,content.profile.headline,content.profile.intro,content.profile.location,...content.profile.focus,...content.career.flatMap(c=>[c.period,c.organization,c.role,c.description]),...Object.values(content.contact)]){assert.ok(all.includes(normalize(value)),'공통 콘텐츠 유실');preserved++;}
    const liveText=await page.locator('.portfolio').textContent();
    if((scenario==='standard'&&width!==768)||(scenario==='long'&&width===390)||(scenario==='no-images'&&width===390))await page.screenshot({path:path.join(shots,`${recipe}-${scenario}-${width}.png`),fullPage:true});
    await page.goto(url+`${recipe}-${scenario}.static.html`);assert.equal(await page.locator('script').count(),0);assert.equal(await page.locator('.portfolio').textContent(),liveText);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    results.push({recipe,scenario,width,status:'passed',preservedFields:preserved,staticParity:true,...info});console.log(recipe,scenario,width,'passed',preserved+' fields');await page.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  await page.goto(url+'index.html');await page.locator('.v-case').first().waitFor();
  await page.getByRole('button',{name:'구성 JSON'}).click();assert.match(await page.locator('#composition-json pre').innerText(),/"variant": "media"/);
  await page.locator('#moa-flow summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#moa-flow').getAttribute('open'),'');
  await page.selectOption('#recipe','gallery');assert.equal(await page.locator('.v-evidence-expanded').count(),1);
  await page.selectOption('#scenario','no-images');assert.equal(await page.locator('[data-variant="media"]').count(),0);
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'HTML 저장'}).click();const download=await pending;assert.equal(download.suggestedFilename(),'gallery-no-images.static.html');assert.equal(await download.failure(),null);
  await page.route('**/assets/*.svg',route=>route.abort());await page.reload();await page.selectOption('#scenario','standard');await page.evaluate(()=>{for(const img of document.images)img.loading='eager';});await page.waitForFunction(()=>document.querySelectorAll('.image-fallback').length>=4);
  await page.close();
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),staticPage=await nojs.newPage();
  await staticPage.goto(url+'featured-standard.static.html');await staticPage.locator('#moa-flow summary').click();assert.equal(await staticPage.locator('#moa-flow').getAttribute('open'),'');assert.equal(await staticPage.locator('.v-case').count(),3);await nojs.close();
  const portal=await browser.newPage();await portal.goto(base+'/Expresso%20개발%20포털.dc.html#/library');await portal.getByRole('link',{name:/포트폴리오 조합 예제/}).click();await portal.locator('#recipe').waitFor();await portal.getByRole('link',{name:'초기 구성',exact:true}).click();await portal.locator('.portfolio .cases').waitFor();await portal.close();
  const files=['index.html','variants.js','variants.css','variants-sources.json','variants-plan-schema.json',...Object.keys(recipes).flatMap(recipe=>Object.keys(scenarios).flatMap(s=>[`${recipe}-${s}.static.html`,`${recipe}-${s}.json`]))];
  const artifactHashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')]));
  fs.writeFileSync(path.join(out,'variants-verification.json'),JSON.stringify({method:'chrome_composition_variants',results,checks:{recipeSwitch:true,scenarioSwitch:true,planView:true,keyboardDisclosure:true,htmlDownload:true,brokenImageFallback:true,noJavascript:true,portalNavigation:true,baselinePreserved:true},artifactHashes},null,2)+'\n');
}finally{await browser.close();}
