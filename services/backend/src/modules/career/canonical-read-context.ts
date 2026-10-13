import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2 } from "@expresso/contracts";
function matches(value:CareerBusinessPropertyValue,definition:CareerPropertyDefinitionV2):boolean {
 if(value.type===definition.type){
  if(value.type==="select" || value.type==="multi_select"){const ids=new Set(Array.isArray(definition.config.options)?definition.config.options.map(option=>(option as {id:string}).id):[]);return value.type==="select"?value.value===null || ids.has(value.value):value.value.every(id=>ids.has(id));}
  return true;
 }
 return !definition.system && (definition.type==="created_time" || definition.type==="updated_time") && value.type==="date" && value.value.precision==="datetime" && value.value.end===null;
}
/** 변환 중인 한 속성의 원본 표시만 복원하며 writer의 schema 검증에는 사용하지 않습니다. */
export function canonicalRecordReadDefinitions(definitions:readonly CareerPropertyDefinitionV2[], values:readonly CareerBusinessPropertyValue[], source:CareerPropertyDefinitionV2|null):CareerPropertyDefinitionV2[] {
 if(!source)return [...definitions];
 const value=values.find(item=>item.propertyDefinitionId===source.id);
 if(!value || !matches(value,source))return [...definitions];
 return definitions.map(definition=>definition.id===source.id && (definition.deletedAt!==null || !matches(value,definition)) ? {...source,deletedAt:null} : definition);
}
