import { API_PREFIX, AiEditProposalDetailSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ recordId: string; proposalId: string }> }) {
  const token = await readAccessToken(); if (!token) return new Response(null, { status: 401 });
  const { recordId, proposalId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/ai-proposals/${encodeURIComponent(proposalId)}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json({ data: AiEditProposalDetailSchema.parse(((await upstream.json()) as { data: unknown }).data) }); } catch { return new Response(null, { status: 502 }); }
}
