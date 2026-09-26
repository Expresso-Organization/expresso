// 공개 라이선스의 원본을 수정하지 않고 별도 iframe용 예제를 빌드합니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.join(root,'artifacts/portfolio-library/stage-2/repos/watermelon');
const work = path.join(root,'artifacts/portfolio-library/stage-2/preview-build');
const out = path.join(root,'docs/library/previews/watermelon');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'docs/library/catalog.json')));
const registry=JSON.parse(fs.readFileSync(path.join(repo,'registry.json')));
const fixtures=JSON.parse(fs.readFileSync(path.join(root,'scripts/library/renderer/fixtures.json')));
const modules=['react','react-dom','react-dom/client','react/jsx-runtime','motion/react','framer-motion','lucide-react'];
const nodePaths=[path.join(root,'scripts/library/renderer/node_modules')];
const base={bundle:true,platform:'browser',format:'iife',minify:true,jsx:'automatic',nodePaths,alias:{'@':path.join(repo,'src')},logLevel:'silent',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'},loader:{'.svg':'dataurl','.png':'dataurl','.jpg':'dataurl','.avif':'dataurl','.webp':'dataurl'}};
const vendor=modules.map((name,n)=>`import * as M${n} from ${JSON.stringify(name)};`).join('\n')+`\nwindow.__exModules={${modules.map((name,n)=>`${JSON.stringify(name)}:M${n}`).join(',')}};`;
await esbuild.build({...base,stdin:{contents:vendor,resolveDir:path.join(root,'scripts/library/renderer'),loader:'js'},outfile:path.join(out,'vendor.js')});
const exportsFor = file => {
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const values=[];let hasDefault=false;
 for(const node of source.statements){
  if(ts.isExportAssignment(node)&&!node.isExportEquals) hasDefault=true;
  if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)) hasDefault=true;
  if(!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  if(ts.isFunctionDeclaration(node)&&node.name)values.push(node.name.text);
  if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)if(ts.isIdentifier(d.name))values.push(d.name.text);
 }
 const normalized=path.basename(file,'.tsx').replace(/[^a-z0-9]/gi,'').toLowerCase();
 return hasDefault?'default':values.find(v=>v.toLowerCase()===normalized)||values.find(v=>/^[A-Z]/.test(v));
};
const selection=/^(hero-\d+|bento-\d+|features?-\d+|footer-\d+|cta-\d+|testimonials?-\d+|stats?-\d+|team-\d+|about-\d+|portfolio-.*|image-gallery.*|image-carousel.*|aave-swap-component|activities-card|profile-card.*|projects?.*|experience.*)$/;
const results=[];const seen=new Set();
for (const item of registry.items){
 if(!selection.test(item.name)||seen.has(item.name))continue;seen.add(item.name);
 const entry=item.name==='project-management-dashboard'?{path:'src/components/dashboards/project-management-dashboard/demo.tsx'}:item.files.find(f=>/\.(tsx|jsx)$/.test(f.path));if(!entry)continue;
 const input=path.join(repo,entry.path);if(!fs.existsSync(input))continue;
 const member=exportsFor(input);if(!member){results.push({name:item.name,status:'missing_export'});continue;}
 // 미리보기 iframe에서 외부 통신을 하지 않는 항목을 우선 빌드합니다.
 const text=fs.readFileSync(input,'utf8');
 if(/\b(?:fetch|eval|XMLHttpRequest)\s*\(|document\.cookie|window\.parent|window\.top/.test(text)){
  results.push({name:item.name,status:'needs_runtime_review'});continue;
 }
 const props=fixtures[item.name]||{};
 const file=path.join(work,item.name+'.tsx');
 fs.writeFileSync(file,`import React from 'react'; import {createRoot} from 'react-dom/client'; import * as Example from ${JSON.stringify(input)};
 class Boundary extends React.Component { state={error:null}; static getDerivedStateFromError(e){return {error:e.message}} componentDidCatch(e){report('error',e.message)} render(){return this.state.error?<p role="alert">예제 입력 또는 실행 환경 확인 필요</p>:this.props.children} }
 function snapshot(){
 const root=document.getElementById('root');const clone=root.cloneNode(true);const originals=[root,...root.querySelectorAll('*')];const copies=[clone,...clone.querySelectorAll('*')];
 for(let n=0;n<originals.length;n++){const original=originals[n],copy=copies[n];if(!original.style?.length)continue;const computed=getComputedStyle(original);for(const name of [...original.style]){if(!name.startsWith('--'))copy.style.setProperty(name,computed.getPropertyValue(name));}}
 return clone.outerHTML;
 }
 function report(status,reason=''){document.documentElement.dataset.previewStatus=status;document.documentElement.dataset.previewReason=reason;parent.postMessage({type:'expresso-preview',id:${JSON.stringify(item.name)},status,reason,html:status==='ready'?snapshot():''},'*')}
 const View=Example[${JSON.stringify(member)}];
 createRoot(document.getElementById('root')).render(<Boundary><View {...${JSON.stringify(props)}}/></Boundary>);
 window.addEventListener('error',e=>report('error',e.message));
 setTimeout(()=>{if(document.documentElement.dataset.previewStatus==='error')return;const root=document.getElementById('root');const meaningful=root.textContent.trim()||root.querySelector('svg,img,canvas,video');report(meaningful?'ready':'empty',meaningful?'':'표시할 예제 데이터가 없습니다.')},2200);
 `);
 try{
  await esbuild.build({...base,entryPoints:[file],external:modules,banner:{js:'var require=function(name){if(!(name in window.__exModules))throw new Error("Missing preview module: "+name);return window.__exModules[name]};'},outfile:path.join(out,item.name+'.js')});
  const csp="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
  fs.writeFileSync(path.join(out,item.name+'.html'),`<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${item.name} · Watermelon preview</title><link rel="stylesheet" href="preview.css"><body><div id="root"></div><script src="vendor.js"></script><script src="${item.name}.js"></script></body></html>`);
  results.push({name:item.name,status:'built',export:member,props,entry:entry.path,url:`./library/previews/watermelon/${item.name}.html`});
 }catch(e){results.push({name:item.name,status:'build_failed',reason:e.errors?.map(e=>e.text).join('; ')||e.message});}
}
const css=`@import "tailwindcss"; @source "../../../artifacts/portfolio-library/stage-2/repos/watermelon/src";
@theme inline { --color-background:var(--ex-bg); --color-foreground:var(--ex-fg); --color-card:var(--ex-bg); --color-card-foreground:var(--ex-fg); --color-popover:var(--ex-bg); --color-popover-foreground:var(--ex-fg); --color-primary:var(--ex-fg); --color-primary-foreground:var(--ex-bg); --color-secondary:var(--ex-bg-muted); --color-secondary-foreground:var(--ex-fg); --color-muted:var(--ex-bg-muted); --color-muted-foreground:var(--ex-fg-muted); --color-accent:var(--ex-bg-muted); --color-accent-foreground:var(--ex-fg); --color-destructive:var(--ex-danger); --color-border:var(--ex-border); --color-input:var(--ex-border); --color-ring:var(--ex-fg-muted); --radius-lg:9px; --radius-md:7px; --radius-sm:4px; }
html,body{margin:0;min-height:100%;background:var(--ex-bg);color:var(--ex-fg);font-family:var(--ex-font-ui)}
body{min-width:320px} #root{min-height:100vh} *,::before,::after{border-color:var(--ex-border)}
@media(prefers-reduced-motion:reduce){*,::before,::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;
fs.writeFileSync(path.join(root,'scripts/library/renderer/preview.css'),css);
const tailwind=spawnSync(process.execPath,[path.join(root,'scripts/library/renderer/node_modules/@tailwindcss/cli/dist/index.mjs'),'-i',path.join(root,'scripts/library/renderer/preview.css'),'-o',path.join(work,'tailwind.css'),'--minify'],{encoding:'utf8',cwd:root});
if(tailwind.status!==0)throw new Error(tailwind.stderr);
// 익스프레소 호스트의 폰트·의미 토큰을 사용하며 원본 컴포넌트 코드는 그대로 보존합니다.
fs.writeFileSync(path.join(out,'preview.css'),fs.readFileSync(path.join(root,'services/web/src/styles/tokens.css'),'utf8')+'\n'+fs.readFileSync(path.join(work,'tailwind.css'),'utf8'));
fs.writeFileSync(path.join(out,'build-results.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({total:results.length,counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));

const licenseBlocks=[];const seenPackages=new Set();
const storeDir=path.join(root,'scripts/library/renderer/node_modules/.pnpm');
for(const directory of fs.readdirSync(storeDir,{withFileTypes:true})){
 if(!directory.isDirectory())continue;const modulesDir=path.join(storeDir,directory.name,'node_modules');if(!fs.existsSync(modulesDir))continue;
 const packages=[];
 for(const entry of fs.readdirSync(modulesDir,{withFileTypes:true})){
  const p=path.join(modulesDir,entry.name);if(entry.name.startsWith('@')&&fs.statSync(p).isDirectory())for(const child of fs.readdirSync(p))packages.push(path.join(p,child));else packages.push(p);
 }
 for(const packageDir of packages){try{const pkg=JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8'));const key=pkg.name+'@'+pkg.version;if(seenPackages.has(key))continue;seenPackages.add(key);const notices=fs.readdirSync(packageDir).filter(n=>/^(license|notice|copying)(\.|$)/i.test(n)&&fs.statSync(path.join(packageDir,n)).isFile());if(notices.length)licenseBlocks.push(key+'\n'+notices.map(n=>fs.readFileSync(path.join(packageDir,n),'utf8')).join('\n'));}catch{}}
}
fs.writeFileSync(path.join(out,'dependency-licenses.txt'),licenseBlocks.sort().join('\n\n'+'='.repeat(70)+'\n'));
