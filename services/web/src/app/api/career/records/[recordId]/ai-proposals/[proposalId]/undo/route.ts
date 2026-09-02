import { API_PREFIX, AiProposalUndoRequestSchema, CareerDocumentBootstrapSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

const BodySchema = AiProposalUndoRequestSchema.omit({ recordId: true, proposalId: true });
export async function POST(request: Request, { params }: { params: Promise<{ recordId: string; proposalId: string }> }) {
  const token = await readAccessToken(); if (!token) return new Response(null, { status: 401 });
  const input = BodySchema.safeParse(await request.json().catch(() => null)); if (!input.success) return new Response(null, { status: 400 });
  const { recordId, proposalId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/ai-proposals/${encodeURIComponent(proposalId)}/undo`, { method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(input.data), cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { const body = await upstream.json() as { data?: unknown }; return Response.json({ data: CareerDocumentBootstrapSchema.parse(body.data ?? body) }); } catch { return new Response(null, { status: 502 }); }
}
