import { API_PREFIX, SaveAgentApiKeySchema, AgentCredentialStatusSchema } from "@expresso/contracts";
import { request as apiRequest, ApiError } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
async function proxy(request: Request) {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response(null, { status: 401 });
  const parsed = request.method === "PUT" ? SaveAgentApiKeySchema.safeParse(await request.json().catch(() => null)) : null;
  if (parsed && !parsed.success) return Response.json({ error: { message: "Anthropic API 키 형식을 확인해 주세요." } }, { status: 400 });
  try { return Response.json(await apiRequest(`${API_PREFIX}/agent/credential`, AgentCredentialStatusSchema, { accessToken, method: request.method === "PUT" ? "PUT" : "DELETE", ...(parsed?.success ? { body: parsed.data } : {}) })); }
  catch (error) { return Response.json({ error: { message: "API 키 설정을 저장하지 못했습니다. 다시 시도해 주세요." } }, { status: error instanceof ApiError ? error.status : 502 }); }
}
export const PUT = proxy;
export const DELETE = proxy;
