import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 세션 만료를 활동 기준으로 연장하기 위한 두 필드를 validator에 연다.
 *
 * 필수로 두지 않는다 — 이미 발급된 세션에는 두 필드가 없고, 그 세션은 배포 뒤에도
 * 그대로 유효해야 한다. 값이 없는 문서는 서비스가 유지 모드 · `createdAt + 90일`로 읽는다.
 */
export async function identitySessionSlidingExpirySteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "identity_sessions:sliding_expiry_fields", async run(db: Db) {
    const info = await db.listCollections({ name: "identity_sessions" }, { nameOnly: false }).next() as Document | null;
    if (!info) throw new Error("identity_sessions collection is missing");
    const validator = structuredClone((info.options.validator ?? {}) as Document);
    const properties = (validator.$jsonSchema as Document).properties as Document;
    Object.assign(properties, {
      idleTtlMs: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 },
      absoluteExpiresAt: { bsonType: "date" },
    });
    await db.command({ collMod: "identity_sessions", validator, validationLevel: "strict", validationAction: "error" });
  } }];
}
