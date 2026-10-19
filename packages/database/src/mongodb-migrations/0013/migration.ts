import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const id = { bsonType: "string", pattern: UUID, maxLength: 36 };

/**
 * 비밀번호 재설정 · 이메일 인증에 필요한 자리를 연다.
 *
 * - `identity_tokens` — 일회용 토큰. 해시만 저장하고 TTL 인덱스가 만료를 지운다.
 * - `users` — 인증 시각과 약관 동의 기록. 필수로 두지 않는다: 이전 사용자는 셋 다 없고,
 *   서비스는 그것을 "미인증 · 미기록"으로 읽는다. 검증 없이 인증 표시를 붙이지 않는다.
 */
export async function identityEmailAndTermsSteps(): Promise<MongoMigrationStep[]> {
  const tokens = {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "userId", "kind", "tokenHash", "expiresAt", "createdAt"],
      properties: {
        _id: id,
        userId: id,
        kind: { bsonType: "string", enum: ["password_reset", "email_verification"] },
        tokenHash: { bsonType: "string", maxLength: 255 },
        expiresAt: { bsonType: "date" },
        usedAt: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
      },
    },
  };
  return [
    { id: "collection:identity_tokens", async run(db: Db) {
      if (await db.listCollections({ name: "identity_tokens" }, { nameOnly: true }).hasNext()) {
        await db.command({ collMod: "identity_tokens", validator: tokens, validationLevel: "strict", validationAction: "error" });
      } else {
        await db.createCollection("identity_tokens", { validator: tokens, validationLevel: "strict", validationAction: "error" });
      }
      await db.collection("identity_tokens").createIndexes([
        { name: "identity_token_hash_key", key: { tokenHash: 1 }, unique: true },
        { name: "identity_token_user_kind_created", key: { userId: 1, kind: 1, createdAt: -1 } },
        { name: "identity_token_expiry", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ]);
    } },
    { id: "users:email_verification_and_terms", async run(db: Db) {
      const info = await db.listCollections({ name: "users" }, { nameOnly: false }).next() as Document | null;
      if (!info) throw new Error("users collection is missing");
      const validator = structuredClone((info.options.validator ?? {}) as Document);
      const properties = (validator.$jsonSchema as Document).properties as Document;
      Object.assign(properties, {
        emailVerifiedAt: { bsonType: ["date", "null"] },
        termsAcceptedAt: { bsonType: ["date", "null"] },
        termsVersion: { bsonType: ["int", "long", "double", "null"], minimum: 1, multipleOf: 1 },
      });
      await db.command({ collMod: "users", validator, validationLevel: "strict", validationAction: "error" });
    } },
  ];
}
