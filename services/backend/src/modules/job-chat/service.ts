import { randomUUID } from "node:crypto";

import {
  CreateJobChatSessionSchema,
  JobChatGenerationSchema,
  JobChatMessageSchema,
  JobChatSessionSchema,
  ListJobChatMessagesQuerySchema,
  ListJobChatSessionsQuerySchema,
  SendJobChatMessageSchema,
  type CreateJobChatSession,
  type ListJobChatMessagesQuery,
  type ListJobChatSessionsQuery,
  type SendJobChatMessage,
} from "@expresso/contracts";
import {
  mongoCollections,
  type JobChatMessageDoc,
  type JobChatSessionDoc,
} from "@expresso/database";
import { z } from "zod";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import {
  JobChatError,
  type BeginJobChatResult,
} from "./public.js";

const CursorSchema = z.strictObject({
  updatedAt: z.iso.datetime(),
  id: z.uuid(),
});

function toSession(doc: JobChatSessionDoc) {
  return JobChatSessionSchema.parse({
    id: doc._id,
    jobPostingId: doc.jobPostingId,
    title: doc.title,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}

function toMessage(doc: JobChatMessageDoc) {
  return JobChatMessageSchema.parse({
    id: doc._id,
    sessionId: doc.sessionId,
    requestId: doc.requestId,
    role: doc.role,
    content: doc.content,
    sequence: doc.sequence,
    createdAt: doc.createdAt.toISOString(),
  });
}

function toGeneration(doc: JobChatSessionDoc) {
  if (doc.generationStatus === "idle") {
    return JobChatGenerationSchema.parse({ status: "idle" });
  }

  // 서버 중단 등으로 만료된 생성 작업은 재시도 가능 상태로 표시합니다.
  const expired =
    doc.generationStatus === "generating" &&
    (!doc.generationExpiresAt ||
      doc.generationExpiresAt.getTime() <= Date.now());

  return JobChatGenerationSchema.parse({
    status: expired ? "failed" : doc.generationStatus,
    requestId: doc.generationRequestId,
  });
}

function decodeCursor(cursor: string) {
  try {
    return CursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new JobChatError(400, "invalid chat cursor");
  }
}

export class JobChatService {
  constructor(readonly context: MongoContext) {}

  async createSession(
    userId: string,
    input: CreateJobChatSession,
    title: string,
  ) {
    const parsed = CreateJobChatSessionSchema.parse(input);
    const safeTitle = title.trim().slice(0, 200) || "새 대화";

    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const db = mongoCollections(tx.db);
      const options = { session: tx.session };

      const existing = await db.jobChatSessions.findOne(
        { userId, createRequestId: parsed.requestId },
        options,
      );

      if (existing) {
        if (existing.jobPostingId !== parsed.jobPostingId) {
          throw new JobChatError(
            409,
            "creation request belongs to another job",
          );
        }

        return toSession(existing);
      }

      const now = new Date();

      const doc: JobChatSessionDoc = {
        _id: randomUUID(),
        userId,
        jobPostingId: parsed.jobPostingId,
        createRequestId: parsed.requestId,
        title: safeTitle,
        createdAt: now,
        updatedAt: now,
        nextSequence: 1,
        generationStatus: "idle",
        generationRequestId: null,
        generationExpiresAt: null,
        generationAttemptId: null,
      };

      await db.jobChatSessions.insertOne(doc, options);
      return toSession(doc);
    });
  }

  async listSessions(
    userId: string,
    query: ListJobChatSessionsQuery,
  ) {
    const input = ListJobChatSessionsQuerySchema.parse(query);
    const db = mongoCollections(this.context.db);
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;

    const filter = cursor
      ? {
          userId,
          $or: [
            { updatedAt: { $lt: new Date(cursor.updatedAt) } },
            {
              updatedAt: new Date(cursor.updatedAt),
              _id: { $lt: cursor.id },
            },
          ],
        }
      : { userId };

    const rows = await db.jobChatSessions
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(input.limit + 1)
      .toArray();

    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);

    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              updatedAt: last.updatedAt.toISOString(),
              id: last._id,
            }),
          ).toString("base64url")
        : null;

    return {
      sessions: page.map(toSession),
      nextCursor,
    };
  }

  async getSession(
    userId: string,
    sessionId: string,
    query: ListJobChatMessagesQuery,
  ) {
    const input = ListJobChatMessagesQuerySchema.parse(query);
    const db = mongoCollections(this.context.db);

    const session = await db.jobChatSessions.findOne({
      _id: sessionId,
      userId,
    });

    if (!session) {
      throw new JobChatError(404, "chat session not found");
    }

    const rows = await db.jobChatMessages
      .find({
        userId,
        sessionId,
        ...(input.beforeSequence === undefined
          ? {}
          : { sequence: { $lt: input.beforeSequence } }),
      })
      .sort({ sequence: -1 })
      .limit(input.limit + 1)
      .toArray();

    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit).reverse();

    return {
      session: toSession(session),
      messages: page.map(toMessage),
      generation: toGeneration(session),
      nextBeforeSequence:
        hasMore ? page[0]!.sequence : null,
    };
  }

  async beginMessage(
    userId: string,
    sessionId: string,
    input: SendJobChatMessage,
    leaseMs: number,
  ): Promise<BeginJobChatResult> {
    const parsed = SendJobChatMessageSchema.parse(input);

    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
      throw new JobChatError(400, "invalid generation lease");
    }

    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const db = mongoCollections(tx.db);
      const options = { session: tx.session };
      const now = new Date();

      const session = await db.jobChatSessions.findOne(
        { _id: sessionId, userId },
        options,
      );

      if (!session) {
        throw new JobChatError(404, "chat session not found");
      }

      const existingUser = await db.jobChatMessages.findOne(
        {
          userId,
          sessionId,
          requestId: parsed.requestId,
          role: "user",
        },
        options,
      );

      if (existingUser && existingUser.content !== parsed.content) {
        throw new JobChatError(
          409,
          "request ID was reused with different content",
        );
      }

      const existingAnswer = await db.jobChatMessages.findOne(
        {
          userId,
          sessionId,
          requestId: parsed.requestId,
          role: "assistant",
        },
        options,
      );

      if (existingUser && existingAnswer) {
        return {
          kind: "completed",
          session: toSession(session),
          userMessage: toMessage(existingUser),
          assistantMessage: toMessage(existingAnswer),
        };
      }

      const generating =
        session.generationStatus === "generating" &&
        session.generationExpiresAt !== null &&
        session.generationExpiresAt > now;

      if (generating) {
        throw new JobChatError(409, "answer generation is in progress");
      }

      // 실패하거나 만료된 질문은 먼저 같은 requestId로 재시도합니다.
      const unfinished =
        session.generationStatus === "failed" ||
        session.generationStatus === "generating";

      if (
        unfinished &&
        session.generationRequestId !== parsed.requestId
      ) {
        throw new JobChatError(
          409,
          "retry the unfinished question first",
        );
      }

      if (
        existingUser &&
        session.generationRequestId !== parsed.requestId
      ) {
        throw new JobChatError(409, "cannot retry an older question");
      }

      let userMessage = existingUser;
      let nextSequence = session.nextSequence;

      if (!userMessage) {
        userMessage = {
          _id: randomUUID(),
          userId,
          sessionId,
          requestId: parsed.requestId,
          role: "user",
          content: parsed.content,
          sequence: nextSequence,
          createdAt: now,
        };

        await db.jobChatMessages.insertOne(userMessage, options);
        nextSequence += 1;
      }

      const attemptId = randomUUID();

      await db.jobChatSessions.updateOne(
        { _id: sessionId, userId },
        {
          $set: {
            nextSequence,
            generationStatus: "generating",
            generationRequestId: parsed.requestId,
            generationAttemptId: attemptId,
            generationExpiresAt: new Date(now.getTime() + leaseMs),
            updatedAt: now,
          },
        },
        options,
      );

      const history = await db.jobChatMessages
        .find({ userId, sessionId }, options)
        .sort({ sequence: -1 })
        .limit(20)
        .toArray();

      return {
        kind: "started",
        attemptId,
        userMessage: toMessage(userMessage),
        messages: history.reverse().map(toMessage),
      };
    });
  }

  async completeMessage(
    userId: string,
    sessionId: string,
    requestId: string,
    attemptId: string,
    answer: string,
  ) {
    const content = z.string().trim().min(1).max(12000).parse(answer);

    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const db = mongoCollections(tx.db);
      const options = { session: tx.session };
      const now = new Date();

      const session = await db.jobChatSessions.findOne(
        { _id: sessionId, userId },
        options,
      );

      if (!session) {
        throw new JobChatError(404, "chat session not found");
      }

      const userMessage = await db.jobChatMessages.findOne(
        { userId, sessionId, requestId, role: "user" },
        options,
      );

      if (!userMessage) {
        throw new JobChatError(409, "question not found");
      }

      const existingAnswer = await db.jobChatMessages.findOne(
        { userId, sessionId, requestId, role: "assistant" },
        options,
      );

      if (existingAnswer) {
        return {
          session: toSession(session),
          userMessage: toMessage(userMessage),
          assistantMessage: toMessage(existingAnswer),
        };
      }

      if (
        session.generationStatus !== "generating" ||
        session.generationRequestId !== requestId ||
        session.generationAttemptId !== attemptId ||
        !session.generationExpiresAt ||
        session.generationExpiresAt <= now
      ) {
        throw new JobChatError(409, "generation attempt expired");
      }

      const assistantMessage: JobChatMessageDoc = {
        _id: randomUUID(),
        userId,
        sessionId,
        requestId,
        role: "assistant",
        content,
        sequence: session.nextSequence,
        createdAt: now,
      };

      await db.jobChatMessages.insertOne(assistantMessage, options);

      const updated: JobChatSessionDoc = {
        ...session,
        nextSequence: session.nextSequence + 1,
        generationStatus: "completed",
        generationRequestId: requestId,
        generationAttemptId: null,
        generationExpiresAt: null,
        updatedAt: now,
      };

      await db.jobChatSessions.updateOne(
        { _id: sessionId, userId },
        {
          $set: {
            nextSequence: updated.nextSequence,
            generationStatus: updated.generationStatus,
            generationRequestId: updated.generationRequestId,
            generationAttemptId: null,
            generationExpiresAt: null,
            updatedAt: now,
          },
        },
        options,
      );

      return {
        session: toSession(updated),
        userMessage: toMessage(userMessage),
        assistantMessage: toMessage(assistantMessage),
      };
    });
  }

  async failMessage(
    userId: string,
    sessionId: string,
    requestId: string,
    attemptId: string,
  ): Promise<void> {
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const db = mongoCollections(tx.db);

      await db.jobChatSessions.updateOne(
        {
          _id: sessionId,
          userId,
          generationStatus: "generating",
          generationRequestId: requestId,
          generationAttemptId: attemptId,
        },
        {
          $set: {
            generationStatus: "failed",
            generationExpiresAt: null,
            generationAttemptId: null,
            updatedAt: new Date(),
          },
        },
        { session: tx.session },
      );
    });
  }
}