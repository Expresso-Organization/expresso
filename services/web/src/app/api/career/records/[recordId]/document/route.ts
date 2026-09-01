import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
import { API_PREFIX, CareerDocumentBootstrapSchema } from "@expresso/contracts";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { recordId } = await params;
  const upstream = await fetch(
    `${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/document`,
    {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: request.signal,
      cache: "no-store",
    },
  );
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try {
    const body = CareerDocumentBootstrapSchema.parse(await upstream.json());
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 });
  }
}
