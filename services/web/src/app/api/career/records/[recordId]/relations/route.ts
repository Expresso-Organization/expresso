import {
  API_PREFIX,
  CareerRecordResponseSchema,
  CareerRelationTargetSchema,
  ReplaceCareerRelationTargetsSchema,
} from "@expresso/contracts";
import { z } from "zod";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const { recordId } = await params;
  const query = new URL(request.url).searchParams;
  const upstream = await fetch(
    `${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/relations?${query}`,
    {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try {
    return Response.json(
      z.strictObject({ data: z.array(CareerRelationTargetSchema) }).parse(await upstream.json()),
    );
  } catch {
    return new Response(null, { status: 502 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const input = ReplaceCareerRelationTargetsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 400 });
  const springBaseUrl = process.env.CAREER_SPRING_API_BASE_URL?.replace(/\/+$/, "");
  if (!springBaseUrl) {
    return new Response("Spring Career API 주소가 설정되지 않았습니다", { status: 503 });
  }
  const { recordId } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${springBaseUrl}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/relations`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "content-type": "application/json",
          "if-match": request.headers.get("if-match") ?? "",
        },
        body: JSON.stringify(input.data),
        signal: request.signal,
        cache: "no-store",
      },
    );
  } catch {
    return new Response("Spring Career API에 연결하지 못했습니다", { status: 502 });
  }
  if (!upstream.ok) return new Response(null, { status: upstream.status });

  let refreshed: Response;
  try {
    refreshed = await fetch(
      `${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`,
      {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: request.signal,
        cache: "no-store",
      },
    );
  } catch {
    return new Response("Fastify Career API에 연결하지 못했습니다", { status: 502 });
  }
  if (!refreshed.ok) return new Response(null, { status: refreshed.status });
  try {
    const record = CareerRecordResponseSchema.parse(await refreshed.json());
    return Response.json(record, {
      headers: {
        "cache-control": "no-store",
        etag: `"v${record.data.version}"`,
      },
    });
  } catch {
    return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 });
  }
}
