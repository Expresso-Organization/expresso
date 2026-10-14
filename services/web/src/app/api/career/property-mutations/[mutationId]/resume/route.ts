import { API_PREFIX, CareerPropertyMutationStatusResponseSchema, CareerResumePropertyMutationSchema, UuidSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ mutationId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const id = UuidSchema.safeParse((await params).mutationId);
  if (!id.success) return new Response(null, { status: 400 });
  const text = await request.text();
  let raw: unknown;
  try { raw = text === "" ? {} : JSON.parse(text); }
  catch { return new Response(null, { status: 400 }); }
  const input = CareerResumePropertyMutationSchema.safeParse(raw);
  if (!input.success) return new Response(null, { status: 400 });
  const response = await fetch(API_BASE_URL + API_PREFIX + "/career/property-mutations/" + id.data + "/resume", {
    method: "POST", headers: { authorization: "Bearer " + token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(input.data), cache: "no-store", signal: request.signal,
  });
  if (!response.ok) return new Response(null, { status: response.status });
  try {
    const result = CareerPropertyMutationStatusResponseSchema.parse(await response.json());
    if (result.data.id !== id.data) return new Response(null, { status: 502 });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch { return new Response(null, { status: 502 }); }
}