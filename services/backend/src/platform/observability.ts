import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type {
  FastifyLoggerOptions,
  FastifyRequest,
} from "fastify";

import type { RuntimeConfig } from "../config/runtime-config.js";

const REDACTED = "[REDACTED]";

export const sensitiveLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "request.headers.authorization",
  "request.headers.cookie",
  "body.password",
  "body.token",
  "body.accessToken",
  "body.refreshToken",
  "databaseUrl",
  "redisUrl",
] as const;

export function createLoggerOptions(
  logLevel: RuntimeConfig["logLevel"],
): FastifyLoggerOptions & {
  redact: { paths: string[]; censor: string };
} {
  return {
    level: logLevel,
    redact: {
      paths: [...sensitiveLogPaths],
      censor: REDACTED,
    },
    serializers: {
      req(request: FastifyRequest) {
        return {
          method: request.method,
          url: request.url.split("?", 1)[0] ?? "/",
          host: request.hostname,
        };
      },
    },
  };
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function createRequestId(request: IncomingMessage): string {
  const rawHeader = request.headers["x-request-id"];
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (candidate && SAFE_REQUEST_ID.test(candidate)) return candidate;
  return `req_${randomUUID()}`;
}

export interface SafeErrorSummary {
  name: string;
  code?: string;
  statusCode?: number;
}

export function safeErrorSummary(error: unknown): SafeErrorSummary {
  if (!(error instanceof Error)) return { name: "UnknownError" };

  const candidate = error as Error & {
    code?: unknown;
    statusCode?: unknown;
  };
  const summary: SafeErrorSummary = { name: error.name };
  if (
    typeof candidate.code === "string"
    && /^[A-Za-z0-9_]{1,64}$/.test(candidate.code)
  ) {
    summary.code = candidate.code;
  }
  if (typeof candidate.statusCode === "number") {
    summary.statusCode = candidate.statusCode;
  }
  return summary;
}
