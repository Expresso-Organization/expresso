import { API_PREFIX, CareerRecordResponseSchema, UpdateCareerRecordSchema, WritableCareerPropertyValueSchema } from "@expresso/contracts";
import { z } from "zod";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { recordId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerRecordResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store", etag: upstream.headers.get("etag") ?? "" } }); }
  catch { return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const body = await request.json().catch(() => null);
  const { recordId } = await params;
  const springPatch = z.strictObject({
    title: z.string().trim().max(300).optional(),
    propertyValues: z.array(WritableCareerPropertyValueSchema).max(50).optional(),
  }).refine((value) => Object.keys(value).length > 0).safeParse(body);
  if (springPatch.success) {
    const springBaseUrl = process.env.CAREER_SPRING_API_BASE_URL;
    if (!springBaseUrl) return new Response("Spring Career API 주소가 설정되지 않았습니다", { status: 503 });
    let upstream: Response;
    try {
      upstream = await fetch(`${springBaseUrl}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json", "if-match": request.headers.get("if-match") ?? "" },
        body: JSON.stringify(springPatch.data),
        signal: request.signal,
        cache: "no-store",
      });
    } catch {
      return new Response("Spring Career API에 연결하지 못했습니다", { status: 502 });
    }
    if (!upstream.ok) return new Response(null, { status: upstream.status });

    let refreshed: Response;
    try {
      refreshed = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`, {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
        signal: request.signal,
        cache: "no-store",
      });
    } catch {
      return new Response("Fastify Career API에 연결하지 못했습니다", { status: 502 });
    }
    if (!refreshed.ok) return new Response(null, { status: refreshed.status });
    try {
      return Response.json(CareerRecordResponseSchema.parse(await refreshed.json()), {
        headers: { "cache-control": "no-store", etag: upstream.headers.get("etag") ?? refreshed.headers.get("etag") ?? "" },
      });
    } catch {
      return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 });
    }
  }

  const parsed = UpdateCareerRecordSchema.safeParse(body);
  if (!parsed.success) return new Response("값을 확인해 주세요", { status: 400 });
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json", "if-match": request.headers.get("if-match") ?? "" }, body: JSON.stringify(parsed.data), signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerRecordResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store", etag: upstream.headers.get("etag") ?? "" } }); }
  catch { return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { recordId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  return new Response(null, { status: 204 });
}
