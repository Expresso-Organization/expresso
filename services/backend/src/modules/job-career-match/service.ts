import { randomUUID } from "node:crypto";

import {
  AnalyzeJobCareerMatchSchema,
  JobCareerMatchResultSchema,
  type AnalyzeJobCareerMatch,
  type JobCareerMatchAiOutput,
  type JobCareerMatchResult,
} from "@expresso/contracts";
import {
  mongoCollections,
  type JobCareerMatchDoc,
} from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";

import {
  JOB_CAREER_MATCH_PROMPT_VERSION,
  JobCareerMatchAnalyzer,
  validateJobCareerMatchEvidence,
} from "./analyzer.js";
import { createJobCareerMatchInputFingerprint } from "./input-fingerprint.js";
import {
  JobCareerMatchInputLoader,
  type JobCareerMatchInput,
} from "./input-loader.js";
import { JobCareerMatchError } from "./public.js";
import { resolveMatchChat } from "./chat-context.js";

type BeginResult =
  | {
      kind: "completed";
      result: JobCareerMatchResult;
    }
  | {
      kind: "started";
      id: string;
      attemptId: string;
      inputFingerprint: string;
    };

export class JobCareerMatchService {
  constructor(
    readonly context: MongoContext,
    readonly inputLoader: JobCareerMatchInputLoader,
    readonly analyzer: JobCareerMatchAnalyzer | null,
    readonly generationLeaseMs: number,
  ) {
    if (
      !Number.isSafeInteger(generationLeaseMs) ||
      generationLeaseMs <= 0
    ) {
      throw new Error("Invalid career match generation lease");
    }
  }

  // 마지막으로 완료된 분석 결과를 조회합니다.
  async getLatest(
    userId: string,
    sessionId: string,
  ): Promise<JobCareerMatchResult | null> {
    const db = mongoCollections(this.context.db);

    const session = await resolveMatchChat(
      this.context.db,
      userId,
      sessionId,
    );

    const row = await db.jobCareerMatches.findOne(
      {
        userId,
        sessionId,
        status: "completed",
      },
      {
        sort: { createdAt: -1, _id: -1 },
      },
    );

    if (!row) return null;

    return JobCareerMatchResultSchema.parse(row.result);
  }

  // 같은 requestId로 완료된 요청은 기존 결과를 반환합니다.
  private async getCompletedRequest(
    userId: string,
    sessionId: string,
    requestId: string,
  ): Promise<JobCareerMatchResult | null> {
    const db = mongoCollections(this.context.db);

    const session = await resolveMatchChat(
      this.context.db,
      userId,
      sessionId,
    );

    const row = await db.jobCareerMatches.findOne({
      userId,
      sessionId,
      requestId,
      status: "completed",
    });

    return row
      ? JobCareerMatchResultSchema.parse(row.result)
      : null;
  }

  private async begin(
    userId: string,
    sessionId: string,
    requestId: string,
    input: JobCareerMatchInput,
  ): Promise<BeginResult> {
    const inputFingerprint =
      createJobCareerMatchInputFingerprint(input);

    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const db = mongoCollections(tx.db);
      const options = { session: tx.session };
      const now = new Date();

      const session = await resolveMatchChat(
        tx.db,
        userId,
        sessionId,
        options,
      );

      if (session.jobPostingId !== input.job.id) {
        throw new JobCareerMatchError(
          409,
          "chat job changed before analysis",
        );
      }

      const existing = await db.jobCareerMatches.findOne(
        { userId, sessionId, requestId },
        options,
      );

      if (existing?.status === "completed") {
        return {
          kind: "completed",
          result: JobCareerMatchResultSchema.parse(existing.result),
        };
      }

      // 만료된 작업을 실패 상태로 변경합니다.
      await db.jobCareerMatches.updateMany(
        {
          userId,
          sessionId,
          status: "running",
          expiresAt: { $lte: now },
        },
        {
          $set: {
            status: "failed",
            attemptId: null,
            expiresAt: null,
            result: null,
            failureCode: "GENERATION_EXPIRED",
            updatedAt: now,
          },
        },
        options,
      );

      const running = await db.jobCareerMatches.findOne(
        { userId, sessionId, status: "running" },
        options,
      );

      if (running) {
        throw new JobCareerMatchError(
          409,
          "career match analysis is already running",
        );
      }

      // 재시도 시 입력이 바뀌었다면 새로운 요청 ID를 사용합니다.
      if (
        existing &&
        existing.inputFingerprint !== inputFingerprint
      ) {
        throw new JobCareerMatchError(
          409,
          "analysis input changed; use a new request ID",
        );
      }

      const attemptId = randomUUID();
      const expiresAt = new Date(
        now.getTime() + this.generationLeaseMs,
      );

      let id: string;

      if (existing) {
        id = existing._id;

        await db.jobCareerMatches.updateOne(
          { _id: id, userId, sessionId },
          {
            $set: {
              status: "running",
              attemptId,
              expiresAt,
              result: null,
              failureCode: null,
              updatedAt: now,
            },
          },
          options,
        );
      } else {
        id = randomUUID();

        const doc: JobCareerMatchDoc = {
          _id: id,
          userId,
          sessionId,
          requestId,
          status: "running",
          inputFingerprint,
          promptVersion: JOB_CAREER_MATCH_PROMPT_VERSION,
          attemptId,
          expiresAt,
          result: null,
          failureCode: null,
          createdAt: now,
          updatedAt: now,
        };

        await db.jobCareerMatches.insertOne(doc, options);
      }

      return {
        kind: "started",
        id,
        attemptId,
        inputFingerprint,
      };
    });
  }

  private async complete(
    userId: string,
    sessionId: string,
    requestId: string,
    attemptId: string,
    input: JobCareerMatchInput,
    output: JobCareerMatchAiOutput,
  ): Promise<JobCareerMatchResult> {
    // 저장 직전에도 분석 입력에 대한 근거를 확인합니다.
    const validated = validateJobCareerMatchEvidence(input, output);
    const inputFingerprint =
      createJobCareerMatchInputFingerprint(input);

    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const db = mongoCollections(tx.db);
      const options = { session: tx.session };
      const now = new Date();

      const session = await resolveMatchChat(
        tx.db,
        userId,
        sessionId,
        options,
      );

      if (session.jobPostingId !== input.job.id) {
        throw new JobCareerMatchError(
          409,
          "chat job changed during analysis",
        );
      }

      const row = await db.jobCareerMatches.findOne(
        { userId, sessionId, requestId },
        options,
      );

      if (!row) {
        throw new JobCareerMatchError(
          409,
          "analysis request not found",
        );
      }

      if (row.status === "completed") {
        return JobCareerMatchResultSchema.parse(row.result);
      }

      if (
        row.status !== "running" ||
        row.attemptId !== attemptId ||
        !row.expiresAt ||
        row.expiresAt <= now ||
        row.inputFingerprint !== inputFingerprint
      ) {
        throw new JobCareerMatchError(
          409,
          "analysis attempt expired or changed",
        );
      }

      const result = JobCareerMatchResultSchema.parse({
        id: row._id,
        sessionId,
        requestId,
        createdAt: now.toISOString(),
        promptVersion: row.promptVersion,
        inputFingerprint: row.inputFingerprint,
        inputSnapshot: input.inputSnapshot,
        summary: validated.summary,
        items: validated.items,
      });

      await db.jobCareerMatches.updateOne(
        {
          _id: row._id,
          userId,
          sessionId,
          status: "running",
          attemptId,
        },
        {
          $set: {
            status: "completed",
            result,
            attemptId: null,
            expiresAt: null,
            failureCode: null,
            updatedAt: now,
          },
        },
        options,
      );

      return result;
    });
  }

  private async fail(
    userId: string,
    sessionId: string,
    requestId: string,
    attemptId: string,
    failureCode: string,
  ): Promise<void> {
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const db = mongoCollections(tx.db);

      await db.jobCareerMatches.updateOne(
        {
          userId,
          sessionId,
          requestId,
          status: "running",
          attemptId,
        },
        {
          $set: {
            status: "failed",
            result: null,
            attemptId: null,
            expiresAt: null,
            failureCode,
            updatedAt: new Date(),
          },
        },
        { session: tx.session },
      );
    });
  }

  async analyze(
    userId: string,
    sessionId: string,
    input: AnalyzeJobCareerMatch,
  ): Promise<JobCareerMatchResult> {
    const parsed = AnalyzeJobCareerMatchSchema.parse(input);

    const completed = await this.getCompletedRequest(
      userId,
      sessionId,
      parsed.requestId,
    );

    if (completed) return completed;

    const analyzer = this.analyzer;

    if (!analyzer) {
      throw new JobCareerMatchError(
        503,
        "AI is disabled. Configure an AI provider.",
      );
    }

    const analysisInput = await this.inputLoader.load(
      userId,
      sessionId,
    );

    const started = await this.begin(
      userId,
      sessionId,
      parsed.requestId,
      analysisInput,
    );

    if (started.kind === "completed") {
      return started.result;
    }

    try {
      const output = await analyzer.analyze(
        userId,
        analysisInput,
      );

      return await this.complete(
        userId,
        sessionId,
        parsed.requestId,
        started.attemptId,
        analysisInput,
        output,
      );
    } catch (error) {
      const failureCode =
        error instanceof JobCareerMatchError &&
        error.statusCode === 422
          ? "EVIDENCE_VALIDATION_FAILED"
          : "ANALYSIS_FAILED";

      try {
        await this.fail(
          userId,
          sessionId,
          parsed.requestId,
          started.attemptId,
          failureCode,
        );
      } catch {
        // 실패 상태 저장이 불가능하면 만료 후 복구합니다.
        // 원래 분석 오류를 유지합니다.
      }

      throw error;
    }
  }
}