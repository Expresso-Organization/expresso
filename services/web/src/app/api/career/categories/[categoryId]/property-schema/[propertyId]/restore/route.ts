import { readAccessToken } from "@/lib/session";

export async function POST(_request: Request, { params: _params }: { params: Promise<{ categoryId: string; propertyId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken(); if (!accessToken) return new Response(null, { status: 401 });
  return new Response(null, { status: 404 });
}
