import { CareerPropertyOptionResponseSchema,CareerRegisterPropertyOptionSchema,UuidSchema,type CareerCategory } from "@expresso/contracts";
export async function ensureCareerPropertyOption(categoryId:string,propertyId:string,label:string):Promise<{id:string;name:string}> {
 const input=CareerRegisterPropertyOptionSchema.parse({label});
 const response=await fetch(`/api/career/categories/${UuidSchema.parse(categoryId)}/property-schema/${UuidSchema.parse(propertyId)}/options`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input),cache:"no-store"});
 if(!response.ok)throw new Error(`태그 등록 실패 (${response.status})`);
 return CareerPropertyOptionResponseSchema.parse(await response.json()).data;
}
/** 등록 결과는 현재 화면의 사용자별 category에만 합치며 공용 schema version을 바꾸지 않습니다. */
export function withCareerPropertyOption(category:CareerCategory,propertyId:string,option:{id:string;name:string}):CareerCategory {
 const definition=category.propertySchemaV2?.find(item=>item.id===propertyId&&item.deletedAt===null);
 if(!definition||definition.type!=="multi_select"||definition.config.legacyFreeformTags!==true)throw new Error("태그 속성이 변경되었습니다.");
 const options=(Array.isArray(definition.config.options)?definition.config.options:[]) as {id:string;label?:string;name?:string}[];
 const collision=options.find(item=>item.id===option.id||(item.label??item.name)===option.name);
 if(collision&&(collision.id!==option.id||(collision.label??collision.name)!==option.name))throw new Error("태그 옵션 매핑 충돌");
 return {...category,propertySchemaV2:category.propertySchemaV2!.map(item=>item.id===propertyId?{...item,config:{...item.config,options:collision?options:[...options,{id:option.id,label:option.name,name:option.name}]}}:item)};
}
