import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const id = { bsonType: "string", pattern: UUID, maxLength: 36 };

/** 0024에서 쓰는 관리 동작. 서비스의 `AdminAuditAction`과 같은 목록이다. */
export const ADMIN_AUDIT_ACTIONS = [
  "admin.grant", "admin.revoke",
  "dummy.create", "dummy.refill", "dummy.delete",
  "impersonation.start", "impersonation.end",
] as const;

async function extend(db: Db, name: string, properties: Document) {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  const validator = structuredClone((info.options.validator ?? {}) as Document);
  Object.assign((validator.$jsonSchema as Document).properties as Document, properties);
  await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
}

/**
 * 관리자 권한과 더미 계정, 대신 로그인을 담을 자리를 연다.
 *
 * - `users.role` — 없으면 일반 사용자로 읽는다. 관리자 지정은 백엔드 CLI만 한다.
 * - `users.dummyKey` — 저장소의 가상 인물 원본 키. 있는 계정만 대신 로그인할 수 있다.
 * - `identity_sessions.actingAsUserId` — 관리자 본인 세션이 지금 보고 있는 더미 계정.
 *   새 토큰을 만들지 않으므로 쿠키는 그대로다.
 * - `admin_audit_events` — 누가 언제 어떤 관리 동작을 했는가. 더미 계정을 지워도 남는다.
 *
 * 번호 0024: 0022는 main(요금제 크레딧)이, 0023은 열린 PR #133과 다듬기 화면 세션이 쓴다.
 * 0014–0016 · 0018–0019도 열린 PR이 쓴다(2026-10-28 확인).
 */
export async function adminDummyAccountSteps(): Promise<MongoMigrationStep[]> {
  const audit = {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "actorUserId", "action", "at"],
      properties: {
        _id: id,
        actorUserId: { ...id, bsonType: ["string", "null"] },
        action: { bsonType: "string", enum: [...ADMIN_AUDIT_ACTIONS] },
        targetUserId: { ...id, bsonType: ["string", "null"] },
        dummyKey: { bsonType: ["string", "null"], maxLength: 64 },
        at: { bsonType: "date" },
      },
    },
  };
  return [
    { id: "users:role_and_dummy_key", async run(db: Db) {
      await extend(db, "users", {
        role: { bsonType: "string", enum: ["user", "admin"] },
        dummyKey: { bsonType: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" },
      });
      await db.collection("users").createIndex({ dummyKey: 1 }, { name: "users_dummy_key", unique: true, partialFilterExpression: { dummyKey: { $type: "string" } } });
    } },
    { id: "identity_sessions:acting_as", async run(db: Db) {
      await extend(db, "identity_sessions", {
        actingAsUserId: { ...id, bsonType: ["string", "null"] },
        actingSince: { bsonType: ["date", "null"] },
      });
    } },
    { id: "collection:admin_audit_events", async run(db: Db) {
      if (await db.listCollections({ name: "admin_audit_events" }, { nameOnly: true }).hasNext()) {
        await db.command({ collMod: "admin_audit_events", validator: audit, validationLevel: "strict", validationAction: "error" });
      } else {
        await db.createCollection("admin_audit_events", { validator: audit, validationLevel: "strict", validationAction: "error" });
      }
      await db.collection("admin_audit_events").createIndexes([
        { name: "admin_audit_at", key: { at: -1 } },
        { name: "admin_audit_dummy_at", key: { dummyKey: 1, action: 1, at: -1 } },
      ]);
    } },
  ];
}
