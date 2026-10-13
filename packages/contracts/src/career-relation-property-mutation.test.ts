import { expect, it } from "vitest";
import { CareerPropertyMutationCommitSchema, CareerPropertyMutationPlanSchema, CareerPropertyMutationReadSchema } from "./career-property-mutation.js";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const target={id:id(11),key:"links",name:"links",type:"relation",required:false,system:false,config:{targetCategoryId:id(2),inversePropertyId:null,cardinality:"multiple",deletePolicy:"nullify"},order:0,version:2,deletedAt:"2026-10-09T00:00:00Z"};
const base={mutationId:id(1),recordId:id(3),expectedVersion:1,leaseToken:id(4),operationFingerprint:"a".repeat(64)};
it("allows relation deletion/restoration plans without adding relation to scalar values",()=>{
  expect(CareerPropertyMutationPlanSchema.safeParse({kind:"deletion",source:{...target,version:1,deletedAt:null},target,defaultValue:null,confirmLossy:true}).success).toBe(true);
  expect(CareerPropertyMutationPlanSchema.safeParse({kind:"restoration",source:target,target:{...target,version:3,deletedAt:null},defaultValue:null,confirmLossy:false}).success).toBe(true);
  for(const kind of ["conversion","default"])expect(CareerPropertyMutationPlanSchema.safeParse({kind,source:kind==="default"?null:target,target:{...target,deletedAt:null},defaultValue:kind==="default"?{propertyDefinitionId:id(11),type:"relation",value:[]}:null,confirmLossy:false}).success).toBe(false);
});
it("keeps scalar and relation commits strict and exclusive with unique bounded targets",()=>{
  const relationChanges={targetRecordIds:[id(5)],targetRecordVersions:{[id(5)]:7}};
  expect(CareerPropertyMutationCommitSchema.parse({...base,relationChanges})).toEqual({...base,relationChanges});
  for(const invalid of [{...base,relationChanges,propertyValues:{set:[],unsetPropertyIds:[]}},{...base,relationChanges:{...relationChanges,targetRecordIds:[id(5),id(5)]}},{...base,relationChanges:{...relationChanges,targetRecordVersions:{[id(5)]:0}}},{...base,relationChanges:{...relationChanges,bodyMd:"forbidden"}}])expect(CareerPropertyMutationCommitSchema.safeParse(invalid).success).toBe(false);
});
it("reads exact relation edge identities and optional inverse null separately from scalar tombstones",()=>{
  const data={id:id(3),userId:id(1),categoryId:id(2),title:"",propertyValues:[],status:"draft",version:1,updatedAt:"2026-10-09T00:00:00Z"};
  const edge={id:id(10),userId:id(1),sourceRecordId:id(3),sourcePropertyId:id(11),targetRecordId:id(5),cardinality:"multiple",deletePolicy:"nullify",createdBy:"user",createdAt:"2026-10-09T00:00:00.000Z",updatedAt:"2026-10-09T00:00:00.000Z"};
  const read={data,relation:{edges:[edge],inverseEdges:[],targetRecordVersions:{[id(5)]:7},tombstone:null}};
  expect(CareerPropertyMutationReadSchema.parse(read)).toEqual(read);
  expect(CareerPropertyMutationReadSchema.safeParse({...read,tombstone:null}).success).toBe(false);
  expect(CareerPropertyMutationReadSchema.safeParse({...read,relation:{...read.relation,edges:[{...edge,createdBy:id(1)}]}}).success).toBe(false);
});