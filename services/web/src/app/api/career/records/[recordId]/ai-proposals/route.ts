import { API_PREFIX, AiEditProposalDetailSchema, CreateAiEditProposalSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const token = await readAccessToken(); if (!token) return new Response(null, { status: 401 });
  const input = CreateAiEditProposalSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return new Response(null, { status: 400 });
  const { recordId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/ai-proposals`, { method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(input.data), cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json({ data: AiEditProposalDetailSchema.parse(((await upstream.json()) as { data: unknown }).data) }, { status: 202 }); } catch { return new Response(null, { status: 502 }); }
}
