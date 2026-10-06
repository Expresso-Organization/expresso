import type { Document } from "mongodb";

import type { MongoMigrationStep } from "../../mongo-migrations.js";

const uuidPattern =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const uuidField = {
  bsonType: "string",
  pattern: uuidPattern,
};

const validator: Document = {
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
          "status",
          "inputFingerprint",
          "promptVersion",
          "attemptId",
          "expiresAt",
          "result",
          "failureCode",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          _id: uuidField,
          userId: uuidField,
          sessionId: uuidField,
          requestId: uuidField,
          status: {
            enum: ["running", "completed", "failed"],
          },
          inputFingerprint: {
            bsonType: "string",
            pattern: "^[a-f0-9]{64}$",
          },
          promptVersion: {
            bsonType: ["int", "long", "double"],
            minimum: 1,
            multipleOf: 1,
          },
          attemptId: {
            bsonType: ["string", "null"],
            pattern: uuidPattern,
          },
          expiresAt: {
            bsonType: ["date", "null"],
          },
          result: {
            bsonType: ["object", "null"],
          },
          failureCode: {
            bsonType: ["string", "null"],
            maxLength: 100,
          },
          createdAt: {
            bsonType: "date",
          },
          updatedAt: {
            bsonType: "date",
          },
        },
      },
    },
    {
      // 상태와 저장 내용의 정합성을 확인합니다.
      $or: [
        {
          status: "running",
          attemptId: { $type: "string" },
          expiresAt: { $type: "date" },
          result: { $type: "null" },
          failureCode: { $type: "null" },
        },
        {
          status: "completed",
          attemptId: { $type: "null" },
          expiresAt: { $type: "null" },
          result: { $type: "object" },
          failureCode: { $type: "null" },
        },
        {
          status: "failed",
          attemptId: { $type: "null" },
          expiresAt: { $type: "null" },
          result: { $type: "null" },
          failureCode: { $type: "string" },
        },
      ],
    },
  ],
};

export async function jobCareerMatchSteps(): Promise<
  MongoMigrationStep[]
> {
  return [
    {
      id: "job_career_matches:create",
      async run(db) {
        const existing = await db
          .listCollections(
            { name: "job_career_matches" },
            { nameOnly: true },
          )
          .next();

        if (!existing) {
          await db.createCollection("job_career_matches", {
            validator,
            validationLevel: "strict",
            validationAction: "error",
          });
        } else {
          await db.command({
            collMod: "job_career_matches",
            validator,
            validationLevel: "strict",
            validationAction: "error",
          });
        }

        await db.collection("job_career_matches").createIndexes([
          {
            name: "job_career_match_request",
            key: {
              userId: 1,
              sessionId: 1,
              requestId: 1,
            },
            unique: true,
          },
          {
            name: "job_career_match_latest",
            key: {
              userId: 1,
              sessionId: 1,
              status: 1,
              createdAt: -1,
              _id: -1,
            },
          },
          {
            // 대화방마다 실행 중인 분석은 하나만 허용합니다.
            name: "job_career_match_running",
            key: {
              userId: 1,
              sessionId: 1,
            },
            unique: true,
            partialFilterExpression: {
              status: "running",
            },
          },
        ]);
      },
    },
  ];
}