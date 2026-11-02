import { CareerWriterRelationSchema,type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { prepareCanonicalCareerRecord,readCanonicalCareerPropertyValues } from "@expresso/database";
import { Decimal128 } from "mongodb";
import { CareerError } from "./errors.js";
/** 기존 keyed 입력을 owner 명령으로 번역할 뿐 Mongo에 값을 저장하지 않습니다. */
export function translateCareerProductProperties(categoryId:string,definitions:readonly CareerPropertyDefinitionV2[],properties:Record<string,unknown>) {
 const scalars:Record<string,unknown>={},relations:ReturnType<typeof CareerWriterRelationSchema.parse>[]=[];
 for(const [key,raw] of Object.entries(properties)) {
  const definition=definitions.find(item=>item.key===key&&item.deletedAt===null);
  if(!definition)throw new CareerError(400,"unknown Career property");
  if(definition.type==="relation") {
   if(!raw||typeof raw!=="object"||!("type" in raw)||raw.type!=="relation"||!("value" in raw)||!Array.isArray(raw.value))throw new CareerError(400,"invalid relation value");
   const targetIds=raw.value.map(value=>value&&typeof value==="object"&&"recordId" in value?value.recordId:null);
   const parsed=CareerWriterRelationSchema.safeParse({propertyId:definition.id,targetIds});
   if(!parsed.success)throw new CareerError(400,"invalid relation targets");relations.push(parsed.data);continue;
  }
  if(["formula","rollup","title"].includes(definition.type)||(definition.system&&["created_time","updated_time"].includes(definition.type)))throw new CareerError(400,"readonly Career property");
  let value=raw;
  if(definition.type==="number"&&typeof raw==="string") {
   try{value=Decimal128.fromString(raw);}catch{throw new CareerError(400,"invalid exact decimal");}
  }
  scalars[key]=value;
 }
 const prepared=prepareCanonicalCareerRecord({_id:"00000000-0000-4000-8000-000000000000",categoryId,properties:scalars},definitions);
 if(prepared.conflicts.length)throw new CareerError(400,"invalid canonical Career property input",{reason:prepared.conflicts[0]!.code});
 return {propertyValues:readCanonicalCareerPropertyValues({propertyValues:prepared.set.propertyValues??[]}),relations};
}
