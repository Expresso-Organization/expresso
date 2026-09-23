import {safeUrl,RIGHTS,validateCatalog} from './catalog-core.mjs';
export const ACQUISITION = Object.freeze({source_ready:'소스 확보',reference_ready:'참고 자료 확보',prompt_ready:'프롬프트 확보',permission_needed:'이용 범위 확인 필요',access_blocked:'접근·연결 확인 필요',out_of_scope:'공급자 탐색 대상'});
export const ROLES = Object.freeze({hero:'대표 소개','project-grid':'프로젝트·작품',experience:'경력·과정',outcome:'성과·수치',evidence:'평가·근거',contact:'연락·마무리',navigation:'탐색',capability:'역량·기여','supporting-page':'보조 화면','supporting-ui':'보조 UI','technical-evidence':'기술 설명',icon:'아이콘',supplier:'공급자',interaction:'상호작용','quality-workflow':'제작·품질 검토'});
export function safeLocal(value) {return typeof value==='string' && /^\.\/library\/(items|materials|previews)\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').includes('..');}
export function validPreview(preview) {
  if (preview===null) return true;
  if (!preview || typeof preview.label!=='string') return false;
  if (preview.kind==='text') return typeof preview.text==='string';
  if (!safeUrl(preview.sourceUrl)) return false;
  if (preview.kind==='remote_image') return safeUrl(preview.url) && (!preview.thumbnailUrl||safeUrl(preview.thumbnailUrl));
  if (preview.kind==='local_image') return safeLocal(preview.url);
  if (preview.kind==='local_frame') return safeLocal(preview.url) && (!preview.liveUrl || safeLocal(preview.liveUrl)) && preview.width>0 && preview.height>0;
  return false;
}
export function applyAcquisitions(base,acquisitions) {
  const fail=()=>{throw new Error('상세 수집 목록 형식을 확인할 수 없습니다.');};
  if(acquisitions?.schemaVersion!==1 || !Array.isArray(acquisitions.items) || !Array.isArray(acquisitions.additions) || !Array.isArray(acquisitions.sources))fail();
  validateCatalog({...base,items:[...base.items,...acquisitions.additions],sources:[...base.sources,...acquisitions.sources]});
  const items=[...base.items,...acquisitions.additions];const ids=new Set(items.map(i=>i.id));
  if(ids.size!==items.length)fail();
  const updates=new Map();
  for(const update of acquisitions.items){
    if(!ids.has(update.id)||updates.has(update.id)||!Object.hasOwn(ACQUISITION,update.acquisitionStatus)||!validPreview(update.preview)||!safeLocal(update.detailPath)||!Array.isArray(update.roles)||!update.roles.every(r=>Object.hasOwn(ROLES,r))||typeof update.roleEvidence!=='string'||(update.rightsStatus&&!Object.hasOwn(RIGHTS,update.rightsStatus))||(update.originalUrl&&!safeUrl(update.originalUrl)))fail();
    updates.set(update.id,update);
  }
  if(updates.size!==items.length)fail();
  const merged=items.map(item=>{
    const u=updates.get(item.id);
    return {...item,preview:u.preview,roles:u.roles,roleEvidence:u.roleEvidence,roleMethod:u.roleMethod,acquisitionStatus:u.acquisitionStatus,collectionStatus:u.collectionStatus,detailPath:u.detailPath,previewReason:u.previewReason,title:u.title||item.title,titleSource:u.titleSource||item.titleSource,originalUrl:u.originalUrl||item.originalUrl,rightsStatus:u.rightsStatus||item.rightsStatus};
  });
  // 시각 자료와 포트폴리오 섹션을 먼저 보여주되 원본 ID와 전체 목록을 유지합니다.
  const weight=item=>!item.preview?100:item.sourceSite==='watermelon'?(item.roles.includes('hero')?0:1):item.sourceSite==='expresso'?2:item.sourceSite==='diagram'?3:item.sourceSite==='rune'?5:4;
  merged.sort((a,b)=>weight(a)-weight(b));
  return {...base,items:merged,generatedAt:acquisitions.generatedAt,sources:[...base.sources,...acquisitions.sources].map(source=>({...source,note:acquisitions.sourceNotes?.[source.id]||source.note})),acquisitionRunId:acquisitions.runId};
}
export function validateDetail(data,id) {
  if(data?.id!==id||!Object.hasOwn(ACQUISITION,data.acquisitionStatus)||!Array.isArray(data.materials)||!Array.isArray(data.observations))throw new Error('항목 상세 형식을 확인할 수 없습니다.');
  for(const material of data.materials) if(!safeLocal(material.path)||!/^[a-f0-9]{64}$/.test(material.sha256)||typeof material.label!=='string')throw new Error('원본 파일 경로를 확인할 수 없습니다.');
  if(data.prompt && (typeof data.prompt.body!=='string'||!Array.isArray(data.prompt.inputs)||typeof data.prompt.output!=='string'))throw new Error('프롬프트 형식을 확인할 수 없습니다.');
  return data;
}
