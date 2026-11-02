import { API_PREFIX, CareerViewListResponseSchema, CareerViewResponseSchema, CreateCareerViewConfigurationSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client"; import { readAccessToken } from "@/lib/session";
export async function POST(request:Request,{params}:{params:Promise<{categoryId:string}>}){const token=await readAccessToken();if(!token)return new Response(null,{status:401});const {categoryId}=await params;const body=CreateCareerViewConfigurationSchema.safeParse(await request.json().catch(()=>null));if(!body.success)return new Response("값을 확인해 주세요",{status:400});const upstream=await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/view-configurations`,{method:"POST",headers:{authorization:`Bearer ${token}`,accept:"application/json","content-type":"application/json","if-match":request.headers.get("if-match")??""},body:JSON.stringify(body.data),cache:"no-store"});if(!upstream.ok)return new Response(null,{status:upstream.status});try{return Response.json(CareerViewResponseSchema.parse(await upstream.json()))}catch{return new Response(null,{status:502})}}

export async function GET(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const { categoryId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/view-configurations`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerViewListResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store" } }); }
  catch { return new Response(null, { status: 502 }); }
}
