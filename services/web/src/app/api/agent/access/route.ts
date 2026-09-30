import { API_PREFIX, AgentChatAccessSchema } from "@expresso/contracts";
import { request, ApiError } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export async function GET() {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response(null, { status: 401 });
  try { return Response.json(await request(`${API_PREFIX}/agent/access`, AgentChatAccessSchema, { accessToken, cache: "no-store" })); }
  catch (error) { return Response.json({ error: { message: "채팅 사용 권한을 확인하지 못했습니다." } }, { status: error instanceof ApiError ? error.status : 502 }); }
}
