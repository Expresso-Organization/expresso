import {validateCatalog} from './catalog-core.mjs';
import {ACQUISITION,ROLES,safeLocal,validPreview} from './acquisition-core.mjs';
import {SELECTION} from './curation-core.mjs';

// 고정 버전으로 수집한 새 공급자를 기존 1~3단계 산출물 뒤에 결합합니다.
export function applyComponentry(base,data){
  const fail=()=>{throw new Error('Componentry 수집 목록 형식을 확인할 수 없습니다.');};
  if(data?.schemaVersion!==1||data.source?.id!=='componentry'||!Array.isArray(data.additions)||!Array.isArray(data.updates)||
    !data.stats||!Number.isSafeInteger(data.stats.items)||data.stats.items!==data.additions.length)fail();
  validateCatalog({schemaVersion:1,generatedAt:data.generatedAt,sources:[data.source],items:data.additions,relations:[]});
  const existing=new Set(base.items.map(item=>item.id));
  if(base.sources.some(source=>source.id===data.source.id)||data.additions.some(item=>existing.has(item.id)))fail();
  const updates=new Map();
  for(const update of data.updates){
    if(updates.has(update.id)||!Object.hasOwn(ACQUISITION,update.acquisitionStatus)||
      !Object.hasOwn(SELECTION,update.selection)||!Array.isArray(update.roles)||
      !update.roles.every(role=>Object.hasOwn(ROLES,role))||!Array.isArray(update.inputs)||
      !Array.isArray(update.constraints)||!update.constraints.every(value=>typeof value==='string')||
      !validPreview(update.preview)||!safeLocal(update.detailPath))fail();
    updates.set(update.id,update);
  }
  if(updates.size!==data.additions.length)fail();
  const additions=data.additions.map(item=>{
    const update=updates.get(item.id);
    if(!update)fail();
    return {...item,...update,curation:{selection:update.selection,inputs:update.inputs,constraints:update.constraints},
      integrationStatus:'not_started'};
  });
  return {...base,sources:[...base.sources,data.source],items:[...base.items,...additions],componentry:data};
}
