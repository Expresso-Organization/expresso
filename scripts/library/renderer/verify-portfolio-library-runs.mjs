import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {validateModelSpec} from './portfolio/v1/model-spec.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const runs=path.join(root,'docs/library/previews/portfolio/runs');
const names=['ambient','spotlight','poster'];
const base=process.env.PORTFOLIO_PREVIEW_BASE||'http://127.0.0.1:8932';
const shotDir=path.join(runs,'library-comparison');
const normalize=text=>String(text).toLowerCase().replace(/[^\p{L}\p{N}@]/gu,'');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(shotDir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report=[];
try{
 for(const name of names){
  const folder=path.join(runs,`library-${name}-service-designer`),url=`${base}/library/previews/portfolio/runs/library-${name}-service-designer/index.html`;
  const read=file=>JSON.parse(fs.readFileSync(path.join(folder,file)));
  const manifest=read('run.json'),composition=read('composition.json'),attempts=read('model-attempts.json'),selection=read('selection-attempts.json');
  assert.equal(manifest.fictional,true);assert.ok(['model','recorded-model-spec'].includes(manifest.specOrigin));
  assert.equal(sha(fs.readFileSync(path.join(folder,'index.html'))),manifest.htmlSha256);
  assert.deepEqual(JSON.parse(attempts.attempts.find(item=>item.valid).output),composition.spec);
  assert.deepEqual(JSON.parse(selection.attempts.find(item=>item.valid).output),manifest.modelSelection);
  assert.deepEqual(validateModelSpec(composition.spec,composition.content).plan,composition.plan);
  const screens=[];
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:width===390?900:1200},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url,{waitUntil:'load'});
   await page.evaluate(async()=>{await document.fonts.ready;for(const image of document.images){image.loading='eager';await image.decode().catch(()=>{});}});
   const result=await page.evaluate(()=>{
    const ids=[...document.querySelectorAll('[id]')].map(node=>node.id),shell=document.querySelector('.variant-shell');
    const name=document.querySelector('#intro h1'),identity=name.nextElementSibling;
    return {design:[shell.dataset.palette,shell.dataset.typography,shell.dataset.design],motion:shell.dataset.motionEffective,overflow:document.documentElement.scrollWidth>innerWidth+1,missingAnchors:[...document.querySelectorAll('.portfolio a[href^="#"]')].filter(link=>!document.getElementById(link.getAttribute('href').slice(1))).map(link=>link.getAttribute('href')),duplicateIds:ids.filter((id,index)=>ids.indexOf(id)!==index),brokenImages:[...document.images].filter(image=>!image.naturalWidth).length,caseIds:[...document.querySelectorAll('[data-case-id]')].map(node=>node.dataset.caseId),h1:document.querySelectorAll('.portfolio h1').length,identity:{name:name.textContent,definition:identity.textContent,nameSize:parseFloat(getComputedStyle(name).fontSize),definitionSize:parseFloat(getComputedStyle(identity).fontSize),nameTop:name.getBoundingClientRect().top,definitionTop:identity.getBoundingClientRect().top}};
   });
   assert.deepEqual(errors,[]);assert.equal(result.overflow,false,`${name}/${width}: 가로 넘침`);assert.deepEqual(result.missingAnchors,[]);assert.deepEqual(result.duplicateIds,[]);assert.equal(result.brokenImages,0);assert.equal(result.h1,1);assert.equal(result.motion,'none');
   assert.equal(normalize(result.identity.name),normalize(composition.content.profile.name));
   assert.equal(normalize(result.identity.definition),normalize(composition.content.profile.headline));
   assert.ok(result.identity.nameSize>result.identity.definitionSize,`${name}/${width}: 이름의 글자 크기가 작습니다.`);
   assert.ok(result.identity.definitionTop>result.identity.nameTop,`${name}/${width}: 자기 정의가 이름 아래에 있지 않습니다.`);
   assert.deepEqual(result.caseIds,composition.content.projects.map(project=>project.id));
   const text=normalize(await page.locator('.portfolio').textContent());
   const values=[...Object.values(composition.content.profile).flat(),...composition.content.projects.flatMap(project=>[project.title,project.summary,project.category,project.role,project.period,project.problem,project.contribution,project.outcome,...project.tags]),...composition.content.career.flatMap(item=>[item.period,item.organization,item.role,item.description]),...composition.content.evidence.flatMap(item=>[item.title,item.kind,item.summary,item.body]),...Object.values(composition.content.contact)];
   for(const value of values)assert.ok(text.includes(normalize(value)),`${name}/${width}: 원문 누락 ${value}`);
   if(width===1440){
    await page.locator('#intro').screenshot({path:path.join(shotDir,`${name}-desktop.png`)});
    await page.locator('#work').screenshot({path:path.join(shotDir,`${name}-projects.png`)});
   }
   screens.push({width,...result,preservedFields:values.length});await page.close();
  }
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}}),staticPage=await noJs.newPage();
  await staticPage.goto(url);assert.equal(await staticPage.locator('[data-case-id]').count(),composition.content.projects.length);
  assert.equal(await staticPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await staticPage.locator('.portfolio h1').isVisible(),true);
  await noJs.close();
  report.push({name,inputSha256:manifest.inputSha256,htmlSha256:manifest.htmlSha256,selection:manifest.modelSelection,screens,noJavaScript:true});
  console.log(name,'passed',screens.map(screen=>screen.width).join('/'));
 }
 assert.equal(new Set(report.map(item=>item.inputSha256)).size,1,'비교 입력이 다릅니다.');
 assert.equal(new Set(report.map(item=>item.htmlSha256)).size,3,'생성 HTML이 중복됩니다.');
 assert.equal(new Set(report.map(item=>item.selection.design.palette+'|'+item.selection.heroStyle+'|'+item.selection.projectIndex)).size,3,'시각 구성이 중복됩니다.');
 fs.writeFileSync(path.join(shotDir,'report.json'),JSON.stringify({schemaVersion:1,fictional:true,checks:['same_input','model_output_is_spec','content_preservation','desktop_mobile','no_overflow','anchors','images','reduced_motion','no_javascript','distinct_visual_selection'],runs:report},null,2)+'\n');
}finally{await browser.close();}
