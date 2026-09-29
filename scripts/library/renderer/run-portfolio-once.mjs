// 가상 콘텐츠와 새 구성안을 받아 기존 json-render Registry로 독립 HTML을 만듭니다.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {z} from 'zod';
import {validateContent,compilePlan,candidates} from './portfolio/v1/catalog.mjs';
import {modelSpecSchemaFor,validateModelSpec} from './portfolio/v1/model-spec.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const preview=path.join(root,'docs/library/previews/portfolio');
const flags=new Map();
for(let i=2;i<process.argv.length;i+=2){
 if(!process.argv[i]?.startsWith('--')||!process.argv[i+1])throw new Error('인자는 --이름 값 형식이어야 합니다.');
 flags.set(process.argv[i].slice(2),process.argv[i+1]);
}
for(const key of flags.keys())if(!['input','out','spec-model','spec','avoid'].includes(key))throw new Error('알 수 없는 인자: '+key);
if(!flags.get('input')||!flags.get('out')||Boolean(flags.get('spec-model'))===Boolean(flags.get('spec')))throw new Error('--input, --out, --spec-model 또는 --spec 중 하나가 필요합니다.');

const sha=value=>createHash('sha256').update(value).digest('hex');
const inputPath=path.resolve(flags.get('input'));
const out=path.resolve(flags.get('out'));
const input=fs.readFileSync(inputPath);
const content=validateContent(JSON.parse(input));
const previousPath=flags.get('avoid')?path.resolve(flags.get('avoid')):null;
const previous=previousPath?JSON.parse(fs.readFileSync(previousPath)):null;
const previousHtmlPath=previousPath?.replace(/\.json$/,'.static.html');
const previousHtmlHash=previous?.htmlSha256||(previousHtmlPath&&fs.existsSync(previousHtmlPath)?sha(fs.readFileSync(previousHtmlPath)):null);

async function askLocalModel(model,prompt,format){
 const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],stream:false,think:false,format,options:{temperature:0.35}}),signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw new Error(`Ollama HTTP ${response.status}`);
 const result=await response.json();
 if(typeof result.message?.content!=='string')throw new Error('Ollama 응답에 JSON이 없습니다.');
 return result.message.content;
}

async function generateSpecWithLocalModel(model){
 const projects=content.projects.map(project=>({id:project.id,title:project.title,category:project.category,allowedCaseVariants:candidates(project)}));
 const previousStyle=previous?.plan?JSON.stringify({recipe:previous.plan.recipe,projectIndex:previous.plan.components?.projectIndex}):'없음';
 const prompt=`json-render의 flat Spec JSON을 직접 작성하세요. root는 page, elements는 요소 ID를 키로 둔 객체입니다. JSON 외 문장을 출력하지 마세요. HTML·CSS·가상 경력 문장을 생성하지 마세요.\n입력은 가상 데이터입니다. 프로필: ${JSON.stringify({role:content.profile.role,headline:content.profile.headline,focus:content.profile.focus})}\n프로젝트: ${JSON.stringify(projects)}\n직전 구성: ${previousStyle}. 직전 결과가 있으면 recipe와 프로젝트 목록 표현을 다르게 선택하세요.\n요구하는 요소 ID: page, intro, work, 모든 프로젝트의 case-<id>, career, evidence, contact. page.children은 intro, work, 각 case, career/evidence, contact 순서입니다. 각 하위 요소의 children은 []입니다. 모든 프로젝트를 정확히 한 번 표시하세요.\n허용 타입과 props: page=PortfolioPage {profile:{$state:'/profile'},recipe:'featured'|'gallery',motion:{preset:'showcase'}}; intro=Hero {profile:{$state:'/profile'},projects:{$state:'/projects'},recipe:page와 동일,annotation:'off'|'drawn',reveal:'block'|'lines'}; work=ProjectIndex {projects:{$state:'/projects'},variant:'list'|'gallery'} 또는 OrbitProjectIndex/BentoProjectIndex {projects:{$state:'/projects'}}; case-<id>=ProjectCaseStudy {project:{$state:'/projectById/<id>'},variant:해당 프로젝트의 allowedCaseVariants 중 하나,ordinal:1부터 순서}; career=CareerTimeline 또는 CareerRibbon {career:{$state:'/career'}}; evidence=EvidenceCollection {groups:{$state:'/evidenceGroups'},variant:'grouped'|'expanded'} 또는 EvidencePreviews {groups:{$state:'/evidenceGroups'}}; contact=Contact 또는 ContactCard {contact:{$state:'/contact'}}. 다른 요소·속성·데이터 경로는 쓰지 마세요.\n결과는 {"root":"page","elements":{...}} 형태입니다. JSON 문자열에서 $state 키를 정확히 사용하세요.`;
 const attempts=[];
 for(let attempt=0;attempt<2;attempt++){
  const request=attempt?prompt+`\n이전 시도가 계약 검사에서 실패했습니다. 오류: ${attempts[0].error}. 이전 응답: ${attempts[0].output}. 오류를 고쳐 전체 Spec을 다시 생성하세요.`:prompt;
  const output=await askLocalModel(model,request,z.toJSONSchema(modelSpecSchemaFor(content)));
  try{
   const checked=validateModelSpec(JSON.parse(output),content);
   attempts.push({valid:true,outputSha256:sha(output),output});
   fs.mkdirSync(out,{recursive:true});
   fs.writeFileSync(path.join(out,'model-attempts.json'),JSON.stringify({model,attempts},null,2)+'\n');
   return {...checked,model,modelOutput:output,attempts};
  }catch(error){attempts.push({valid:false,error:error.message,outputSha256:sha(output),output});}
 }
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'model-attempts.json'),JSON.stringify({model,attempts},null,2)+'\n');
 throw new Error('모델 생성 Spec의 계약 검사 실패: '+attempts.map(item=>item.error).join(' / ')+' (원문: '+path.join(out,'model-attempts.json')+')');
}

const directSpec=flags.get('spec-model')?await generateSpecWithLocalModel(flags.get('spec-model')):{...validateModelSpec((input=>input.spec||input)(JSON.parse(fs.readFileSync(path.resolve(flags.get('spec'))))),content),model:null,modelOutput:null,attempts:[]};
const plan=directSpec.plan;
if(previous&&JSON.stringify({content,plan})===JSON.stringify({content:previous.content,plan:previous.plan}))throw new Error('직전 입력과 구성이 같습니다. 새 결과로 보고할 수 없습니다.');
const compiled=compilePlan(plan,content);
const spec=directSpec.spec;

const cache=path.join(here,'node_modules/.cache/portfolio-once');
fs.mkdirSync(cache,{recursive:true});
const collected={card:path.join(cache,'card.tsx'),timeline:path.join(cache,'timeline.tsx'),'annotated-text':path.join(root,'docs/library/materials/componentry/source/annotated-text.tsx')};
for(const [name,source] of [['card','watermelon/registry/card.json'],['timeline','magic-portfolio/timeline.json']]){
 const registry=JSON.parse(fs.readFileSync(path.join(root,'docs/library/materials',source)));
 fs.writeFileSync(collected[name],registry.files.find(file=>file.path.endsWith(name+'.tsx')).content.replaceAll('"@/lib/utils"','"@workspace/ui/lib/utils"'));
}
const plugin={name:'collected-variants',setup(build){
 build.onResolve({filter:/^@collected\//},args=>({path:collected[args.path.slice(11)]}));
 build.onResolve({filter:/^@workspace\/ui\/lib\/utils$/},()=>({path:path.join(root,'docs/library/materials/componentry/support/utils.ts')}));
}};
const common={bundle:true,jsx:'automatic',nodePaths:[path.join(here,'node_modules')],plugins:[plugin],logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}};
const server=path.join(cache,'ssr.mjs');
await esbuild.build({...common,entryPoints:[path.join(here,'portfolio/v1/ssr.jsx')],outfile:server,format:'esm',platform:'node',external:['react','react/jsx-runtime','react-dom/server','@json-render/*','zod','clsx','tailwind-merge']});
const {renderSpec}=await import(pathToFileURL(server).href+'?run='+Date.now());
const motionBuild=await esbuild.build({entryPoints:[path.join(here,'portfolio/v1/motion-export.mjs')],bundle:true,format:'iife',platform:'browser',minify:true,write:false});
const motionRuntime=motionBuild.outputFiles[0].text.trim();
const motionHash=createHash('sha256').update(motionRuntime).digest('base64');
const css=fs.readFileSync(path.join(preview,'style.css'),'utf8')+'\n'+['styles.css','directions.css','showcase.css','selected-components.css','expanded-components.css','motion.css'].map(name=>fs.readFileSync(path.join(here,'portfolio/v1',name),'utf8')).join('\n');
const notices=fs.readFileSync(path.join(preview,'THIRD-PARTY-NOTICES.txt'),'utf8').replaceAll('--','—');
const pageCss=plan.recipe==='featured'?css.replace('./assets/expresso-editorial.woff','data:font/woff;base64,'+fs.readFileSync(path.join(preview,'assets/expresso-editorial.woff')).toString('base64')):css.replace(/@font-face\{[^}]+\}/,'');
let html=renderSpec(spec,directSpec.state);
const assets={};
for(const image of new Set(content.projects.map(project=>project.image).filter(Boolean))){
 const source=path.join(path.dirname(inputPath),image);
 const bytes=fs.readFileSync(source);
 const assetHash=sha(bytes);
 assets[image]={sha256:assetHash,bytes:bytes.length};
 html=html.replaceAll(image,'data:image/svg+xml;base64,'+bytes.toString('base64'));
}
if(/(?:src|href)="\.\/assets\/portfolio-/.test(html))throw new Error('프로젝트 이미지가 독립 HTML에 포함되지 않았습니다.');
const csp=`default-src 'none'; script-src ${plan.motion.preset==='none'?"'none'":"'sha256-"+motionHash+"'"}; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
const fontNotice=plan.recipe==='featured'?fs.readFileSync(path.join(preview,'assets/editorial-font-OFL.txt'),'utf8'):'';
const document=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${content.profile.name} · 가상 포트폴리오</title><style>${pageCss}</style></head><body>${html}${plan.motion.preset==='none'?'':`<script data-portfolio-motion>${motionRuntime}</script>`}</body></html>\n<!-- THIRD-PARTY NOTICES\n${notices}\n${fontNotice}\n-->\n`;
const documentHash=sha(document);
if(previousHtmlHash===documentHash)throw new Error('직전과 동일한 HTML입니다. 새 결과로 보고할 수 없습니다.');
fs.mkdirSync(out,{recursive:true});
for(const image of Object.keys(assets)){
 const destination=path.join(out,image);
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.copyFileSync(path.join(path.dirname(inputPath),image),destination);
}
fs.writeFileSync(path.join(out,'index.html'),document);
fs.writeFileSync(path.join(out,'composition.json'),JSON.stringify({schemaVersion:1,plan,content,spec,motionSupport:compiled.motionSupport.map(item=>item.id)},null,2)+'\n');
const manifest={schemaVersion:1,createdAt:new Date().toISOString(),fictional:true,model:directSpec.model||'provided-spec',specOrigin:directSpec.model?'model':'provided-spec',validationAttempts:directSpec.attempts.map(({output,...rest})=>rest),inputSha256:sha(input),planSha256:sha(JSON.stringify(plan)),specSha256:sha(JSON.stringify(spec)),htmlSha256:documentHash,modelOutputSha256:directSpec.modelOutput?sha(directSpec.modelOutput):null,assets,comparison:previous?{sameInput:JSON.stringify(content)===JSON.stringify(previous.content),samePlan:JSON.stringify(plan)===JSON.stringify(previous.plan),sameHtml:previousHtmlHash===documentHash}:null};
fs.writeFileSync(path.join(out,'run.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({out,specOrigin:manifest.specOrigin,validationAttempts:manifest.validationAttempts,recipe:plan.recipe,components:plan.components,projects:content.projects.map(project=>project.title),htmlSha256:documentHash,comparison:manifest.comparison},null,2));
