import {validateCatalog} from './catalog-core.mjs';
import {ROLES, safeLocal, validPreview, ACQUISITION} from './acquisition-core.mjs';

export const SELECTION = Object.freeze({shortlisted:'이식 후보',reference:'구조 참고',excluded:'본문 후보 제외',pending:'선별 대기'});
export function applyCuration(base, data) {
  const fail=()=>{throw new Error('선별 목록 형식을 확인할 수 없습니다.');};
  if(data?.schemaVersion!==1 || !Array.isArray(data.sources) || !Array.isArray(data.additions) || !Array.isArray(data.updates) || !Array.isArray(data.families) || !Array.isArray(data.duplicates) || !Array.isArray(data.gaps)) fail();
  validateCatalog({schemaVersion:1,generatedAt:data.generatedAt,sources:data.sources,items:data.additions,relations:[]});
  const items=[...base.items,...data.additions], sources=[...base.sources,...data.sources];
  const ids=new Set(items.map(i=>i.id)), newIds=new Set(data.additions.map(i=>i.id));
  if(ids.size!==items.length || new Set(sources.map(s=>s.id)).size!==sources.length) fail();
  const updates=new Map();
  for(const u of data.updates){
    if(!ids.has(u.id) || updates.has(u.id) || !Object.hasOwn(SELECTION,u.selection) || !Array.isArray(u.roles) || !u.roles.every(r=>Object.hasOwn(ROLES,r)) || typeof u.roleEvidence!=='string' || !['source_review','identifier_rules_v2','authored'].includes(u.roleMethod) || !Array.isArray(u.inputs) || !u.inputs.every(s=>typeof s==='string') || !Array.isArray(u.constraints) || !u.constraints.every(s=>typeof s==='string')) fail();
    if(newIds.has(u.id) && (!safeLocal(u.detailPath) || !validPreview(u.preview) || !Object.hasOwn(ACQUISITION,u.acquisitionStatus))) fail();
    updates.set(u.id,u);
  }
  if(updates.size!==items.length) fail();
  const families=new Set();
  for(const group of data.families){
    if(typeof group.id!=='string' || families.has(group.id) || group.method!=='name_family' || group.reviewStatus!=='structure_unverified' || !Array.isArray(group.itemIds) || group.itemIds.length<2 || new Set(group.itemIds).size!==group.itemIds.length || group.itemIds.some(id=>!ids.has(id)||updates.get(id).familyId!==group.id)) fail();
    families.add(group.id);
  }
  for(const u of data.updates) if(u.familyId!==null && !families.has(u.familyId)) fail();
  for(const group of data.duplicates) if(!/^[a-f0-9]{64}$/.test(group.hash) || group.method!=='exact_code_content' || !Array.isArray(group.itemIds) || group.itemIds.length<2 || group.itemIds.some(id=>!ids.has(id))) fail();
  for(const gap of data.gaps) if(!Object.hasOwn(ROLES,gap.role)||!['status','note','nextAction'].every(k=>typeof gap[k]==='string')) fail();
  const merged=items.map(item=>{
    const u=updates.get(item.id);
    return {...item,roles:u.roles,roleEvidence:u.roleEvidence,roleMethod:u.roleMethod,familyId:u.familyId,selection:u.selection,curation:u,
      ...(newIds.has(item.id)?{preview:u.preview,detailPath:u.detailPath,acquisitionStatus:u.acquisitionStatus,collectionStatus:u.collectionStatus}:{}),
    };
  });
  return {...base,items:merged,sources,curation:data};
}
