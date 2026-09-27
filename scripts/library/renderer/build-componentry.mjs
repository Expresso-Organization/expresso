// 수집한 Componentry 원본을 독립 iframe에서 실제 React 컴포넌트로 실행합니다.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as esbuild from 'esbuild';
import ts from 'typescript';
import {componentryFixtures,componentryDefaultFixture,portfolioFixtureNames} from './componentry-fixtures.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const sourceDir=path.join(root,'docs/library/materials/componentry/source');
const supportDir=path.join(root,'docs/library/materials/componentry/support');
const out=path.join(root,'docs/library/previews/componentry');
const rendererDir=path.join(root,'scripts/library/renderer');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'docs/library/componentry.json')));
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const external=['react','react-dom','react-dom/client','react/jsx-runtime','framer-motion','lucide-react'];
const requireBanner='var require=function(name){if(!(name in window.__exModules))throw new Error("실행 모듈 누락: "+name);return window.__exModules[name]};';
const csp="default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; media-src 'self' https: blob: data:; connect-src data:; form-action 'none'; base-uri 'none'";
fs.mkdirSync(out,{recursive:true});
const vendor=external.map((name,index)=>`import * as M${index} from ${JSON.stringify(name)};`).join('\n')+
  `\nwindow.__exModules={${external.map((name,index)=>`${JSON.stringify(name)}:M${index}`).join(',')}};`;
await esbuild.build({stdin:{contents:vendor,resolveDir:rendererDir,loader:'js'},
  outfile:path.join(out,'vendor.js'),bundle:true,platform:'browser',format:'iife',minify:true,
  nodePaths:[path.join(rendererDir,'node_modules')],logLevel:'silent',
  define:{'process.env.NODE_ENV':'"production"'}});

const cssSource=fs.readFileSync(path.join(supportDir,'globals.css'),'utf8')
  .replaceAll(/^@source .+;\s*$/gm,'')
  .replace('@import "tailwindcss";','@import "tailwindcss";\n@source "../../../docs/library/materials/componentry/source";\n@source "./componentry-fixtures.mjs";');
const cssInput=path.join(rendererDir,'componentry-preview.css');
fs.writeFileSync(cssInput,cssSource+'\nhtml,body{margin:0;min-height:100%;}body{min-width:320px;}#demo{height:740px;min-height:740px;}@media(prefers-reduced-motion:reduce){*,::before,::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}\n');
const cli=path.join(rendererDir,'node_modules/@tailwindcss/cli/dist/index.mjs');
const css=spawnSync(process.execPath,[cli,'-i',cssInput,'-o',path.join(out,'preview.css'),'--minify'],{cwd:root,encoding:'utf8'});
if(css.status!==0)throw new Error(css.stderr||'Componentry 스타일 빌드 실패');

function componentExport(file,name){
  const text=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const names=[];
  let hasDefault=false;
  for(const node of ast.statements){
    if(ts.isExportAssignment(node)&&!node.isExportEquals)hasDefault=true;
    if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))hasDefault=true;
    if(ts.isExportDeclaration(node)&&node.exportClause&&ts.isNamedExports(node.exportClause))
      for(const element of node.exportClause.elements)if(!element.isTypeOnly)names.push(element.name.text);
    if(!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
    if(ts.isFunctionDeclaration(node)&&node.name)names.push(node.name.text);
    if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)
      if(ts.isIdentifier(declaration.name))names.push(declaration.name.text);
  }
  if(hasDefault)return 'default';
  const normalized=name.replace(/[^a-z0-9]/gi,'').toLowerCase();
  return names.find(value=>value.toLowerCase()===normalized)
    ||names.find(value=>/^[A-Z]/.test(value)&&!/Props$/.test(value))
    ||null;
}

const supportPlugin={name:'componentry-support',setup(build){
  build.onResolve({filter:/^@workspace\/ui\/(?:lib\/utils|components\/webgl-error-boundary)$/},args=>({
    path:path.join(supportDir,args.path.endsWith('utils')?'utils.ts':'webgl-error-boundary.tsx'),
  }));
  build.onLoad({filter:/\/materials\/componentry\/source\/[^/]+\.tsx$/},args=>({
    contents:fs.readFileSync(args.path,'utf8')
      .replaceAll('"/images/','"https://componentry.dev/images/')
      .replaceAll('"/audio/','"https://componentry.dev/audio/'),
    loader:'tsx',resolveDir:path.dirname(args.path),
  }));
}};
const resultsPath=path.join(out,'build-results.json');
const results=only&&fs.existsSync(resultsPath)?JSON.parse(fs.readFileSync(resultsPath)):[];
const record=result=>{const index=results.findIndex(row=>row.id===result.id);if(index<0)results.push(result);else results[index]=result;};
for(const item of catalog.additions){
  const name=item.sourceItemId;
  if(only&&!only.includes(name))continue;
  const input=path.join(sourceDir,name+'.tsx');
  const member=componentExport(input,name);
  const result={id:item.id,name,member,url:`./library/previews/componentry/${item.id}.html`,status:'build_failed',fictionalPortfolio:portfolioFixtureNames.has(name)};
  if(!member){result.reason='실행 가능한 export를 찾지 못했습니다.';record(result);continue;}
  const fixture=componentryFixtures[name]||componentryDefaultFixture;
  const fixturePrelude=name==='github-calendar'?`const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{
    if(String(input).startsWith('https://github-contributions-api.deno.dev/')){
      const levels=['NONE','FIRST_QUARTILE','SECOND_QUARTILE','THIRD_QUARTILE','FOURTH_QUARTILE'];
      const contributions=Array.from({length:52},(_,week)=>Array.from({length:7},(_,day)=>({
        date:new Date(Date.UTC(2025,8,28)+(week*7+day)*86400000).toISOString().slice(0,10),
        contributionCount:(week*3+day*5)%7,contributionLevel:levels[(week*3+day*5)%5],color:'#22c55e'})));
      return Promise.resolve(new Response(JSON.stringify({contributions,totalContributions:844}),{status:200,headers:{'Content-Type':'application/json'}}));
    }return originalFetch(input,init);
  };`:'';
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import * as E from ${JSON.stringify(input)};
const C=E[${JSON.stringify(member)}];
${fixturePrelude}
function View(){return ${fixture}}
function report(status,reason=''){document.documentElement.dataset.previewStatus=status;document.documentElement.dataset.previewReason=reason;parent.postMessage({type:'expresso-componentry-preview',id:${JSON.stringify(item.id)},status,reason},'*')}
class Boundary extends React.Component{state={error:null};static getDerivedStateFromError(e){return {error:String(e)}}componentDidCatch(e){report('error',String(e))}render(){return this.state.error?<pre role="alert">{this.state.error}</pre>:this.props.children}}
window.addEventListener('error',event=>report('error',event.message));window.addEventListener('unhandledrejection',event=>report('error',String(event.reason)));
createRoot(document.getElementById('demo')).render(<Boundary><View/></Boundary>);
setTimeout(()=>{if(document.documentElement.dataset.previewStatus==='error')return;const d=document.getElementById('demo');const visible=[...d.querySelectorAll('*')].some(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>2&&r.height>2&&(e.textContent.trim()||e.matches('input,textarea,select,button,svg,canvas,img,video')||s.backgroundImage!=='none'||(s.backgroundColor!=='rgba(0, 0, 0, 0)'&&s.backgroundColor!=='transparent'))});report(visible?'ready':'empty',visible?'':'컴포넌트의 표시 내용이 없습니다.')},3500);`;
  try{
    await esbuild.build({stdin:{contents:entry,resolveDir:rendererDir,sourcefile:item.id+'.tsx',loader:'tsx'},
      outfile:path.join(out,item.id+'.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',minify:true,
      logLevel:'silent',legalComments:'linked',nodePaths:[path.join(rendererDir,'node_modules')],
      external,banner:{js:requireBanner},plugins:[supportPlugin],
      loader:{'.svg':'dataurl','.png':'dataurl','.jpg':'dataurl','.webp':'dataurl'},
      define:{'process.env.NODE_ENV':'"production"'}});
    const fictionalBadge=result.fictionalPortfolio?'<div class="fictional-badge">가상 포트폴리오 예제 · 실제 인물·경력·성과 아님</div>':'';
    fs.writeFileSync(path.join(out,item.id+'.html'),`<!doctype html><html lang="ko" class="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${item.title} · Componentry 실행 예제</title><link rel="stylesheet" href="preview.css"><style>body{overflow-x:hidden}#demo{position:relative;height:740px;min-height:740px}button,input,select{font:inherit}.fictional-badge{position:fixed;top:12px;right:12px;z-index:9999;max-width:calc(100vw - 24px);padding:8px 12px;border:1px solid #d8c49d;border-radius:999px;background:#fffaf0ed;color:#674a27;font:600 12px/1.4 system-ui,sans-serif;box-shadow:0 2px 14px #20150d1c;pointer-events:none}</style><body>${fictionalBadge}<div id="demo"></div><script src="vendor.js"></script><script src="${item.id}.js"></script></body></html>`);
    result.status='built';
    result.fixture=fixture
      .replace(/data:font\/otf;base64,[A-Za-z0-9+/=]+/g,'[원본 폰트 인라인 데이터]')
      .replace(/data:image\/svg\+xml;charset=utf-8,[^" ]+/g,'[원본 SVG 인라인 데이터]');
  }catch(error){result.reason=error.errors?.map(row=>row.text).join('; ')||error.message;}
  record(result);
}
results.sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync(resultsPath,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.reduce((summary,result)=>(summary[result.status]=(summary[result.status]||0)+1,summary),{})));
