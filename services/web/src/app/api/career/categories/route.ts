import {
  API_PREFIX,
  CareerCategoriesResponseSchema,
  CareerCategorySchema,
  CreateCareerCategorySchema,
} from "@expresso/contracts";
import { z } from "zod";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function GET() {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try {
    return Response.json(CareerCategoriesResponseSchema.parse(await upstream.json()));
  } catch {
    return new Response(null, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const input = CreateCareerCategorySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) return new Response(null, { status: 400 });
  const springApiBaseUrl = process.env.CAREER_SPRING_API_BASE_URL;
  if (!springApiBaseUrl) {
    return new Response("Spring Career API 주소가 설정되지 않았습니다", {
      status: 503,
    });
  }

  const upstream = await fetch(`${springApiBaseUrl}${API_PREFIX}/career/categories`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input.data),
    signal: request.signal,
    cache: "no-store",
  });
  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }
  try {
    const payload = z.strictObject({ data: CareerCategorySchema }).parse(
      await upstream.json(),
    );
    const headers = new Headers();
    const etag = upstream.headers.get("etag");
    if (etag) headers.set("etag", etag);
    return Response.json(payload, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
