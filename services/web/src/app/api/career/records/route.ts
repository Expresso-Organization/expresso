import { API_PREFIX, CareerRecordListResponseSchema, CareerRecordResponseSchema, CreateCareerRecordSchema, ListCareerRecordsQuerySchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client"; import { readAccessToken } from "@/lib/session";
export async function POST(request:Request){const token=await readAccessToken();if(!token)return new Response(null,{status:401});const body=CreateCareerRecordSchema.safeParse(await request.json().catch(()=>null));if(!body.success)return new Response(null,{status:400});const upstream=await fetch(`${API_BASE_URL}${API_PREFIX}/career/records`,{method:"POST",headers:{authorization:`Bearer ${token}`,accept:"application/json","content-type":"application/json","idempotency-key":request.headers.get("idempotency-key")??""},body:JSON.stringify(body.data),cache:"no-store"});if(!upstream.ok)return new Response(null,{status:upstream.status});try{return Response.json(CareerRecordResponseSchema.parse(await upstream.json()))}catch{return new Response(null,{status:502})}}

/** 카테고리 화면의 「더 보기」가 다음 쪽을 이어 붙인다. */
export async function GET(request: Request): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const query = ListCareerRecordsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return new Response(null, { status: 400 });
  const search = new URLSearchParams(Object.entries(query.data).flatMap(([key, value]) => value === undefined ? [] : [[key, String(value)]]));
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records?${search}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerRecordListResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store" } }); }
  catch { return new Response(null, { status: 502 }); }
}
