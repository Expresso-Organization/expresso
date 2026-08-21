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

/**
 * 로그에 남기면 안 되는 것들.
 *
 * 세션 토큰 · 접속 문자열 · 이메일 · `key=value` 꼴의 비밀이다. 프로바이더가
 * 돌려준 거절 사유처럼 **우리 쪽 버그를 설명하는 문장**을 남기려면 이걸 먼저
 * 지나야 한다.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /exps_[A-Za-z0-9_-]+/g,
  /\b(?:mysql|postgres|postgresql|redis|rediss|amqp|mongodb):\/\/\S+/gi,
  /\bBearer\s+\S+/gi,
  /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*\S+/gi,
];

/**
 * 사람에게 보여 줄 만큼만 남긴 문장.
 *
 * `safeErrorSummary`는 메시지를 통째로 버린다 — 원문 개인정보가 섞일 수 있어서다.
 * 그런데 그러면 잡이 다섯 번 죽어도 **왜 죽었는지 아무 데도 안 남는다.** 실제로
 * 지면 생성이 그렇게 죽고 있었고, 원인(`'uri' is not a valid format`)은 같은 잡을
 * 직접 돌려 보고서야 찾았다.
 *
 * 그래서 아는 비밀 모양을 지우고 길이를 자른 뒤에만 남긴다. 사용자 기록 본문이
 * 통째로 섞일 수 있는 자리에는 쓰지 않는다 — 프로바이더의 거절 사유처럼 **우리
 * 요청에 대한 설명**에만 쓴다.
 */
export function redactedDetail(value: string, limit = 400): string {
  const redacted = SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, REDACTED),
    value,
  );
  const collapsed = redacted.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
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
