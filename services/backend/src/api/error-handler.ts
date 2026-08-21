import type { ErrorCode } from "@expresso/contracts";
import type { FastifyInstance } from "fastify";

import { safeErrorSummary } from "../platform/observability.js";

function errorCodeForStatus(statusCode: number): ErrorCode {
  if (statusCode === 400) return "VALIDATION_ERROR";
  if (statusCode === 401) return "AUTH_REQUIRED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 412) return "PRECONDITION_FAILED";
  if (statusCode === 422) return "UNPROCESSABLE";
  if (statusCode === 429) return "RATE_LIMITED";
  if (statusCode === 503) return "DEPENDENCY_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

function publicMessageForStatus(statusCode: number): string {
  if (statusCode === 400) return "Request validation failed";
  if (statusCode === 401) return "Authentication required";
  if (statusCode === 403) return "Access denied";
  if (statusCode === 404) return "Resource not found";
  if (statusCode === 409) return "Request conflicts with current state";
  if (statusCode === 412) return "Resource version is stale";
  if (statusCode === 422) return "Request cannot be fulfilled as given";
  if (statusCode === 429) return "Rate limit exceeded";
  if (statusCode === 503) return "Service dependency unavailable";
  return "Internal server error";
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: publicMessageForStatus(404),
        requestId: request.id,
      },
    }),
  );

  app.setErrorHandler(async (error, request, reply) => {
    const errorValue: Error & {
      statusCode?: number;
      publicDetails?: Record<string, unknown>;
    } = error instanceof Error
      ? error as Error & {
          statusCode?: number;
          publicDetails?: Record<string, unknown>;
        }
      : new Error("Unknown request error");
    const candidateStatus = errorValue.statusCode ?? 500;
    const statusCode = candidateStatus >= 400 && candidateStatus < 600
      ? candidateStatus
      : 500;
    const code = errorCodeForStatus(statusCode);

    request.log.error(
      { requestId: request.id, error: safeErrorSummary(error) },
      "request failed",
    );
    if (process.env.EXPRESSO_SQL_TRACE === "1") {
      console.error("요청 실패:", statusCode, request.url, "|", String(errorValue.message).slice(0, 200));
    }

    return reply.code(statusCode).send({
      error: {
        code,
        message: publicMessageForStatus(statusCode),
        requestId: request.id,
        ...(errorValue.publicDetails
          ? { details: errorValue.publicDetails }
          : {}),
      },
    });
  });
}
