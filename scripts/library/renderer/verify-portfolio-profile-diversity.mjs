// 세 가상 입력의 모델 생성 결과를 모바일과 데스크톱에서 확인합니다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {validateContent} from './portfolio/v1/catalog.mjs';
import {validateModelSpec} from './portfolio/v1/model-spec.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8932';
const slugs=['robotics-engineer','editorial-designer','climate-analyst'];
const normalize=value=>String(value).toLowerCase().replace(/[^\p{L}\p{N}@]/gu,'');
const sha=value=>createHash('sha256').update(value).digest('hex');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report=[];
try{
 for(const slug of slugs){
  const inputPath=path.join(root,'scripts/library/renderer/portfolio/samples/fictional-profiles',slug,'content.json');
  const folder=path.join(root,'docs/library/previews/portfolio/runs','profile-'+slug);
  const input=fs.readFileSync(inputPath),content=validateContent(JSON.parse(input));
  const read=name=>JSON.parse(fs.readFileSync(path.join(folder,name)));
  const run=read('run.json'),composition=read('composition.json');
  const selection=read('selection-attempts.json'),attempts=read('model-attempts.json');
  assert.equal(run.fictional,true);assert.equal(run.specOrigin,'model');
  assert.equal(run.inputSha256,sha(input));assert.equal(run.htmlSha256,sha(fs.readFileSync(path.join(folder,'index.html'))));
  assert.deepEqual(composition.content,content);
  assert.deepEqual(JSON.parse(selection.attempts.find(item=>item.valid).output),run.modelSelection);
  assert.deepEqual(JSON.parse(attempts.attempts.find(item=>item.valid).output),composition.spec);
  assert.deepEqual(validateModelSpec(composition.spec,content).plan,composition.plan);
  const screens=[];
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:width===390?900:1100},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const response=await page.goto(`${base}/library/previews/portfolio/runs/profile-${slug}/index.html`,{waitUntil:'load'});
   assert.equal(response.status(),200);
   await page.evaluate(async()=>{await document.fonts.ready;for(const image of document.images){image.loading='eager';await image.decode().catch(()=>{});}});
   const result=await page.evaluate(()=>{
    const ids=[...document.querySelectorAll('[id]')].map(node=>node.id),name=document.querySelector('#intro h1');
    return {name:name?.textContent,headline:name?.nextElementSibling?.textContent,
     design:[...document.querySelectorAll('.variant-shell')].map(node=>[node.dataset.palette,node.dataset.typography,node.dataset.design]),
     projects:[...document.querySelectorAll('[data-case-id]')].map(node=>node.dataset.caseId),
     staticImages:document.querySelectorAll('.scene-static img').length,
     brokenImages:[...document.images].filter(image=>!image.naturalWidth).length,
     overflow:document.documentElement.scrollWidth>innerWidth+1,
     missingAnchors:[...document.querySelectorAll('.portfolio a[href^="#"]')].filter(link=>!document.getElementById(link.hash.slice(1))).map(link=>link.hash),
     duplicateIds:ids.filter((id,index)=>ids.indexOf(id)!==index)};
   });
   assert.deepEqual(errors,[]);assert.equal(result.overflow,false,`${slug}/${width}: 가로 넘침`);
   assert.deepEqual(result.missingAnchors,[]);assert.deepEqual(result.duplicateIds,[]);assert.equal(result.brokenImages,0);
   assert.equal(normalize(result.name),normalize(content.profile.name));assert.equal(normalize(result.headline),normalize(content.profile.headline));
   assert.deepEqual(result.projects,content.projects.map(project=>project.id));
   assert.ok(result.staticImages>=content.projects.length,`${slug}/${width}: 가상 원본 그림이 보이지 않습니다.`);
   const text=normalize(await page.locator('.portfolio').textContent());
   const values=[content.profile.role,content.profile.intro,...content.projects.flatMap(project=>[project.title,project.summary,project.problem,project.contribution,project.outcome]),...content.career.flatMap(item=>[item.organization,item.role,item.description]),...content.evidence.flatMap(item=>[item.title,item.summary,item.body])];
   for(const value of values)assert.ok(text.includes(normalize(value)),`${slug}/${width}: 내용 누락 ${value}`);
   if(width===1440){await page.locator('#intro').screenshot({path:`/tmp/expresso-${slug}-intro.png`});await page.locator('#work').screenshot({path:`/tmp/expresso-${slug}-work.png`});}
   screens.push({width,overflow:false,brokenImages:0,preservedFields:values.length});await page.close();
  }
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}}),staticPage=await noJs.newPage();
  await staticPage.goto(`${base}/library/previews/portfolio/runs/profile-${slug}/index.html`);
  assert.equal(await staticPage.locator('[data-case-id]').count(),content.projects.length);
  assert.equal(await staticPage.locator('.scene-static img').count()>0,true);
  await noJs.close();
  report.push({slug,name:content.profile.name,role:content.profile.role,inputSha256:run.inputSha256,htmlSha256:run.htmlSha256,modelSelection:run.modelSelection,components:composition.plan.components,cases:composition.plan.cases,screens,noJavaScript:true});
  console.log(slug,'passed');
 }
 assert.equal(new Set(report.map(item=>item.inputSha256)).size,3);
 assert.equal(new Set(report.map(item=>item.htmlSha256)).size,3);
 assert.equal(new Set(report.map(item=>item.role)).size,3);
 fs.writeFileSync(path.join(root,'docs/library/previews/portfolio/runs/profile-diversity-report.json'),JSON.stringify({schemaVersion:1,fictional:true,method:'same model and default prompt; three distinct inputs; no avoid flag',runs:report},null,2)+'\n');
}finally{await browser.close();}
