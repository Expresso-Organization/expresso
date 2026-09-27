import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as esbuild from 'esbuild';
import {z} from 'zod';
import {catalog,portfolioSpec,validatePortfolio,generationSchema} from './portfolio/catalog.mjs';
import {fixture,scenarios} from './portfolio/fixtures.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const out=path.join(root,'docs/library/previews/portfolio');
const cache=path.join(here,'node_modules/.cache/portfolio-sources');
fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(path.join(out,'assets'),{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sources=[
  {id:'watermelon-card',source:'https://github.com/WatermelonCorp/watermellon-registry',material:'docs/library/materials/watermelon/registry/card.json',license:'docs/library/materials/watermelon/LICENSE.txt',components:['ProjectGrid'],adaptation:'수집한 Card 전체 구성을 재사용하고 프로젝트 데이터·공통 테마를 적용합니다.'},
  {id:'magic-portfolio-timeline',source:'https://github.com/magicuidesign/portfolio',material:'docs/library/materials/magic-portfolio/timeline.json',license:'docs/library/materials/magic-portfolio/LICENSE.txt',components:['CareerTimeline'],adaptation:'수집한 Timeline과 연결선 구성을 재사용하고 가상 경력을 전달합니다.'},
  {id:'componentry-annotated-text',source:'https://componentry.dev/docs/components/annotated-text',material:'docs/library/materials/componentry/source/annotated-text.tsx',license:'docs/library/materials/componentry/LICENSE.txt',components:['Hero'],adaptation:'원본 텍스트 강조에 짧은 한국어 구절을 전달합니다. 정적 출력의 일치를 위해 그리기 애니메이션을 끕니다.'},
  {id:'expresso-composition',source:null,material:'scripts/library/renderer/portfolio/registry.jsx',license:null,components:['PortfolioPage','CaseStudies','EvidenceList','Contact'],adaptation:'포트폴리오 내용과 근거 연결을 위한 자체 섹션 어댑터입니다.'}
].map(s=>({...s,sha256:createHash('sha256').update(read(s.material)).digest('hex')}));
for(const [name,source] of [['card',sources[0]],['timeline',sources[1]]]){
  const content=JSON.parse(read(source.material)).files.find(f=>f.path.endsWith(`${name}.tsx`)).content.replaceAll('"@/lib/utils"','"@workspace/ui/lib/utils"');
  fs.writeFileSync(path.join(cache,name+'.tsx'),content);
}
const collected={card:path.join(cache,'card.tsx'),timeline:path.join(cache,'timeline.tsx'),'annotated-text':path.join(root,sources[2].material)};
const plugin={name:'collected-portfolio',setup(build){
  build.onResolve({filter:/^@collected\//},args=>({path:collected[args.path.slice(11)]}));
  build.onResolve({filter:/^@workspace\/ui\/lib\/utils$/},()=>({path:path.join(root,'docs/library/materials/componentry/support/utils.ts')}));
}};
const common={bundle:true,jsx:'automatic',nodePaths:[path.join(here,'node_modules')],plugins:[plugin],logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}};
await esbuild.build({...common,entryPoints:[path.join(here,'portfolio/app.jsx')],outfile:path.join(out,'app.js'),platform:'browser',format:'iife',minify:true,legalComments:'linked'});
const cssResult=spawnSync(process.execPath,[path.join(here,'node_modules/@tailwindcss/cli/dist/index.mjs'),'-i',path.join(here,'portfolio/styles.css'),'-o',path.join(out,'style.css'),'--minify'],{encoding:'utf8',cwd:here});
if(cssResult.status!==0)throw new Error(cssResult.stderr);
const server=path.join(cache,'ssr.mjs');
await esbuild.build({...common,entryPoints:[path.join(here,'portfolio/ssr.jsx')],outfile:server,platform:'node',format:'esm',external:['react','react/jsx-runtime','react-dom/server','@json-render/*','zod','clsx','tailwind-merge']});
const {render}=await import(pathToFileURL(server).href);
for(const name of ['portfolio-moa-map.svg','portfolio-lumen-note.svg','portfolio-ongil-guide.svg'])fs.copyFileSync(path.join(root,'docs/library/previews/componentry/assets',name),path.join(out,'assets',name));
const csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";
const html=(body,style,scripts='')=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>가상 포트폴리오 · 페이지 조합 예제</title>${style}</head><body>${body}${scripts}</body></html>`;
fs.writeFileSync(path.join(out,'index.html'),html('<div id="root"></div>','<link rel="stylesheet" href="./style.css">','<script src="./app.js"></script>'));
const css=fs.readFileSync(path.join(out,'style.css'),'utf8');
for(const scenario of Object.keys(scenarios)){
  const {spec,content}=validatePortfolio(portfolioSpec,fixture(scenario));
  let markup=render(scenario);
  for(const name of ['portfolio-moa-map.svg','portfolio-lumen-note.svg','portfolio-ongil-guide.svg']){
    const data='data:image/svg+xml;base64,'+fs.readFileSync(path.join(out,'assets',name)).toString('base64');
    markup=markup.replaceAll('./assets/'+name,data);
  }
  fs.writeFileSync(path.join(out,scenario+'.static.html'),html(markup,`<style>${css}</style>`));
  fs.writeFileSync(path.join(out,scenario+'.json'),JSON.stringify({schemaVersion:1,spec,content},null,2)+'\n');
}
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog.jsonSchema(),null,2)+'\n');
fs.writeFileSync(path.join(out,'generation-schema.json'),JSON.stringify(z.toJSONSchema(generationSchema),null,2)+'\n');
fs.writeFileSync(path.join(out,'catalog-prompt.txt'),'포트폴리오 조합 v0: 제공된 콘텐츠를 다시 쓰지 않고 고정 $state 참조로 연결합니다. generation-schema.json의 구조를 따릅니다. PortfolioPage 한 개 아래에 Hero, ProjectGrid, CaseStudies, CareerTimeline, EvidenceList, Contact를 각각 한 번 배치합니다. 각 식별자는 고유해야 하며 이전 판에 있던 식별자를 유지합니다. 액션, HTML, CSS, 외부 URL은 생성하지 않습니다. 현재 지원하는 테마는 편집형 한 종류입니다.\n\n'+catalog.prompt());
fs.writeFileSync(path.join(out,'sources.json'),JSON.stringify({schemaVersion:1,renderer:'@json-render/react@0.21.0',sources},null,2)+'\n');
const notices=sources.filter(s=>s.license).map(s=>s.id+'\n'+read(s.license));
for(const pkg of ['react','react-dom','@json-render/core','@json-render/react','zod','clsx','tailwind-merge']){
  const dir=path.join(here,'node_modules',pkg),meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
  const files=fs.readdirSync(dir).filter(n=>/^(license|notice)(\.|$)/i.test(n));
  notices.push(`${pkg}@${meta.version} (${meta.license})\n`+files.map(n=>fs.readFileSync(path.join(dir,n),'utf8')).join('\n'));
}
fs.writeFileSync(path.join(out,'THIRD-PARTY-NOTICES.txt'),notices.join('\n\n'+'='.repeat(60)+'\n'));
// 다운로드한 단일 HTML에도 재배포 고지가 함께 남습니다.
for(const scenario of Object.keys(scenarios))fs.appendFileSync(path.join(out,scenario+'.static.html'),'\n<!-- THIRD-PARTY NOTICES\n'+notices.join('\n\n').replaceAll('--','—')+'\n-->\n');
console.log('포트폴리오 조합: 6개 섹션, 4개 가상 입력, React와 정적 HTML 생성 완료');
