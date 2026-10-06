// 포털과 같은 iframe sandbox 조건에서 모든 Componentry 예제를 확인합니다.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'docs/library/previews/componentry');
const feed=JSON.parse(fs.readFileSync(path.join(root,'docs/library/componentry.json')));
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const targets=feed.additions.filter(item=>!only||only.includes(item.sourceItemId));
const base=process.env.COMPONENTRY_PREVIEW_BASE||'http://127.0.0.1:8918';
const chrome=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({...(fs.existsSync(chrome)?{executablePath:chrome}:{}),headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
const resultsPath=path.join(out,'embed-verification.json');
const results=only&&fs.existsSync(resultsPath)?JSON.parse(fs.readFileSync(resultsPath)).results:[];
let processed=0;
let next=0;
async function worker(){
  while(next<targets.length){
    const item=targets[next++];
    const page=await browser.newPage({viewport:{width:1280,height:880}});
    const src=`${base}/docs/library/previews/componentry/${item.id}.html`;
    let status='timeout',reason='';
    try{
      await page.setContent(`<iframe sandbox="allow-scripts" src="${src}" style="width:1280px;height:740px;border:0"></iframe>`);
      const html=page.frameLocator('iframe').locator('html');
      await page.frameLocator('iframe').locator('html[data-preview-status]').waitFor({
        timeout:item.sourceItemId==='newsletter-bookshelf'?60000:25000});
      status=await html.getAttribute('data-preview-status');
      reason=await html.getAttribute('data-preview-reason')||'';
      const alert=page.frameLocator('iframe').locator('#demo [role="alert"]');
      if(await alert.count()){status='error';reason=(await alert.first().innerText()).slice(0,300);}
    }catch(error){reason=error.message.slice(0,300);}
    const result={id:item.id,name:item.sourceItemId,status,reason};
    const index=results.findIndex(row=>row.id===result.id);
    if(index<0)results.push(result);else results[index]=result;
    console.log(`${++processed}/${targets.length} ${item.sourceItemId} ${status}${reason?' '+reason.slice(0,80):''}`);
    await page.close();
  }
}
await worker();
await browser.close();
results.sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync(resultsPath,JSON.stringify({method:'sandbox_iframe',results},null,2)+'\n');
if(results.some(row=>row.status!=='ready'))process.exitCode=1;
console.log(JSON.stringify(results.reduce((counts,row)=>(counts[row.status]=(counts[row.status]||0)+1,counts),{})));
