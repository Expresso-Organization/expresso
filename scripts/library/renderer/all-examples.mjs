// 원본 전체의 독립 예제를 빌드하며 실패는 별도로 기록합니다.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';
import ts from 'typescript';
import {wrapper} from './example-runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const repo=path.join(root,'artifacts/portfolio-library/stage-2/repos/watermelon');
const work=path.join(root,'artifacts/portfolio-library/all-examples');
const out=path.join(root,'docs/library/previews/examples');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const registry=read(path.join(repo,'registry.json'));
const catalog=read(path.join(root,'docs/library/catalog.json'));
const acquired=read(path.join(root,'docs/library/acquisitions.json'));
const fixtures=read(path.join(root,'scripts/library/renderer/fixtures.json'));
const autoPath=path.join(root,'scripts/library/renderer/auto-fixtures.json');const automatic=fs.existsSync(autoPath)?read(autoPath):{};
const snippets=fs.existsSync(path.join(root,'scripts/library/renderer/example-snippets.json'))?read(path.join(root,'scripts/library/renderer/example-snippets.json')):{};
let only=process.argv.find(v=>v.startsWith('--only='))?.slice(7).split(',');
const common=['@aliimam/icons','@aliimam/logos','recharts','radix-ui','@base-ui/react','react-aria-components','react-router-dom'];
const radixModules=Object.keys(read(path.join(root,'scripts/library/renderer/package.json')).dependencies).filter(n=>n.startsWith('@radix-ui/react-'));
const modules=['react','react-dom','react-dom/client','react/jsx-runtime','motion/react','framer-motion','lucide-react',...common,...radixModules];
const requireBanner='var require=function(name){if(name.startsWith("@base-ui/react/"))return window.__exModules["@base-ui/react"];if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing preview module: "+name);return window.__exModules[name]};';
for(const [i,name] of common.entries()){await esbuild.build({bundle:true,platform:'browser',format:'iife',minify:true,jsx:'automatic',logLevel:'silent',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'},stdin:{contents:`import * as M from ${JSON.stringify(name)};window.__exModules[${JSON.stringify(name)}]=M;`,resolveDir:path.join(root,'scripts/library/renderer'),loader:'js'},external:modules.filter(n=>n!==name&&!(name==='radix-ui'&&radixModules.includes(n))),banner:{js:requireBanner},outfile:path.join(out,'shared-'+i+'.js')});}
const resultsPath=path.join(out,'build-results.json');
const results=fs.existsSync(resultsPath)?read(resultsPath):[];
if(process.argv.includes('--failed')){const checked=read(path.join(out,'verification.json')).results;only=results.filter(r=>r.status!=='built'||checked[r.id]?.status!=='ready').map(r=>r.name);}
const acquiredIds=new Set(acquired.items.filter(i=>i.preview?.kind==='local_frame').map(i=>i.id));
function exportsFor(file){
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const values=[];let def=false;
 for(const node of source.statements){
  if(ts.isExportAssignment(node)&&!node.isExportEquals)def=true;
  if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))def=true;
  if(ts.isExportDeclaration(node)&&node.exportClause&&ts.isNamedExports(node.exportClause))for(const e of node.exportClause.elements)if(!e.isTypeOnly&&!node.isTypeOnly)values.push(e.name.text);
  if(!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  if(ts.isFunctionDeclaration(node)&&node.name)values.push(node.name.text);
  if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)if(ts.isIdentifier(d.name))values.push(d.name.text);
 }
 const normalized=path.basename(file).replace(/\.[^.]+$/,'').replace(/-base$/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
 return {all:values,member:def?'default':values.find(v=>/Demo$/.test(v))||values.find(v=>v.toLowerCase()===normalized)||values.find(v=>/^[A-Z]/.test(v)&&!/(Props|Context|Provider|Style)$/.test(v))};
}
const csp="default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src https: data:; font-src https: data:; media-src https: blob: data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
const seen=new Set();
for(const item of registry.items){
 if(seen.has(item.name))continue;seen.add(item.name);
 const cat=catalog.items.find(c=>c.sourceSite==='watermelon'&&c.sourceItemId===item.name);
 if(!cat||acquiredIds.has(cat.id)||only&&!only.includes(item.name))continue;
 let entry=item.files.find(f=>/\.(tsx|jsx)$/.test(f.path))||item.files.find(f=>/\.ts$/.test(f.path));
 if(!entry)continue;
 let input=path.join(repo,entry.path);
 const group=entry.path.match(/^(src\/components\/(?:dashboards|templates)\/[^/]+)/)?.[1];
 const demo=group?path.join(repo,group,'demo.tsx'):path.join(path.dirname(input),'demo.tsx');
 if(/dashboards|templates/.test(entry.path)&&fs.existsSync(demo))input=demo;
 const exp=exportsFor(input);let custom=snippets[item.name]||(!input.endsWith('/demo.tsx')&&automatic[item.name]);
 let template=null;
 if(!custom&&exp.member!=='default'&&!/[0-9]/.test(item.name)&&!item.name.startsWith('use-')){
  const candidates=fs.readdirSync(path.join(repo,'src/components/base-variants'),{recursive:true}).filter(p=>p.endsWith('.tsx'));
  template=candidates.map(p=>path.join(repo,'src/components/base-variants',p)).find(p=>fs.readFileSync(p,'utf8').match(new RegExp('from [\\\'\"]@/components/ui/'+item.name+'[\\\'\"]')));
  if(template)custom=`import Template from ${JSON.stringify(template)};function View(){return <Template/>}`;
 }

 const result={demoEntry:template?path.relative(repo,template):null,id:cat.id,name:item.name,sourceSite:'watermelon',entry:path.relative(repo,input),mode:custom?'authored_fixture':'original_component',export:exp.member||null,props:fixtures[item.name]||{},url:`./library/previews/examples/${cat.id}.html`};
 try{
  if(!custom&&!exp.member)throw Error('실행 export·조합 예제 필요: '+exp.all.join(', '));
  let body=`import * as E from ${JSON.stringify(input)};\n`;
  if(custom)body+=custom;
  else body+=`const C=E[${JSON.stringify(exp.member)}];function View(){return <C {...${JSON.stringify(result.props)}}/>}`;
  const file=path.join(work,cat.id+'.tsx');fs.writeFileSync(file,wrapper(cat.id,body));
  const compiled=await esbuild.build({metafile:true,keepNames:true,bundle:true,platform:'browser',format:'iife',minify:true,jsx:'automatic',nodePaths:[path.join(root,'scripts/library/renderer/node_modules')],alias:{'@':path.join(repo,'src')},logLevel:'silent',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'},plugins:[...(template?[{name:'bind-original',setup(build){build.onResolve({filter:new RegExp('^@/components/ui/'+item.name+'$')},()=>({path:input}));}}]:[]),{name:'slick-interop',setup(build){build.onLoad({filter:/luminia-luxe-realestate\/ui\/Agents\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace("import Slider from 'react-slick';","import RawSlider from 'react-slick'; const Slider = RawSlider.default || RawSlider;"),loader:'tsx',resolveDir:path.dirname(args.path)}));}}],loader:{'.gif':'dataurl','.eot':'dataurl','.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl','.jpg':'dataurl','.avif':'dataurl','.webp':'dataurl'},entryPoints:[file],external:modules,banner:{js:requireBanner},outfile:path.join(out,cat.id+'.js')});
  const used=new Set(Object.values(compiled.metafile.outputs).flatMap(o=>o.imports.filter(i=>i.external).map(i=>i.path)));
  const sharedScripts=common.flatMap((n,i)=>(used.has(n)||(n==='@base-ui/react'&&[...used].some(v=>v.startsWith(n+'/')))||(n==='radix-ui'&&[...used].some(v=>radixModules.includes(v))))?[`<script src="shared-${i}.js"></script>`]:[]).join('');
  fs.writeFileSync(path.join(out,cat.id+'.html'),`<!doctype html><html lang="ko" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${item.name} 실행 예제</title><link rel="stylesheet" href="../watermelon/preview.css">${fs.existsSync(path.join(out,cat.id+'.css'))?`<link rel="stylesheet" href="${cat.id}.css">`:''}<style>body{padding:32px;box-sizing:border-box}#demo{min-height:220px;max-width:1160px;margin:auto}button,input,select{font:inherit}body:has([data-slot=sidebar-wrapper]){padding:0}</style><body><div id="demo"></div><script src="../watermelon/vendor.js"></script>${sharedScripts}<script src="${cat.id}.js"></script></body></html>`);
  result.status='built';if(item.name==='luminia-luxe-realestate')result.notes=['예제 빌드에서 react-slick의 CommonJS default 내보내기를 정규화했습니다. 원본 파일은 보존했습니다.'];
 }catch(e){result.status='build_failed';result.reason=e.errors?.map(x=>x.text).join('; ')||e.message;}
 const prior=results.findIndex(r=>r.id===result.id);if(prior>=0)results[prior]=result;else results.push(result);
 if(results.length%100===0)console.log('processed',results.length);
}
fs.writeFileSync(resultsPath,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})));
