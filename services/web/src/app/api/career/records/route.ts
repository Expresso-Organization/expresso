import {
  API_PREFIX,
  CareerRecordResponseSchema,
  CreateCareerRecordSchema,
  UuidSchema,
} from "@expresso/contracts";
import { z } from "zod";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

const SpringCreateCareerRecordResponseSchema = z.object({
  data: z.object({ id: UuidSchema }),
});

export async function POST(request: Request) {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });

  const body = CreateCareerRecordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return new Response(null, { status: 400 });

  const springApiBaseUrl = process.env.CAREER_SPRING_API_BASE_URL?.replace(
    /\/+$/,
    "",
  );
  const isEmptyRecord =
    body.data.title === "" &&
    Object.keys(body.data.properties).length === 0 &&
    body.data.bodyMd === "";

  if (springApiBaseUrl && isEmptyRecord) {
    try {
      return await createEmptyRecordWithSpring({
        request,
        token,
        springApiBaseUrl,
        categoryId: body.data.categoryId,
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  }

  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records`, {
    method: "POST",
    headers: createHeaders(request, token),
    body: JSON.stringify(body.data),
    cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });

  return parseLegacyCareerRecordResponse(upstream);
}

async function createEmptyRecordWithSpring({
  request,
  token,
  springApiBaseUrl,
  categoryId,
}: {
  request: Request;
  token: string;
  springApiBaseUrl: string;
  categoryId: string;
}) {
  const created = await fetch(
    `${springApiBaseUrl}${API_PREFIX}/career/records`,
    {
      method: "POST",
      headers: createHeaders(request, token),
      body: JSON.stringify({ categoryId }),
      cache: "no-store",
    },
  );
  if (!created.ok) return new Response(null, { status: created.status });

  const createdBody = SpringCreateCareerRecordResponseSchema.safeParse(
    await created.json().catch(() => null),
  );
  if (!createdBody.success) return new Response(null, { status: 502 });

  const legacyRecord = await fetch(
    `${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(createdBody.data.data.id)}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!legacyRecord.ok) {
    return new Response(null, { status: legacyRecord.status });
  }

  return parseLegacyCareerRecordResponse(legacyRecord);
}

function createHeaders(request: Request, token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/json",
    "content-type": "application/json",
    "idempotency-key": request.headers.get("idempotency-key") ?? "",
  };
}

async function parseLegacyCareerRecordResponse(response: Response) {
  try {
    return Response.json(CareerRecordResponseSchema.parse(await response.json()));
  } catch {
    return new Response(null, { status: 502 });
  }
}
