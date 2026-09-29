import {
  API_PREFIX,
  CanonicalCareerCategoryMovePreviewSchema,
  PreviewCareerCategoryMoveSchema,
} from "@expresso/contracts";
import { z } from "zod";

import { readAccessToken } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const input = PreviewCareerCategoryMoveSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 400 });
  const { recordId } = await params;
  const baseUrl = process.env.CAREER_SPRING_API_BASE_URL;
  if (!baseUrl) return new Response(null, { status: 503 });
  const upstream = await fetch(`${baseUrl}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/move/preview`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(input.data),
    cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(z.strictObject({ data: CanonicalCareerCategoryMovePreviewSchema }).parse(await upstream.json())); }
  catch { return new Response(null, { status: 502 }); }
}
