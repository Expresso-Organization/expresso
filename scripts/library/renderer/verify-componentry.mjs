// 브라우저에서 원본 실행 상태를 확인하고 카드용 실제 렌더 화면을 캡처합니다.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'docs/library/previews/componentry');
const builds=JSON.parse(fs.readFileSync(path.join(out,'build-results.json')));
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const targets=builds.filter(item=>item.status==='built'&&(!only||only.includes(item.name)));
const base=process.env.COMPONENTRY_PREVIEW_BASE||'http://127.0.0.1:8918';
const chrome=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({...(fs.existsSync(chrome)?{executablePath:chrome}:{}),headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
const resultsPath=path.join(out,'verification.json');
const results=only&&fs.existsSync(resultsPath)?JSON.parse(fs.readFileSync(resultsPath)).results:[];
let processed=0;
let next=0;
async function worker(){
  while(next<targets.length){
    const item=targets[next++];
    const page=await browser.newPage({viewport:{width:1280,height:880},deviceScaleFactor:1,reducedMotion:'no-preference'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const url=`${base}/docs/library/previews/componentry/${item.id}.html`;
    let status='timeout',reason='브라우저 렌더 상태를 확인하지 못했습니다.';
    try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForFunction(()=>Boolean(document.documentElement.dataset.previewStatus),null,
        {timeout:item.name==='newsletter-bookshelf'?60000:25000});
      status=await page.locator('html').getAttribute('data-preview-status');
      reason=await page.locator('html').getAttribute('data-preview-reason')||'';
      if(status==='ready'){
        const scrollCapture={'case-study-flip-stack':1000,'sticky-scroll-cards':950,'scroll-split-card':2900};
        if(scrollCapture[item.name]){
          await page.evaluate(y=>window.scrollTo(0,y),scrollCapture[item.name]);
          await page.waitForTimeout(700);
        }
        if(item.name==='image-trail'){
          await page.mouse.move(150,180);
          await page.mouse.move(900,540,{steps:18});
          await page.waitForTimeout(250);
        }
        const alert=page.locator('#demo [role="alert"]');
        if(await alert.count()){
          status='error';reason=(await alert.first().innerText()).slice(0,300);
        }
      }
      if(status==='ready'){
        await page.screenshot({path:path.join(out,item.id+'.jpg'),type:'jpeg',quality:78,
          clip:{x:0,y:0,width:1280,height:740}});
      }
    }catch(error){reason=error.message;}
    const result={id:item.id,name:item.name,status,reason,errors:errors.slice(0,3)};
    if(status==='ready'){
      const bytes=fs.readFileSync(path.join(out,item.id+'.jpg'));
      result.snapshotSha256=createHash('sha256').update(bytes).digest('hex');
      result.snapshotBytes=bytes.length;
    }
    const index=results.findIndex(row=>row.id===result.id);
    if(index<0)results.push(result);else results[index]=result;
    console.log(`${++processed}/${targets.length} ${item.name} ${status}${reason?' '+reason.slice(0,110):''}`);
    await page.close();
  }
}
await worker();
await browser.close();
results.sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync(resultsPath,JSON.stringify({method:'chrome_dom_and_screenshot',viewport:{width:1280,height:880},results},null,2)+'\n');
console.log(JSON.stringify(results.reduce((counts,row)=>(counts[row.status]=(counts[row.status]||0)+1,counts),{})));
