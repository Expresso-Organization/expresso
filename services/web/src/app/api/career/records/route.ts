import {
  API_PREFIX,
  CareerPropertiesSchema,
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
const GroupedInitialPropertyValueSchema = z.discriminatedUnion("type", [
  z.strictObject({
    propertyDefinitionId: UuidSchema,
    type: z.literal("select"),
    value: UuidSchema,
  }),
  z.strictObject({
    propertyDefinitionId: UuidSchema,
    type: z.literal("multi_select"),
    value: z.array(UuidSchema).length(1),
  }),
]);
const GroupedInitialPropertyValuesSchema = z.array(GroupedInitialPropertyValueSchema).max(1);
const SpringGroupedCreateCareerRecordSchema = z.strictObject({
  categoryId: UuidSchema,
  propertyValues: GroupedInitialPropertyValuesSchema,
});
const SpringDuplicateCreateCareerRecordSchema = z.strictObject({
  createMode: z.literal("duplicate"),
  categoryId: UuidSchema,
  title: z.string().max(300),
  properties: CareerPropertiesSchema,
  bodyMd: z.string().max(200_000),
});

export async function POST(request: Request) {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const legacyBody = CreateCareerRecordSchema.safeParse(rawBody);
  const groupedBody = SpringGroupedCreateCareerRecordSchema.safeParse(rawBody);
  const duplicateBody = SpringDuplicateCreateCareerRecordSchema.safeParse(rawBody);
  if (!legacyBody.success && !groupedBody.success && !duplicateBody.success) return new Response(null, { status: 400 });

  const springApiBaseUrl = process.env.CAREER_SPRING_API_BASE_URL?.replace(
    /\/+$/,
    "",
  );
  const isEmptyRecord =
    legacyBody.success &&
    legacyBody.data.title === "" &&
    Object.keys(legacyBody.data.properties).length === 0 &&
    legacyBody.data.bodyMd === "";
  const springBody = duplicateBody.success
    ? {
        categoryId: duplicateBody.data.categoryId,
        title: duplicateBody.data.title,
        properties: duplicateBody.data.properties,
        bodyMd: duplicateBody.data.bodyMd,
      }
    : groupedBody.success
    ? groupedBody.data
    : legacyBody.success
      ? { categoryId: legacyBody.data.categoryId }
      : null;

  if ((isEmptyRecord || groupedBody.success || duplicateBody.success) && !springApiBaseUrl) {
    return new Response(null, { status: 503 });
  }
  if (springApiBaseUrl && springBody && (isEmptyRecord || groupedBody.success || duplicateBody.success)) {
    try {
      return await createRecordWithSpring({
        request,
        token,
        springApiBaseUrl,
        body: springBody,
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  }

  if (!legacyBody.success) return new Response(null, { status: 400 });

  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records`, {
    method: "POST",
    headers: createHeaders(request, token),
    body: JSON.stringify(legacyBody.data),
    cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });

  return parseLegacyCareerRecordResponse(upstream);
}

async function createRecordWithSpring({
  request,
  token,
  springApiBaseUrl,
  body,
}: {
  request: Request;
  token: string;
  springApiBaseUrl: string;
  body: unknown;
}) {
  const created = await fetch(
    `${springApiBaseUrl}${API_PREFIX}/career/records`,
    {
      method: "POST",
      headers: createHeaders(request, token),
      body: JSON.stringify(body),
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
