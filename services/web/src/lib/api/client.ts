import { ApiErrorResponseSchema, type ErrorCode } from "@expresso/contracts";
import type { z } from "zod";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly requestId: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(init: {
    status: number;
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.details = init.details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  accessToken?: string | undefined;
  idempotencyKey?: string;
  ifMatch?: string;
  signal?: AbortSignal;
  /** 서버 컴포넌트에서 Next의 fetch 캐시를 제어할 때 쓴다. */
  cache?: RequestCache;
  revalidate?: number | false;
}

function buildUrl(path: string, query: RequestOptions["query"]): string {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * 모든 응답은 contracts의 Zod 스키마로 검증한다. 백엔드가 계약을 어기면
 * 화면이 이상하게 그려지는 대신 여기서 즉시 실패한다.
 */
export async function request<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: RequestOptions = {},
): Promise<z.infer<TSchema>> {
  const response = await fetchRaw(path, options);
  if (response.status === 204) {
    return schema.parse(undefined) as z.infer<TSchema>;
  }
  return schema.parse(await response.json()) as z.infer<TSchema>;
}

export async function requestNoContent(
  path: string,
  options: RequestOptions = {},
): Promise<void> {
  await fetchRaw(path, options);
}

async function fetchRaw(
  path: string,
  options: RequestOptions,
): Promise<Response> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.accessToken) {
    headers.set("authorization", `Bearer ${options.accessToken}`);
  }
  if (options.idempotencyKey) {
    headers.set("idempotency-key", options.idempotencyKey);
  }
  if (options.ifMatch) {
    headers.set("if-match", options.ifMatch);
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.cache ? { cache: options.cache } : {}),
    ...(options.revalidate === undefined
      ? {}
      : { next: { revalidate: options.revalidate } }),
  });

  if (!response.ok) throw await toApiError(response);
  return response;
}

async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("x-request-id") ?? "unknown";
  try {
    const parsed = ApiErrorResponseSchema.parse(await response.json());
    return new ApiError({
      status: response.status,
      code: parsed.error.code,
      message: parsed.error.message,
      requestId: parsed.error.requestId,
      ...(parsed.error.details ? { details: parsed.error.details } : {}),
    });
  } catch {
    // 계약을 벗어난 오류 본문(프록시 오류 등)도 같은 형태로 다룬다.
    return new ApiError({
      status: response.status,
      code: response.status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR",
      message: `Unexpected ${response.status} response`,
      requestId,
    });
  }
}
