import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
import { API_PREFIX, CareerDocumentBootstrapSchema, RestoreCareerRevisionSchema } from "@expresso/contracts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ recordId: string; revisionId: string }> },
): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { recordId, revisionId } = await params;
  const body = RestoreCareerRevisionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });
  const upstream = await fetch(
    `${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/document/revisions/${encodeURIComponent(revisionId)}/restore`,
    { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body.data), cache: "no-store" },
  );
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try {
    // 복원 결과 본문은 열린 편집기에 WebSocket으로도 전달되므로 여기서는 버전만 돌려줍니다.
    const restored = CareerDocumentBootstrapSchema.parse(await upstream.json());
    return Response.json({ documentVersion: restored.documentVersion }, { headers: { "cache-control": "no-store" } });
  } catch {
    return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 });
  }
}
