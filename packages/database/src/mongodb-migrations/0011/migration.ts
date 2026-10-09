import type { MongoMigrationStep } from "../../mongo-migrations.js";

export async function jobChatFactSteps(): Promise<
  MongoMigrationStep[]
> {
  return [
    {
      id: "job_chat_facts:create",
      async run(db) {
        const exists = await db.listCollections(
          { name: "job_chat_facts" },
          { nameOnly: true },
        ).hasNext();

        if (!exists) {
          await db.createCollection("job_chat_facts", {
            validator: {
              $jsonSchema: {
                bsonType: "object",
                required: [
                  "_id",
                  "userId",
                  "sessionId",
                  "requestId",
                  "messageIds",
                  "status",
                  "title",
                  "bodyMd",
                  "sources",
                  "createdAt",
                ],
                properties: {
                  _id: { bsonType: "string" },
                  userId: { bsonType: "string" },
                  sessionId: { bsonType: "string" },
                  requestId: { bsonType: "string" },
                  messageIds: {
                    bsonType: "array",
                    minItems: 1,
                    maxItems: 10,
                    items: { bsonType: "string" },
                  },
                  status: {
                    enum: ["pending", "approved", "rejected"],
                  },
                  title: { bsonType: "string" },
                  bodyMd: { bsonType: "string" },
                  sources: {
                    bsonType: "array",
                    minItems: 1,
                    maxItems: 10,
                  },
                  createdAt: { bsonType: "date" },
                  decidedAt: {
                    bsonType: ["date", "null"],
                  },
                },
              },
            },
          });
        }

        await db.collection("job_chat_facts").createIndexes([
          {
            name: "chat_fact_request",
            key: {
              userId: 1,
              sessionId: 1,
              requestId: 1,
            },
            unique: true,
          },
          {
            name: "chat_fact_list",
            key: {
              userId: 1,
              sessionId: 1,
              createdAt: -1,
              _id: -1,
            },
          },
        ]);
      },
    },
  ];
}