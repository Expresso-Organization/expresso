import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {validatePortfolio} from '../portfolio/catalog.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),renderer=path.resolve(here,'..'),root=path.resolve(here,'../../../..');
const out=path.join(root,'docs/library/previews/comparison');
const input=JSON.parse(fs.readFileSync(path.join(out,'input.json')));
const free=JSON.parse(fs.readFileSync(path.join(out,'free-result.json')));
const structured=JSON.parse(fs.readFileSync(path.join(out,'structured-result.json')));
if(free.inputHash!==input.inputHash||structured.inputHash!==input.inputHash)throw new Error('비교 입력 해시가 다릅니다.');
if(free.result.usage.model!==structured.result.usage.model)throw new Error('실제 응답 모델이 다릅니다.');
validatePortfolio(structured.result.data,input.content);
const cache=path.join(renderer,'node_modules/.cache/comparison');fs.mkdirSync(cache,{recursive:true});
for(const [name,source] of [['card','watermelon/registry/card.json'],['timeline','magic-portfolio/timeline.json']]){
  const entry=JSON.parse(fs.readFileSync(path.join(root,'docs/library/materials',source)));
  fs.writeFileSync(path.join(cache,name+'.tsx'),entry.files.find(f=>f.path.endsWith(name+'.tsx')).content.replaceAll('"@/lib/utils"','"@workspace/ui/lib/utils"'));
}
const collected={card:path.join(cache,'card.tsx'),timeline:path.join(cache,'timeline.tsx'),'annotated-text':path.join(root,'docs/library/materials/componentry/source/annotated-text.tsx')};
await esbuild.build({entryPoints:[path.join(here,'render.jsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile:path.join(cache,'render.mjs'),nodePaths:[path.join(renderer,'node_modules')],external:['react','react/jsx-runtime','react-dom/server','@json-render/*','zod','clsx','tailwind-merge'],plugins:[{name:'collected',setup(build){
  build.onResolve({filter:/^@collected\//},args=>({path:collected[args.path.slice(11)]}));
  build.onResolve({filter:/^@workspace\/ui\/lib\/utils$/},()=>({path:path.join(root,'docs/library/materials/componentry/support/utils.ts')}));
}}]});
const {render}=await import(pathToFileURL(path.join(cache,'render.mjs')).href);
let structuredHtml=render(structured.result.data,input.content);
let freeHtml=free.result.html,freeCss=free.result.css;
// 공통 제공 이미지를 그대로 임베드합니다. 자유 생성의 /v1/media 경로만 시연용 주소로 해석합니다.
for(const project of input.content.projects){
  const name=path.basename(project.image),bytes=fs.readFileSync(path.join(root,'docs/library/previews/portfolio/assets',name));
  const data='data:image/svg+xml;base64,'+bytes.toString('base64');
  structuredHtml=structuredHtml.replaceAll(project.image,data);
  freeHtml=freeHtml.replaceAll('/v1/media/'+name,data);
  freeCss=freeCss.replaceAll('/v1/media/'+name,data);
}
// 동일한 시스템 서체·오프라인 자산 조건을 사용합니다. 모델이 생성한 HTML/CSS의 배치와 문구는 보존합니다.
const baseCss=':root{--page-sans:"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;--page-serif:serif;--page-mono:monospace;--page-display:system-ui}html{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}body{margin:0;font-family:var(--page-sans);word-break:keep-all;-webkit-font-smoothing:antialiased}';
const csp="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
const shell=(title,body,css)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${title} · 가상 포트폴리오 비교</title><style>${css}</style></head><body>${body}</body></html>`;
const css=fs.readFileSync(path.join(root,'docs/library/previews/portfolio/style.css'),'utf8');
const notice=fs.readFileSync(path.join(root,'docs/library/previews/portfolio/THIRD-PARTY-NOTICES.txt'),'utf8').replaceAll('--','—');
fs.writeFileSync(path.join(out,'structured.html'),shell('구조화 생성',structuredHtml,css)+`\n<!-- ${notice} -->`);
fs.writeFileSync(path.join(out,'free.html'),shell('자유 생성',freeHtml,baseCss+'\n'+freeCss));
fs.writeFileSync(path.join(out,'generation.json'),JSON.stringify({inputHash:input.inputHash,model:free.result.usage.model,runsPerMethod:1,sharedBrief:input.sharedBrief,structured:{usage:structured.result.usage,specBytes:Buffer.byteLength(JSON.stringify(structured.result.data)),sectionOrder:structured.result.data.elements[structured.result.data.root].children.map(id=>structured.result.data.elements[id].type)},free:{usage:free.result.usage,htmlCssBytes:Buffer.byteLength(free.result.html+free.result.css),rationale:free.result.rationale,qaReport:free.result.qaReport,removed:free.result.removed,ungrounded:free.result.ungrounded},conditions:{content:'같은 가상 콘텐츠',design:'같은 편집형 색상·시스템 서체·가상 이미지',freePipeline:'AiPageGenerator → PageDraftSchema → sanitizePage → pageQa',structuredPipeline:'같은 AI 클라이언트 → generationSchema → validatePortfolio → json-render → 정적 HTML',presentation:'서체 셸 공통화, 제공 이미지 임베드. 모델의 레이아웃과 문구 수동 수정 없음.',scope:'구조화 방식의 기존 컴포넌트·테마 제작 비용은 이번 모델 호출 비용에 포함되지 않음. 단일 호출씩의 예비 비교.'}},null,2)+'\n');
console.log('구조화·자유 생성 결과를 같은 자산 조건으로 렌더링했습니다.');
