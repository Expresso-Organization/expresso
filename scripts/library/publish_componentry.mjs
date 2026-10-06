// 브라우저 렌더링을 통과한 원본 예제만 라이브러리 미리보기에 게시합니다.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validPreview} from '../../docs/library/acquisition-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base=path.join(root,'docs/library');
const out=path.join(base,'previews/componentry');
const feed=JSON.parse(fs.readFileSync(path.join(base,'componentry.json')));
const builds=JSON.parse(fs.readFileSync(path.join(out,'build-results.json')));
const verified=JSON.parse(fs.readFileSync(path.join(out,'verification.json')));
const buildById=new Map(builds.map(row=>[row.id,row]));
const verifiedById=new Map(verified.results.map(row=>[row.id,row]));
if(feed.additions.length!==56||buildById.size!==56||verifiedById.size!==56)
  throw new Error('Componentry 56개 전체의 빌드·브라우저 결과가 필요합니다.');
for(const asset of ['vendor.js','preview.css'])if(!fs.existsSync(path.join(out,asset)))
  throw new Error('공통 실행 자산이 없습니다: '+asset);

for(const update of feed.updates){
  const build=buildById.get(update.id),check=verifiedById.get(update.id);
  if(build?.status!=='built'||check?.status!=='ready'||!build.fixture||!check.snapshotSha256)
    throw new Error('실행 검증을 통과하지 못했습니다: '+update.id);
  const prefix=`./library/previews/componentry/${update.id}`;
  const image=fs.readFileSync(path.join(out,update.id+'.jpg'));
  const hash=createHash('sha256').update(image).digest('hex');
  if(hash!==check.snapshotSha256)throw new Error('화면 캡처 해시가 다릅니다: '+update.id);
  for(const extension of ['html','js'])if(!fs.existsSync(path.join(out,update.id+'.'+extension)))
    throw new Error('실행 파일이 없습니다: '+update.id+'.'+extension);
  const staticHtml=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><title>${update.id} 렌더 화면</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}img{display:block;width:100%;height:100%;object-fit:cover}</style><img src="${update.id}.jpg" alt="실제 컴포넌트 렌더 화면"></html>`;
  fs.writeFileSync(path.join(out,update.id+'.static.html'),staticHtml);
  update.preview={kind:'local_frame',url:prefix+'.static.html',liveUrl:prefix+'.html',
    label:build.fictionalPortfolio?'가상 포트폴리오 · 원본 컴포넌트 실행':'원본 컴포넌트 실행 · 예시 입력',sourceUrl:feed.additions.find(item=>item.id===update.id).canonicalUrl,
    width:1280,height:740,interactive:true};
  if(!validPreview(update.preview))throw new Error('실행 미리보기 경로가 올바르지 않습니다: '+update.id);
  update.example={mode:'authored_fixture',inputCode:build.fixture,props:{},
    notes:build.fictionalPortfolio?
      [build.name==='scroll-split-card'?'루멘 노트는 이 예제를 위해 만든 가상 프로젝트입니다. 실제 인물·경력·성과가 아닙니다.':'모아 지도·루멘 노트·온길 안내는 이 예제를 위해 만든 가상 프로젝트입니다. 실제 인물·경력·성과가 아닙니다.','공식 원본 컴포넌트에 가상 입력을 전달한 독립 실행 화면입니다. 제품 이식 품질은 별도 검증이 필요합니다.']:
      ['공식 원본 컴포넌트에 예시 입력을 전달한 독립 실행 화면입니다.','실제 경력 데이터와 포트폴리오 품질 검사는 별도입니다.']};
  if(build.name==='scroll-split-card')update.example.notes.push('원본 소스에 고정된 영어 스크롤 안내와 종료 문구는 제품 이식 전에 교체해야 합니다.');
  update.renderCheck={status:'ready',method:verified.method,snapshotSha256:hash,viewport:verified.viewport};
  const detailPath=path.join(base,'items',update.id+'.json');
  const detail=JSON.parse(fs.readFileSync(detailPath));
  detail.example=update.example;
  detail.renderCheck=update.renderCheck;
  detail.usageNote=build.fictionalPortfolio?
    '공식 원본 코드를 가상 포트폴리오 데이터로 직접 렌더링했습니다. 모아 지도·루멘 노트·온길 안내는 실제 경력이나 성과가 아닙니다. 제품 이식·키보드 접근성 검사는 별도입니다.':
    '공식 원본 코드를 예시 입력으로 브라우저에서 직접 렌더링했습니다. 실제 경력 데이터·반응형·키보드·제품 이식 품질은 검증 전입니다.';
  if(build.name==='scroll-split-card')detail.usageNote+=' 원본 소스의 고정 영어 안내 문구는 제품 이식 전에 교체해야 합니다.';
  fs.writeFileSync(detailPath,JSON.stringify(detail,null,2)+'\n');
}
feed.stats.localRenders=feed.updates.length;
feed.source.note='53개 UI와 3개 블록의 MIT 원본을 보존하고 예시 입력으로 로컬 렌더링했습니다. GSAP 의존 항목과 제품 이식은 별도 검토합니다.';
fs.writeFileSync(path.join(base,'componentry.json'),JSON.stringify(feed,null,2)+'\n');
console.log('Componentry 실행 예제',feed.stats.localRenders);
