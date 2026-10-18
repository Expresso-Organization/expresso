import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const out=path.join(root,'docs/library/previews/comparison');
const base=process.env.COMPARISON_BASE||'http://127.0.0.1:8923/docs/library/previews/comparison';
const {content}=JSON.parse(fs.readFileSync(path.join(out,'input.json')));
const probes=[{path:'profile.name',value:content.profile.name},{path:'profile.role',value:content.profile.role},{path:'contact.email',value:content.contact.email},...content.projects.flatMap((p,i)=>['title','period','role'].map(key=>({path:`projects.${i}.${key}`,value:p[key]}))),...content.career.flatMap((p,i)=>['organization','period','role'].map(key=>({path:`career.${i}.${key}`,value:p[key]}))),...content.evidence.map((e,i)=>({path:`evidence.${i}.title`,value:e.title}))];
const normalize=s=>s.toLowerCase().replace(/[^\p{L}\p{N}@]/gu,'');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
  for(const method of ['structured','free'])for(const width of [390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',javaScriptEnabled:false});
    await page.goto(`${base}/${method}.html`);
    await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode().catch(()=>{});}});
    const data=await page.evaluate(()=>{
      const body=document.body;
      const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);
      const anchors=[...document.querySelectorAll('a[href^="#"]')];
      return {bodyText:body.textContent,visibleText:body.innerText,overflow:document.documentElement.scrollWidth>innerWidth+1,pageHeight:body.scrollHeight,images:document.images.length,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src')?.slice(0,100)),missingAnchors:anchors.filter(a=>!document.getElementById(a.getAttribute('href').slice(1))).map(a=>a.getAttribute('href')),duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i),h1Count:document.querySelectorAll('h1').length,headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>({tag:e.tagName,text:e.textContent})),focusStylePresent:[...document.styleSheets].some(s=>[...s.cssRules].some(r=>r.cssText.includes(':focus'))),reducedMotionPresent:[...document.styleSheets].some(s=>[...s.cssRules].some(r=>r.cssText.includes('prefers-reduced-motion')))};
    });
    const text=normalize(data.bodyText||'');
    const fields=probes.map(p=>({...p,matched:text.includes(normalize(p.value))}));
    const screenshot=`${method}-${width}.jpg`;
    await page.screenshot({path:path.join(out,screenshot),fullPage:true,type:'jpeg',quality:85});
    const {bodyText,visibleText,...metrics}=data;
    results.push({method,width,...metrics,identityFieldMatches:fields.filter(f=>f.matched).length,identityFieldsTotal:fields.length,missingFields:fields.filter(f=>!f.matched),fictionalLabel:visibleText.includes('가상'),screenshot,sha256:createHash('sha256').update(fs.readFileSync(path.join(out,screenshot))).digest('hex')});
    console.log(method,width,JSON.stringify({overflow:data.overflow,brokenImages:data.brokenImages.length,missingAnchors:data.missingAnchors.length,fields:fields.filter(f=>f.matched).length,total:fields.length}));
    fs.writeFileSync(path.join(out,method+'-text.txt'),bodyText||'');
    await page.close();
  }
  const keyboardDisclosures={};
  for(const method of ['structured','free']){
    const page=await browser.newPage({viewport:{width:1440,height:1000},javaScriptEnabled:false});await page.goto(`${base}/${method}.html`);
    await page.locator('#moa-flow summary').focus();await page.keyboard.press('Enter');
    keyboardDisclosures[method]=await page.locator('#moa-flow').getAttribute('open')!==null;
    await page.close();
  }
  const layoutPage=await browser.newPage({viewport:{width:1440,height:1000}});await layoutPage.goto(`${base}/free.html`);
  const freeCaseLayout=await layoutPage.locator('.case-grid').evaluateAll(nodes=>nodes.map(e=>{
    const head=e.querySelector('.case-head'),figure=e.querySelector('.case-figure');
    return {id:e.closest('article').id,headingColumn:getComputedStyle(head).gridColumn,imageColumn:getComputedStyle(figure).gridColumn,imageTopOffset:Math.round((figure.getBoundingClientRect().top-head.getBoundingClientRect().top)*10)/10};
  }));
  await layoutPage.close();
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({method:'chrome_common_viewports',results,keyboardDisclosures,freeCaseLayout,fieldMetric:'이름·제목·기간·역할·연락처·근거 제목의 문자열 일치. 문장 의미 보존 평가는 별도 시각 검토.'},null,2)+'\n');
}finally{await browser.close();}
