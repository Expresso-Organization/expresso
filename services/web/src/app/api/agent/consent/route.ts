import { GrantConsentSchema } from "@expresso/contracts";
import { consents } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export async function POST(request: Request) {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const parsed = GrantConsentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.scopes.length !== 1 || parsed.data.scopes[0] !== "career_records") return new Response(null, { status: 400 });
  try { return Response.json(await consents.grant(token, parsed.data.scopes, parsed.data.policyVersion)); }
  catch (error) { return Response.json({ error: { message: error instanceof ApiError && error.status === 409 ? "동의 안내가 변경되었습니다. 새로고침 후 다시 확인해 주세요." : "동의를 저장하지 못했습니다. 다시 시도해 주세요." } }, { status: error instanceof ApiError ? error.status : 502 }); }
}
