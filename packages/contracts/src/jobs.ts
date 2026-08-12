import { z } from "zod";

import {
  IdempotencyKeySchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";

export const JobTypeSchema = z.enum([
  "job_analysis",
  "interview",
  "recipe",
  "generation",
  "export",
  "analytics",
  "notification",
  "scheduled",
]);

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
]);

export const JobEnvelopeBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  jobId: UuidSchema,
  type: JobTypeSchema,
  userId: UuidSchema,
  idempotencyKey: IdempotencyKeySchema,
  traceId: z.string().min(8).max(128),
  enqueuedAt: TimestampSchema,
});

export function createJobEnvelopeSchema<
  TType extends z.infer<typeof JobTypeSchema>,
  TPayload extends z.ZodType,
>(
  type: TType,
  payloadSchema: TPayload,
) {
  return JobEnvelopeBaseSchema.extend({
    type: z.literal(type),
    payload: payloadSchema,
  });
}

export const JobFailureSchema = z.strictObject({
  code: z.string().min(1).max(100),
  retryable: z.boolean(),
  message: z.string().min(1).max(500),
});

export const JobProgressEventSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    jobId: UuidSchema,
    status: JobStatusSchema,
    stage: z.string().min(1).max(100),
    progress: z.number().int().min(0).max(100),
    occurredAt: TimestampSchema,
    failure: JobFailureSchema.optional(),
  })
  .superRefine((event, context) => {
    const isFailure = event.status === "failed" || event.status === "dead_letter";
    if (isFailure && event.failure === undefined) {
      context.addIssue({
        code: "custom",
        message: "failed jobs require failure details",
        path: ["failure"],
      });
    }
    if (!isFailure && event.failure !== undefined) {
      context.addIssue({
        code: "custom",
        message: "non-failed jobs cannot include failure details",
        path: ["failure"],
      });
    }
  });

export type JobType = z.infer<typeof JobTypeSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobEnvelopeBase = z.infer<typeof JobEnvelopeBaseSchema>;
export type JobProgressEvent = z.infer<typeof JobProgressEventSchema>;

// ── 제작 단계 잡 ─────────────────────────────────────────────────────

/**
 * 질문 생성 · 레시피 생성.
 *
 * 둘 다 §8.3 계약을 부르느라 1분쯤 걸린다. HTTP 요청 안에서 돌리면 요청이
 * 그동안 커넥션을 붙들고, 클라이언트가 끊으면 결과가 사라진다. 그래서 추출과
 * 같은 모양으로 큐에 넣고 **결과가 생기면 그걸 가리킨다.**
 */
export const BrewJobTypeSchema = z.enum(["interview", "recipe"]);

export const BrewJobStatusSchema = z.strictObject({
  jobId: UuidSchema,
  type: BrewJobTypeSchema,
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  stage: z.string().min(1).max(100),
  attempts: z.number().int().nonnegative(),
  /** 만들어진 것. interview면 세션 id, recipe면 레시피 id. */
  resultId: UuidSchema.nullable(),
  failure: z.strictObject({
    code: z.string().min(1).max(100),
    retryable: z.boolean(),
  }).nullable(),
});

export const BrewJobResponseSchema = z.strictObject({ data: BrewJobStatusSchema });

export type BrewJobType = z.infer<typeof BrewJobTypeSchema>;
export type BrewJobStatus = z.infer<typeof BrewJobStatusSchema>;
