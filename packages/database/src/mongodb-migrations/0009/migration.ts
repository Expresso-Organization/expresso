import type { Db, Document } from "mongodb";

import type { MongoMigrationStep } from "../../mongo-migrations.js";

const uuidPattern =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const uuidField = {
  bsonType: "string",
  pattern: uuidPattern,
};

const positiveIntegerField = {
  bsonType: ["int", "long", "double"],
  minimum: 1,
  multipleOf: 1,
};

const sessionValidator: Document = {
  $jsonSchema: {
    bsonType: "object",
    additionalProperties: false,
    required: [
      "_id",
      "userId",
      "jobPostingId",
      "createRequestId",
      "title",
      "createdAt",
      "updatedAt",
      "nextSequence",
      "generationStatus",
      "generationRequestId",
      "generationExpiresAt",
      "generationAttemptId",
    ],
    properties: {
      _id: uuidField,
      userId: uuidField,
      jobPostingId: uuidField,
      createRequestId: uuidField,
      title: {
        bsonType: "string",
        minLength: 1,
        maxLength: 200,
      },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
      nextSequence: positiveIntegerField,
      generationStatus: {
        enum: ["idle", "generating", "completed", "failed"],
      },
      generationRequestId: {
        bsonType: ["string", "null"],
        pattern: uuidPattern,
      },
      generationExpiresAt: {
        bsonType: ["date", "null"],
      },
      generationAttemptId: {
        bsonType: ["string", "null"],
        pattern: uuidPattern,
      },
    },
  },
};

const messageValidator: Document = {
  $and: [
    {
      $jsonSchema: {
        bsonType: "object",
        additionalProperties: false,
        required: [
          "_id",
          "userId",
          "sessionId",
          "requestId",
          "role",
          "content",
          "sequence",
          "createdAt",
        ],
        properties: {
          _id: uuidField,
          userId: uuidField,
          sessionId: uuidField,
          requestId: uuidField,
          role: {
            enum: ["user", "assistant"],
          },
          content: {
            bsonType: "string",
            minLength: 1,
            maxLength: 12000,
          },
          sequence: positiveIntegerField,
          createdAt: {
            bsonType: "date",
          },
        },
      },
    },
    {
      // 사용자 질문은 DB에서도 최대 4,000자로 제한합니다.
      $or: [
        { role: "assistant" },
        {
          role: "user",
          content: {
            $regex: "^[\\s\\S]{1,4000}$",
          },
        },
      ],
    },
  ],
};

// 마이그레이션 재실행 시 기존 컬렉션에도 검증 규칙을 적용합니다.
async function ensureCollection(
  db: Db,
  name: string,
  validator: Document,
): Promise<void> {
  const existing = await db
    .listCollections({ name }, { nameOnly: true })
    .next();

  if (!existing) {
    await db.createCollection(name, {
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
    return;
  }

  await db.command({
    collMod: name,
    validator,
    validationLevel: "strict",
    validationAction: "error",
  });
}

export async function jobChatSteps(): Promise<MongoMigrationStep[]> {
  return [
    {
      id: "job_chat_sessions:create",
      async run(db) {
        await ensureCollection(
          db,
          "job_chat_sessions",
          sessionValidator,
        );

        await db.collection("job_chat_sessions").createIndexes([
          {
            name: "job_chat_sessions_recent",
            key: {
              userId: 1,
              updatedAt: -1,
              _id: -1,
            },
          },
          {
            name: "job_chat_sessions_create_request",
            key: {
              userId: 1,
              createRequestId: 1,
            },
            unique: true,
          },
        ]);
      },
    },
    {
      id: "job_chat_messages:create",
      async run(db) {
        await ensureCollection(
          db,
          "job_chat_messages",
          messageValidator,
        );

        await db.collection("job_chat_messages").createIndexes([
          {
            name: "job_chat_messages_sequence",
            key: {
              userId: 1,
              sessionId: 1,
              sequence: 1,
            },
            unique: true,
          },
          {
            name: "job_chat_messages_request_role",
            key: {
              userId: 1,
              sessionId: 1,
              requestId: 1,
              role: 1,
            },
            unique: true,
          },
        ]);
      },
    },
  ];
}