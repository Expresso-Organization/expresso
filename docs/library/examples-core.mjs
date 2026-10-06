import {validPreview} from './acquisition-core.mjs';

export function applyExamples(base, data) {
  const fail=()=>{throw new Error('실행 예제 목록 형식을 확인할 수 없습니다.');};
  if(data?.schemaVersion!==1 || !Array.isArray(data.items) || typeof data.generatedAt!=='string') fail();
  const ids=new Set(base.items.map(i=>i.id)), updates=new Map();
  for(const update of data.items){
    if(!ids.has(update.id)||updates.has(update.id)||!validPreview(update.preview))fail();
    if(update.example && (update.preview.kind!=='local_frame'||!update.preview.liveUrl||update.renderCheck?.status!=='ready'||!/^[a-f0-9]{64}$/.test(update.renderCheck.snapshotSha256)||!['original_component','authored_fixture','liquid_template_fixture','layout_adapter'].includes(update.example.mode)||typeof update.example.inputCode!=='string'||!Array.isArray(update.example.notes)||!update.example.notes.every(s=>typeof s==='string')))fail();
    updates.set(update.id,update);
  }
  return {...base,examples:data,items:base.items.map(item=>{
    const update=updates.get(item.id);
    return update?{...item,preview:update.preview,previewReason:null,execution:update.example?{example:update.example,renderCheck:update.renderCheck}:undefined}:item;
  })};
}
