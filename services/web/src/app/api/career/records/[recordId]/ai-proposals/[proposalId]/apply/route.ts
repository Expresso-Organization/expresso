import { API_PREFIX, CareerWriteOperationResponseSchema, IdempotencyKeySchema, UuidSchema, AiEditProposalDetailSchema, AiProposalApplyRequestSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { forwardWriteOperationError } from "@/lib/api/write-operation-errors";
import { readAccessToken } from "@/lib/session";

const BodySchema = AiProposalApplyRequestSchema.omit({ recordId: true, proposalId: true });
export async function POST(request: Request, { params }: { params: Promise<{ recordId: string; proposalId: string }> }) {
  const token = await readAccessToken(); if (!token) return new Response(null, { status: 401 });
  const input = BodySchema.safeParse(await request.json().catch(() => null)); if (!input.success) return new Response(null, { status: 400 });
  const { recordId, proposalId } = await params;
  const key = request.headers.get("idempotency-key");
  if (!UuidSchema.safeParse(recordId).success || !UuidSchema.safeParse(proposalId).success || (key !== null && !IdempotencyKeySchema.safeParse(key).success)) return new Response(null, { status: 400 });
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/ai-proposals/${encodeURIComponent(proposalId)}/apply`, { method: "POST", headers: { ...(key ? { "idempotency-key": key } : {}), authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(input.data), cache: "no-store" });
  if (!upstream.ok) return forwardWriteOperationError(upstream, "ai-proposal", recordId, proposalId);
  if (upstream.status === 202) {
    try {
      const body = CareerWriteOperationResponseSchema.parse(await upstream.json());
      if (body.data.producer !== "ai-proposal" || (body.data.recordId !== null && body.data.recordId !== recordId) || !["pending", "running", "retry"].includes(body.data.state)) return new Response(null, { status: 502 });
      return Response.json(body, { status: 202, headers: { "cache-control": "no-store" } });
    } catch { return new Response(null, { status: 502 }); }
  }
  try { return Response.json({ data: AiEditProposalDetailSchema.parse(((await upstream.json()) as { data: unknown }).data) }); } catch { return new Response(null, { status: 502 }); }
}
