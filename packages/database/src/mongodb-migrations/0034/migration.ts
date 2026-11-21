import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 디자인을 정하는 대화의 자리를 연다.
 *
 * - `design_chats` — 제작(brew) 하나에 대화 하나. 주고받은 말, 그린 첫 화면(소독한 마크업 · CSS), 고른 첫 화면,
 *   답을 만드는 실행의 상태를 한 문서에 둔다. 에이전트 대화(`agent_conversations`, 0009)와 같은 방식으로
 *   `version`을 올리고 `heartbeatAt`으로 끊긴 실행을 가린다.
 *
 * 번호 0034: 0033까지는 main이 쓴다(2026-11-20 main을 합치며 0033에서 다시 매김).
 */
export async function designChatSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "design_chats:create", async run(db) {
    const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "brewId", "head", "messages", "snippets", "selectedSnippetId", "run", "version", "createdAt", "updatedAt", "heartbeatAt"], properties: {
      _id: { bsonType: "string" }, userId: { bsonType: "string" }, brewId: { bsonType: "string" },
      head: { bsonType: ["object", "null"] }, messages: { bsonType: "array" }, snippets: { bsonType: "array" },
      selectedSnippetId: { bsonType: ["string", "null"] }, run: { bsonType: ["object", "null"] },
      version: { bsonType: ["int", "long", "double"], minimum: 0 },
      createdAt: { bsonType: "string" }, updatedAt: { bsonType: "string" }, heartbeatAt: { bsonType: "date" },
    } } };
    if (await db.listCollections({ name: "design_chats" }).hasNext()) await db.command({ collMod: "design_chats", validator });
    else await db.createCollection("design_chats", { validator });
    await db.collection("design_chats").createIndex({ userId: 1, brewId: 1 }, { unique: true, name: "design_chat_owner_brew" });
  } }];
}
