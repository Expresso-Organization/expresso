import { API_PREFIX,CareerRegisterPropertyOptionSchema,CareerPropertyOptionResponseSchema,UuidSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export async function POST(request:Request,{params}:{params:Promise<{categoryId:string;propertyId:string}>}):Promise<Response> {
 const token=await readAccessToken();if(!token)return new Response(null,{status:401});
 const input=CareerRegisterPropertyOptionSchema.safeParse(await request.json().catch(()=>null));
 const ids=await params,categoryId=UuidSchema.safeParse(ids.categoryId),propertyId=UuidSchema.safeParse(ids.propertyId);
 if(!input.success||!categoryId.success||!propertyId.success)return new Response(null,{status:400});
 const response=await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${categoryId.data}/property-schema/${propertyId.data}/options`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json",accept:"application/json"},body:JSON.stringify(input.data),cache:"no-store",signal:request.signal});
 if(!response.ok)return new Response(null,{status:response.status});
 try{return Response.json(CareerPropertyOptionResponseSchema.parse(await response.json()));}catch{return new Response(null,{status:502});}
}
