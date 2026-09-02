import { API_PREFIX, CareerFormulaPreviewSchema, PreviewCareerFormulaSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function POST(request: Request) {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const input = PreviewCareerFormulaSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 400 });
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/formulas/preview`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(input.data), cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json({ data: CareerFormulaPreviewSchema.parse(((await upstream.json()) as { data: unknown }).data) }); }
  catch { return new Response(null, { status: 502 }); }
}
