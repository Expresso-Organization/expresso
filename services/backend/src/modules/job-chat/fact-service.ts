import { randomUUID } from "node:crypto";

import {
  ApproveChatFactSchema,
  ChatFactSchema,
  CreateChatFactSchema,
  type ApproveChatFact,
  type CreateChatFact,
} from "@expresso/contracts";

import {
  mongoCollections,
  type CareerRecordDoc,
} from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import {
  inTransaction,
} from "../../platform/mongo-transaction.js";
import {
  addMongoOutboxEvent,
} from "../../platform/mongo-outbox.js";

import type { AiClient } from "../../platform/ai/client.js";
import { requireActiveUser } from "../identity/index.js";
import type { ConsentApi } from "../consent/index.js";

import { AiRecordCleaner } from "../career/record-cleaner.js";
import {
  requireCareerCategory,
} from "../career/mongo-categories.js";
import {
  validateCareerProperties,
} from "../career/properties.js";

import { JobChatError } from "./public.js";
import type { ClientSession, Db } from "mongodb";

interface ChatFactDoc {
  _id: string;
  userId: string;
  sessionId: string;
  requestId: string;
  messageIds: string[];

  status: "pending" | "approved" | "rejected";

  title: string;
  bodyMd: string;

  sources: {
    messageId: string;
    quote: string;
  }[];

  approvedTitle: string | null;
  approvedBodyMd: string | null;
  categoryId: string | null;
  recordId: string | null;

  createdAt: Date;
  decidedAt: Date | null;
}

function toFact(doc: ChatFactDoc) {
  return ChatFactSchema.parse({
    id: doc._id,
    sessionId: doc.sessionId,
    requestId: doc.requestId,
    status: doc.status,
    title: doc.title,
    bodyMd: doc.bodyMd,
    sources: doc.sources,
    approvedTitle: doc.approvedTitle,
    approvedBodyMd: doc.approvedBodyMd,
    categoryId: doc.categoryId,
    recordId: doc.recordId,
    createdAt: doc.createdAt.toISOString(),
    decidedAt: doc.decidedAt?.toISOString() ?? null,
  });
}

export class JobChatFactService {
  constructor(
    readonly context: MongoContext,
    readonly ai: AiClient | null,
    readonly consentService: ConsentApi,
  ) {}

  private collection(context = this.context) {
    return context.db.collection<ChatFactDoc>(
      "job_chat_facts",
    );
  }

  private async requireSession(
    userId: string,
    sessionId: string,
    database: Db = this.context.db,
    options: { session?: ClientSession } = {},
  ) {
    const db = mongoCollections(database);

    const legacy = await db.jobChatSessions.findOne(
      { _id: sessionId, userId },
      options,
    );

    if (legacy) return;

    const agent = await db.agentConversations.findOne(
      { _id: sessionId, userId },
      options,
    );

    if (!agent) {
      throw new JobChatError(
        404,
        "chat session not found",
      );
    }
  }

  private async readUserAnswers(
    userId: string,
    sessionId: string,
    messageIds: string[],
  ): Promise<Array<{ _id: string; content: string }>> {
    const db = mongoCollections(this.context.db);

    const legacy = await db.jobChatSessions.findOne({
      _id: sessionId,
      userId,
    });

    if (legacy) {
      const messages = await db.jobChatMessages
        .find({
          userId,
          sessionId,
          _id: { $in: messageIds },
          role: "user",
        })
        .sort({ sequence: 1 })
        .toArray();

      return messages.map((message) => ({
        _id: message._id,
        content: message.content,
      }));
    }

    const conversation = await db.agentConversations.findOne({
      _id: sessionId,
      userId,
    });

    if (!conversation) {
      throw new JobChatError(
        404,
        "chat session not found",
      );
    }

    const selected = new Set(messageIds);

    // 저장된 대화의 순서대로 사용자 발언만 추출합니다.
    return conversation.messages
      .filter(
        (message) =>
          message.role === "user" &&
          selected.has(message.id),
      )
      .map((message) => ({
        _id: message.id,
        content: message.text,
      }));
  }

  async list(userId: string, sessionId: string) {
    await this.requireSession(userId, sessionId);

    const rows = await this.collection()
      .find({ userId, sessionId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();

    return rows.map(toFact);
  }

  async create(
    userId: string,
    sessionId: string,
    inputValue: CreateChatFact,
  ) {
    const input = CreateChatFactSchema.parse(inputValue);

    // 배열 순서가 달라도 같은 요청으로 취급
    const messageIds = [...input.messageIds].sort();

    await this.requireSession(userId, sessionId);

    const filter = {
      userId,
      sessionId,
      requestId: input.requestId,
    };

    const existing = await this.collection().findOne(filter);

    if (existing) {
      if (
        JSON.stringify(existing.messageIds) !==
        JSON.stringify(messageIds)
      ) {
        throw new JobChatError(
          409,
          "request ID was reused with different messages",
        );
      }

      return toFact(existing);
    }

    if (!this.ai) {
      throw new JobChatError(503, "AI is disabled");
    }

    await this.consentService.require(
      userId,
      "record_cleanup",
    );

    const messages = await this.readUserAnswers(
      userId,
      sessionId,
      messageIds,
    );

    if (
      messages.length !== messageIds.length ||
      messages.some(
        (message) =>
          message.content ===
          "내 경력에서 보완할 경험을 질문해줘.",
      )
    ) {
      throw new JobChatError(
        400,
        "select saved user answers",
      );
    }

    const sources = messages.map((message) => ({
      messageId: message._id,
      quote: message.content,
    }));

    const transcript = sources
      .map((source) => source.quote)
      .join("\n\n");

    // AI 메시지와 기존 경력은 정리 근거에 넣지 않는다.
    const cleaned = await new AiRecordCleaner(
      this.ai,
    ).clean({
      question: [
        "선택한 사용자 발언에서 실제로 수행한 경험을 정리하세요.",
        "발언에 없는 역할, 기술, 성과를 추가하지 마세요.",
        "팀원이 한 일을 사용자가 한 일로 바꾸지 마세요.",
      ].join("\n"),
      transcript,
      existing: null,
    });

    const sections: [string, string | null][] = [
      ["상황", cleaned.situation],
      ["역할", cleaned.task],
      ["행동", cleaned.action],
      ["결과", cleaned.result],
    ];

    const bodyMd = sections
      .filter(([, value]) => value !== null)
      .map(([label, value]) => `## ${label}\n${value}`)
      .join("\n\n") || transcript;

    const safeDraft = ApproveChatFactSchema.parse({
      categoryId: randomUUID(), // 길이 등 초안 형식 검증용
      title: cleaned.title,
      bodyMd,
    });

    const doc: ChatFactDoc = {
      _id: randomUUID(),
      userId,
      sessionId,
      requestId: input.requestId,
      messageIds,
      status: "pending",
      title: safeDraft.title,
      bodyMd: safeDraft.bodyMd,
      sources,
      approvedTitle: null,
      approvedBodyMd: null,
      categoryId: null,
      recordId: null,
      createdAt: new Date(),
      decidedAt: null,
    };

    // AI 호출은 트랜잭션 밖에서 수행한다.
    try {
      const saved = await inTransaction(
        this.context,
        async (tx) => {
          await requireActiveUser(tx, userId);

          await this.requireSession(
            userId,
            sessionId,
            tx.db,
            { session: tx.session },
          );

          const collection = this.collection(tx);
          const previous = await collection.findOne(
            filter,
            { session: tx.session },
          );

          if (previous) return previous;

          await collection.insertOne(
            doc,
            { session: tx.session },
          );

          return doc;
        },
      );

      if (
        JSON.stringify(saved.messageIds) !==
        JSON.stringify(messageIds)
      ) {
        throw new JobChatError(
          409,
          "request ID was reused with different messages",
        );
      }

      return toFact(saved);
    } catch (error) {
      // 같은 요청의 동시 저장으로 발생한 중복 키 오류 처리
      if ((error as { code?: number })?.code === 11000) {
        const saved = await this.collection().findOne(filter);

        if (
          saved &&
          JSON.stringify(saved.messageIds) ===
            JSON.stringify(messageIds)
        ) {
          return toFact(saved);
        }

        throw new JobChatError(
          409,
          "conflicting fact request",
        );
      }

      throw error;
    }
  }

  async approve(
    userId: string,
    sessionId: string,
    factId: string,
    inputValue: ApproveChatFact,
  ) {
    const input = ApproveChatFactSchema.parse(inputValue);

    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      const collection = this.collection(tx);
      const db = mongoCollections(tx.db);
      const mongoOptions = { session: tx.session };

      await this.requireSession(
        userId,
        sessionId,
        tx.db,
        mongoOptions,
      );

      const fact = await collection.findOne(
        { _id: factId, userId, sessionId },
        mongoOptions,
      );

      if (!fact) {
        throw new JobChatError(404, "fact not found");
      }

      // 같은 승인 내용이면 저장된 결과 반환
      if (fact.status === "approved") {
        if (
          fact.categoryId !== input.categoryId ||
          fact.approvedTitle !== input.title ||
          fact.approvedBodyMd !== input.bodyMd
        ) {
          throw new JobChatError(
            409,
            "fact was approved with different content",
          );
        }

        return toFact(fact);
      }

      if (fact.status !== "pending") {
        throw new JobChatError(
          409,
          "rejected fact cannot be approved",
        );
      }

      const category = await requireCareerCategory(
        tx,
        userId,
        input.categoryId,
        tx.session,
      );

      // 기존 카테고리 검증 사용
      validateCareerProperties(
        category.propertySchema,
        {},
        category.propertySchemaV2,
      );

      const now = new Date();
      const recordId = randomUUID();

      const record: CareerRecordDoc = {
        _id: recordId,
        userId,
        categoryId: input.categoryId,
        title: input.title,
        bodyMd: input.bodyMd,
        properties: {},

        // 사용자 확인과 외부 검증을 구분
        status: "organized",
        origin: "interview",

        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        purgeAfter: null,
      };

      await db.careerRecords.insertOne(
        record,
        mongoOptions,
      );

      // 기존 경력 생성과 동일하게 계산 속성 재계산 예약
      const definitions =
        category.propertySchemaV2?.filter(
          (definition) => definition.deletedAt === null,
        ) ?? [];

      const changedPropertyIds = definitions
        .filter(
          (definition) =>
            definition.type === "formula" ||
            definition.type === "rollup" ||
            definition.type === "title",
        )
        .map((definition) => definition.id);

      if (changedPropertyIds.length > 0) {
        await addMongoOutboxEvent(tx, {
          userId,
          topic: "career.computation",
          idempotencyKey:
            `career-record-create:${recordId}:v1`,
          payload: {
            userId,
            recordId,
            changedPropertyIds,
            sourceRecordVersion: 1,
            sourcePropertyVersions: Object.fromEntries(
              definitions
                .filter((definition) =>
                  changedPropertyIds.includes(
                    definition.id,
                  ),
                )
                .map((definition) => [
                  definition.id,
                  definition.version,
                ]),
            ),
          },
        });
      }

      const approved: ChatFactDoc = {
        ...fact,
        status: "approved",
        approvedTitle: input.title,
        approvedBodyMd: input.bodyMd,
        categoryId: input.categoryId,
        recordId,
        decidedAt: now,
      };

      await collection.updateOne(
        {
          _id: factId,
          userId,
          sessionId,
          status: "pending",
        },
        {
          $set: {
            status: approved.status,
            approvedTitle: approved.approvedTitle,
            approvedBodyMd: approved.approvedBodyMd,
            categoryId: approved.categoryId,
            recordId: approved.recordId,
            decidedAt: approved.decidedAt,
          },
        },
        mongoOptions,
      );

      return toFact(approved);
    });
  }

  async reject(
    userId: string,
    sessionId: string,
    factId: string,
  ) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);

      await this.requireSession(
        userId,
        sessionId,
        tx.db,
        { session: tx.session },
      );

      const collection = this.collection(tx);

      const fact = await collection.findOne(
        { _id: factId, userId, sessionId },
        { session: tx.session },
      );

      if (!fact) {
        throw new JobChatError(404, "fact not found");
      }

      if (fact.status === "rejected") {
        return toFact(fact);
      }

      if (fact.status === "approved") {
        throw new JobChatError(
          409,
          "approved fact cannot be rejected",
        );
      }

      const decidedAt = new Date();

      await collection.updateOne(
        {
          _id: factId,
          userId,
          sessionId,
          status: "pending",
        },
        {
          $set: {
            status: "rejected",
            decidedAt,
          },
        },
        { session: tx.session },
      );

      return toFact({
        ...fact,
        status: "rejected",
        decidedAt,
      });
    });
  }
}