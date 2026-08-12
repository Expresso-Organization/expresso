import { z } from "zod";

export const API_VERSION = "v1" as const;
export const API_PREFIX = `/${API_VERSION}` as const;

export const UuidSchema = z.uuid();
export const TimestampSchema = z.iso.datetime({ offset: true });

export const ErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "PRECONDITION_FAILED",
  /** 요청은 읽었고 뜻도 알았는데 그대로는 할 수 없다. 422. */
  "UNPROCESSABLE",
  "RATE_LIMITED",
  "DEPENDENCY_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string().min(1).max(500),
  requestId: z.string().min(8).max(128),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ApiErrorResponseSchema = z.strictObject({
  error: ApiErrorSchema,
});

export const CursorPaginationQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PageInfoSchema = z.strictObject({
  nextCursor: z.string().min(1).max(512).nullable(),
  hasNextPage: z.boolean(),
});

/**
 * 번호로 넘기는 페이지.
 *
 * 커서 페이징(`PageInfoSchema`)과 갈라 둔다 — 커서는 **다음 장**만 알고
 * "3쪽으로" 갈 수 없다. 훑어 내려가는 피드에는 커서가 맞지만, 목록을 오가며
 * 고르는 화면에는 몇 쪽인지와 몇 쪽까지인지가 필요하다.
 */
export const OffsetPageInfoSchema = z.strictObject({
  /** 1부터. */
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** 걸린 것이 없으면 0이다 — "1쪽 중 1쪽"이라고 말하면 없는 쪽을 말하는 것이다. */
  totalPages: z.number().int().nonnegative(),
  hasPrevPage: z.boolean(),
  hasNextPage: z.boolean(),
});

export type OffsetPageInfo = z.infer<typeof OffsetPageInfoSchema>;

export function createCursorPageSchema<TItem extends z.ZodType>(
  itemSchema: TItem,
) {
  return z.strictObject({
    data: z.array(itemSchema),
    page: PageInfoSchema,
  });
}

export const ResourceVersionSchema = z.strictObject({
  version: z.number().int().positive(),
  updatedAt: TimestampSchema,
});

const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._~:+\-/]+$/;

export const IdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(SAFE_IDEMPOTENCY_KEY);

export const IdempotencyHeadersSchema = z.strictObject({
  "idempotency-key": IdempotencyKeySchema,
});

export const IfMatchHeaderSchema = z
  .string()
  .regex(/^"v[1-9]\d*"$/, "If-Match must use the quoted resource version format");

export function formatResourceEtag(version: number): string {
  return IfMatchHeaderSchema.parse(`"v${version}"`);
}

export function parseResourceEtag(value: string): number {
  const validated = IfMatchHeaderSchema.parse(value);
  return Number.parseInt(validated.slice(2, -1), 10);
}

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type CursorPaginationQuery = z.infer<
  typeof CursorPaginationQuerySchema
>;
export type PageInfo = z.infer<typeof PageInfoSchema>;
export type ResourceVersion = z.infer<typeof ResourceVersionSchema>;
