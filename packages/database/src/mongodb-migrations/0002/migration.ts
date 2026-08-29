import type { Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/** 0001의 문자열 enum 변환 오류를 고쳐 SQL의 -1·1 정수 제약을 복원합니다. */
export async function generationLedgerConstraintSteps(): Promise<MongoMigrationStep[]> {
  return [{
    id: "generation_usage_ledger:amount_constraint",
    async run(db) {
      const info = await db.listCollections({ name: "generation_usage_ledger" }, { nameOnly: false }).next() as Document | null;
      if (!info) throw new Error("generation_usage_ledger collection is missing");
      const validator = structuredClone((info.options.validator ?? {}) as Document);
      const schema = validator["$jsonSchema"] as Document | undefined;
      const properties = schema?.["properties"] as Document | undefined;
      if (!properties) throw new Error("generation_usage_ledger validator is incomplete");
      properties["amount"] = { bsonType: ["int", "long", "double"], multipleOf: 1, enum: [-1, 1] };
      await db.command({ collMod: "generation_usage_ledger", validator, validationLevel: "strict", validationAction: "error" });
    },
  }];
}
