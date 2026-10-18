import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import * as esbuild from 'esbuild';
import {recipes,caseVariants,evidenceVariants,componentChoices,selectedComponents,bentoComponents,defaultComponents,planSchema,defaultPlan,compilePlan,candidates} from './portfolio/v1/catalog.mjs';
import {motionPresets,defaultMotion,variantFile} from './portfolio/v1/motion.mjs';
import {componentMotions} from './portfolio/v1/motion-catalog.mjs';
import {fixture,scenarios} from './portfolio/v1/fixtures.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const out=path.join(root,'docs/library/previews/portfolio'),cache=path.join(here,'node_modules/.cache/portfolio-variants');
fs.mkdirSync(cache,{recursive:true});
for(const [name,source] of [['card','watermelon/registry/card.json'],['timeline','magic-portfolio/timeline.json']]){
  const data=JSON.parse(fs.readFileSync(path.join(root,'docs/library/materials',source)));
  fs.writeFileSync(path.join(cache,name+'.tsx'),data.files.find(f=>f.path.endsWith(name+'.tsx')).content.replaceAll('"@/lib/utils"','"@workspace/ui/lib/utils"'));
}
const collected={card:path.join(cache,'card.tsx'),timeline:path.join(cache,'timeline.tsx'),'annotated-text':path.join(root,'docs/library/materials/componentry/source/annotated-text.tsx')};
const plugin={name:'collected-variants',setup(build){
  build.onResolve({filter:/^@collected\//},args=>({path:collected[args.path.slice(11)]}));
  build.onResolve({filter:/^@workspace\/ui\/lib\/utils$/},()=>({path:path.join(root,'docs/library/materials/componentry/support/utils.ts')}));
}};
const common={bundle:true,jsx:'automatic',nodePaths:[path.join(here,'node_modules')],plugins:[plugin],logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}};
await esbuild.build({...common,entryPoints:[path.join(here,'portfolio/v1/app.jsx')],outfile:path.join(out,'variants.js'),format:'iife',platform:'browser',minify:true,legalComments:'linked'});
const server=path.join(cache,'ssr.mjs');
await esbuild.build({...common,entryPoints:[path.join(here,'portfolio/v1/ssr.jsx')],outfile:server,format:'esm',platform:'node',external:['react','react/jsx-runtime','react-dom/server','@json-render/*','zod','clsx','tailwind-merge']});
const {render}=await import(pathToFileURL(server).href);
const motionBuild=await esbuild.build({entryPoints:[path.join(here,'portfolio/v1/motion-export.mjs')],bundle:true,format:'iife',platform:'browser',minify:true,write:false});
const motionRuntime=motionBuild.outputFiles[0].text.trim(),motionHash=createHash('sha256').update(motionRuntime).digest('base64');
const css=fs.readFileSync(path.join(out,'style.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/styles.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/directions.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/showcase.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/selected-components.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/expanded-components.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/library-components.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/motion.css'),'utf8')+'\n'+fs.readFileSync(path.join(here,'portfolio/v1/motion-library.css'),'utf8');
fs.writeFileSync(path.join(out,'variants.css'),css);
const csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
const shell=(body,styles,scripts='',policy=csp)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>포트폴리오 구성안 · 가상 데이터</title>${styles}</head><body>${body}${scripts}</body></html>`;
// 초기 비교 결과는 고정 파일과 별도 진입점으로 계속 볼 수 있습니다.
fs.writeFileSync(path.join(out,'baseline.html'),shell('<div id="root"></div>','<link rel="stylesheet" href="./style.css">','<script src="./app.js"></script>').replace("font-src 'self' data:","font-src 'self'"));
fs.writeFileSync(path.join(out,'index.html'),shell('<div id="root"></div>','<link rel="stylesheet" href="./variants.css">','<script src="./variants.js"></script>'));
const fontNotice=fs.readFileSync(path.join(out,'assets/editorial-font-OFL.txt'),'utf8');
const notices=fs.readFileSync(path.join(out,'THIRD-PARTY-NOTICES.txt'),'utf8').replaceAll('--','—');
const variants=[];
for(const recipe of Object.keys(recipes))for(const scenario of Object.keys(scenarios))for(const motion of Object.keys(motionPresets))for(const componentSet of Object.keys(componentChoices)){
  const content=fixture(scenario),plan=defaultPlan(content,recipe,motion,componentSet==='selected'?selectedComponents:componentSet==='bento'?bentoComponents:defaultComponents),compiled=compilePlan(plan,content),file=variantFile(recipe,scenario,motion,componentSet);
  let html=render(plan,content);
  for(const image of ['portfolio-moa-map.svg','portfolio-lumen-note.svg','portfolio-ongil-guide.svg'])html=html.replaceAll('./assets/'+image,'data:image/svg+xml;base64,'+fs.readFileSync(path.join(out,'assets',image)).toString('base64'));
  // 단일 HTML에서도 같은 한글 서체를 쓰도록 필요한 방향에만 서체를 포함합니다.
  const staticCss=recipe==='featured'?css.replace('./assets/expresso-editorial.woff','data:font/woff;base64,'+fs.readFileSync(path.join(out,'assets/expresso-editorial.woff')).toString('base64')):css.replace(/@font-face\{[^}]+\}/,'');
  fs.writeFileSync(path.join(out,file+'.static.html'),shell(html,`<style>${staticCss}</style>`,motion==='none'?'':`<script data-portfolio-motion>${motionRuntime}</script>`,csp.replace("script-src 'self'",motion==='none'?"script-src 'none'":`script-src 'sha256-${motionHash}'`))+`\n<!-- THIRD-PARTY NOTICES\n${notices}\n${recipe==='featured'?fontNotice:''}\n-->\n`);
  fs.writeFileSync(path.join(out,file+'.json'),JSON.stringify({schemaVersion:2,plan,spec:compiled.spec,content,motionSupport:compiled.motionSupport.map(c=>c.id),eligible:content.projects.map(p=>({id:p.id,variants:candidates(p)}))},null,2)+'\n');
  variants.push({recipe,scenario,motion,componentSet,file,planBytes:Buffer.byteLength(JSON.stringify(plan)),specBytes:Buffer.byteLength(JSON.stringify(compiled.spec)),cases:plan.cases});
}
fs.writeFileSync(path.join(out,'variants-plan-schema.json'),JSON.stringify(z.toJSONSchema(planSchema),null,2)+'\n');
fs.writeFileSync(path.join(out,'variants-prompt.txt'),'공통 원문을 유지하고, 제공된 후보에서 프로젝트별 표현을 선택합니다. version=1, recipe, cases[{projectId,variant}], evidence, motion{preset}, 선택한 경우 design{palette,typography,layout}, components{projectIndex,heroStyle,heroAnnotation,heroReveal,careerStyle,evidenceStyle,contactStyle}를 출력합니다. 프로젝트마다 정확히 한 번 선택하고 ID를 유지합니다. media는 이미지가 있는 후보, process는 문제·기여·결과의 과정 참조가 있는 후보에만 허용됩니다. recipe는 featured 또는 gallery, evidence는 grouped 또는 expanded입니다. motion.preset은 none, subtle, showcase 중 하나입니다. components.projectIndex는 default, orbit, bento, mosaic 중 하나입니다. components.heroStyle은 classic, gradient, spotlight 중 하나입니다. design.palette은 paper, electric, midnight, design.typography는 serif, sans, display, design.layout은 editorial, poster, studio 중 하나입니다. heroAnnotation은 off 또는 drawn, heroReveal은 block 또는 lines, careerStyle은 default 또는 ribbon, evidenceStyle은 default 또는 preview, contactStyle은 default 또는 card입니다. 시간·거리·코드는 출력하지 않습니다. HTML/CSS와 원문을 생성하지 않습니다.\n');
const files=['catalog.mjs','fixtures.mjs','registry.jsx','styles.css','directions.css','showcase.jsx','showcase.css','showcase-fixtures.mjs','selected-components.jsx','selected-components.css','expanded-components.jsx','expanded-components.css','library-components.jsx','library-components.css','motion.mjs','motion.css','motion-export.mjs','motion-catalog.mjs','motion-library.jsx','motion-library.css','app.jsx'];
const sources=files.map(file=>({path:`scripts/library/renderer/portfolio/v1/${file}`,sha256:createHash('sha256').update(fs.readFileSync(path.join(here,'portfolio/v1',file))).digest('hex')}));
sources.push({path:'scripts/library/renderer/audit-portfolio-motion.mjs',sha256:createHash('sha256').update(fs.readFileSync(path.join(here,'audit-portfolio-motion.mjs'))).digest('hex')});
fs.writeFileSync(path.join(out,'variants-sources.json'),JSON.stringify({schemaVersion:1,renderer:'@json-render/react@0.21.0',recipes,caseVariants,evidenceVariants,componentChoices,motionPresets,motionRuntime:{bytes:Buffer.byteLength(motionRuntime),sha256:motionHash},variants,sources,originalSources:'./sources.json',note:'이 72개는 고정 회귀용 구성안입니다. 모델이 직접 선택하고 작성한 Spec의 결과는 runs/library-*-service-designer에 별도로 있습니다. 제품 API·Worker 연결은 후속 단계입니다.'},null,2)+'\n');
fs.writeFileSync(path.join(out,'component-motion-catalog.json'),JSON.stringify({schemaVersion:1,scope:'현재 생성용 컴포넌트',components:componentMotions},null,2)+'\n');
await import('./audit-portfolio-motion.mjs');
console.log('두 구성안 × 네 입력 × 세 모션 × 세 컴포넌트 조합의 실제 렌더링과 단일 HTML 생성 완료');
