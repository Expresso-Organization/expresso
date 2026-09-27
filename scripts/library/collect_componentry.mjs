// 공식 저장소의 고정 버전에서 Componentry 목록·코드·시연 링크를 수집합니다.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateCatalog} from '../../docs/library/catalog-core.mjs';
import {validPreview,validateDetail} from '../../docs/library/acquisition-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const repo=path.join(root,'artifacts/portfolio-library/componentry');
const out=path.join(root,'docs/library');
const lock=JSON.parse(fs.readFileSync(path.join(root,'scripts/library/componentry-source.json')));
const read=relative=>fs.readFileSync(path.join(repo,relative));
const sha=body=>createHash('sha256').update(body).digest('hex');
const checked=[
  ['apps/web/public/r/registry.json',lock.registryIndexSha256],
  ['apps/web/registry/index.ts',lock.metadataSha256],
  ['apps/web/registry/blocks/registry.json',lock.blocksSha256],
  ['LICENSE',lock.licenseSha256],
];
if(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()!==lock.revision)
  throw new Error('Componentry 저장소 고정 버전이 다릅니다.');
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repo,encoding:'utf8'}).trim())
  throw new Error('Componentry 원본 checkout에 변경 사항이 있습니다.');
for(const [file,expected] of checked) if(sha(read(file))!==expected)
  throw new Error('Componentry 원본 해시가 다릅니다: '+file);

const index=JSON.parse(read('apps/web/public/r/registry.json'));
const blocks=JSON.parse(read('apps/web/registry/blocks/registry.json'));
const blockByName=new Map(blocks.blocks.map(item=>[item.name,item]));
if(index.items.length!==lock.items.length || new Set(index.items.map(item=>item.name)).size!==lock.items.length)
  throw new Error('Componentry registry 항목 수가 바뀌었습니다.');

const repository=lock.repository, revision=lock.revision;
const licenseUrl=`${repository}/blob/${revision}/LICENSE`;
const registryIndexUrl=`${repository}/blob/${revision}/apps/web/public/r/registry.json`;
const materialRoot=path.join(out,'materials/componentry');
const put=(subpath,body,label,kind)=>{
  const file=path.join(materialRoot,subpath);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,body);
  return {path:'./library/materials/componentry/'+subpath,sha256:sha(body),bytes:body.length,label,kind};
};
const license=put('LICENSE.txt',read('LICENSE'),'MIT 라이선스 원문','license');
const sectionNames=new Set(['case-study-flip-stack','sticky-scroll-cards','newsletter-bookshelf','gradient-hero-01']);
const projectNames=new Set(['collection-surfer','fisheye-infinite-grid','layered-stack','orbit-card-stack','scroll-tilted-grid','wheel-carousel','spiral-3d-slider']);
const mediaNames=new Set(['image-trail','image-ripple-effect','infinite-image-field','liquid-glass-carousel','music-player','pixel-image-trail','ripple-transition']);
const technicalNames=new Set(['annotated-text','circuit-board']);
const gsapNames=new Set(['flipping-word-swap','image-trail','layered-stack','liquid-glass-carousel']);
function roleFor(name,category){
  if(name==='gradient-hero-01'||category==='Hero Backgrounds')return 'hero';
  if(sectionNames.has(name))return 'project-detail';
  if(projectNames.has(name))return 'project-grid';
  if(mediaNames.has(name))return 'media';
  if(technicalNames.has(name))return 'technical-evidence';
  if(name==='magnetic-dock')return 'navigation';
  if(name.startsWith('pricing-'))return 'supporting-page';
  return 'interaction';
}
const source={
  id:'componentry',name:'Componentry',url:'https://componentry.dev/docs',licenseUrl,
  rightsStatus:'allowed',coverageState:'snapshot_complete',discoveredCount:lock.items.length,
  categories:['Components','Text Animations','Hero Backgrounds','Visual Effects','ASCII Effects','registry:block'],
  requestIds:[],fetchedAt:lock.capturedAt,method:'공식 저장소 고정 commit의 registry·코드 수집',
  note:'53개 UI와 3개 블록의 MIT 원본을 보존했습니다. 시연 영상은 공식 주소로 연결하며 GSAP 의존 항목과 제품 이식은 별도 검토합니다.',
  nextActions:[{kind:'validation',url:repository,reason:'포트폴리오 입력 계약·실행 의존성·반응형·이용 조건 검증'}],
};
const additions=[],updates=[];
for(const [at,item] of lock.items.entries()){
  const listed=index.items[at];
  if(item.name!==listed.name||item.type!==listed.type||!/^[a-z0-9-]+$/.test(item.name))
    throw new Error('Componentry registry 순서 또는 식별자가 바뀌었습니다.');
  const block=item.type==='registry:block'?blockByName.get(item.name):null;
  if(item.type==='registry:block'&&!block)throw new Error('블록 정의가 없습니다: '+item.name);
  const title=item.title??block?.title;
  const description=item.description??block?.description;
  const category=item.category??block?.categories?.[0]??'registry:block';
  if(!title||!description)throw new Error('설명이 없습니다: '+item.name);
  const id='componentry-'+item.name;
  const registryRelative=`apps/web/public/r/${item.name}.json`;
  const sourceRelative=item.type==='registry:block'
    ?`apps/web/registry/blocks/${item.name}/${item.name}.tsx`
    :`packages/ui/src/components/${item.name}.tsx`;
  const registry=JSON.parse(read(registryRelative));
  if(registry.name!==item.name||registry.type!==item.type||!Array.isArray(registry.files)||!registry.files.length)
    throw new Error('원본 registry 형식이 다릅니다: '+item.name);
  const registryMaterial=put(`registry/${item.name}.json`,read(registryRelative),'설치 가능한 registry 원본','registry_source');
  const sourceMaterial=put(`source/${item.name}.tsx`,read(sourceRelative),'공식 저장소 컴포넌트 원본','source_code');
  const officialDocs=`https://componentry.dev/docs/components/${item.name}`;
  const registryUrl=`https://componentry.dev/r/${item.name}.json`;
  const sourceUrl=`${repository}/blob/${revision}/${sourceRelative}`;
  const canonicalUrl=item.type==='registry:block'?registryUrl:officialDocs;
  const rightsStatus=gsapNames.has(item.name)?'unreviewed':'allowed';
  additions.push({
    id,sourceSite:'componentry',sourceItemId:item.name,title,titleSource:'listing',
    canonicalUrl,sourceUrls:[canonicalUrl,registryUrl,sourceUrl],originalUrl:sourceUrl,
    artifactKind:'component',categories:[category,item.type],roles:[],discoveredFrom:[registryIndexUrl],
    familyId:null,variant:null,sourceRevision:revision,collectionStatus:'discovered',rightsStatus,
    reviewStatus:'unreviewed',integrationStatus:'not_started',preview:null,description,
  });
  const image=item.previewImage
    ? new URL(item.previewImage,'https://componentry.dev').href : null;
  const preview=item.previewVideoStatus==='available'
    ? {kind:'remote_video',url:new URL(item.previewVideo,'https://componentry.dev').href,poster:image??`${officialDocs}/opengraph-image`,
       ...(image?{thumbnailUrl:image}:{}),sourceUrl:officialDocs,label:'공식 시연 영상 · 제품 실행 전'}
    : {kind:'text',text:`${title}\n${description}`,label:item.type==='registry:block'
        ?'공식 registry 설명 · 실행 검증 전':'공식 설명 · 실행 화면은 원본에서 확인'};
  if(!validPreview(preview))throw new Error('미리보기 주소가 올바르지 않습니다: '+item.name);
  const role=roleFor(item.name,category);
  const constraints=['원본의 React·Tailwind 의존성과 실제 포트폴리오 콘텐츠를 연결해 검증해야 합니다.'];
  if(gsapNames.has(item.name))constraints.push('GSAP의 별도 이용 조건을 확인한 뒤 제품에 이식합니다.');
  if(item.previewVideoStatus==='unavailable_404')constraints.push('공식 registry의 시연 영상 주소가 수집 시점에 HTTP 404를 반환했습니다. 원본 문서에서 동작을 확인해야 합니다.');
  else if(!item.previewVideo)constraints.push('공식 시연 영상이 없어 원본 문서 또는 코드에서 동작을 확인해야 합니다.');
  const detailPath=`./library/items/${id}.json`;
  const roleEvidence='공식 registry 분류와 설명으로 임시 탐색 역할을 붙였습니다. 포트폴리오 적합성은 검토 전입니다.';
  updates.push({id,roles:[role],roleEvidence,roleMethod:'identifier_rules_v2',selection:'pending',
    inputs:[],constraints,familyId:null,preview,detailPath,acquisitionStatus:'source_ready',
    collectionStatus:'material_ready',previewReason:null});
  const detail={
    id,sourceUrl:canonicalUrl,sourceRevision:revision,roles:[role],roleEvidence,
    roleMethod:'identifier_rules_v2',materials:[registryMaterial,sourceMaterial,license],
    observations:[description,`공식 분류: ${category}`,`registry 의존성: ${(registry.dependencies??[]).join(', ')||'없음'}`,
      ...(item.previewVideoStatus==='unavailable_404'?[`공식 시연 영상 주소 HTTP 404 (${lock.mediaCheckedAt}): ${item.previewVideo}`]:[])],
    inputs:[],framework:'React 19 · Tailwind CSS 4',sourceLicense:licenseUrl,
    acquisitionStatus:'source_ready',visualReview:'not_reviewed',responsiveReview:'not_measured',
    interactionReview:'not_measured',
    codeFiles:registry.files.map(file=>({path:file.path,sha256:sha(Buffer.from(file.content??'')),bytes:Buffer.byteLength(file.content??'')})),
    usageNote:'고정 버전의 원본 코드와 registry payload입니다. 공식 시연 영상은 외부 링크이며 로컬 실행·제품 품질은 검증 전입니다.'
      +(gsapNames.has(item.name)?' GSAP은 별도 이용 조건을 확인해야 합니다.':''),
  };
  validateDetail(detail,id);
  fs.writeFileSync(path.join(out,'items',id+'.json'),JSON.stringify(detail,null,2)+'\n');
}
validateCatalog({schemaVersion:1,generatedAt:lock.capturedAt,sources:[source],items:additions,relations:[]});
const result={schemaVersion:1,runId:'componentry-'+revision.slice(0,12),generatedAt:lock.capturedAt,
  source,additions,updates,stats:{items:additions.length,components:additions.filter(i=>i.categories.includes('registry:ui')).length,
    blocks:additions.filter(i=>i.categories.includes('registry:block')).length,
    officialVideos:updates.filter(i=>i.preview.kind==='remote_video').length,
    unavailableVideos:lock.items.filter(i=>i.previewVideoStatus==='unavailable_404').length,
    textPreviews:updates.filter(i=>i.preview.kind==='text').length}};
fs.writeFileSync(path.join(out,'componentry.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.stats));
