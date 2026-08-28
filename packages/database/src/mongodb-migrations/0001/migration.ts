import { readFile } from "node:fs/promises";
import { BSON } from "mongodb";
import type { Document, IndexDescription } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

interface Spec { name: string; validator: Document; indexes: IndexDescription[] }
interface Seed { collection: string; documents: Array<Document & { _id: string }> }

/** 이 파일과 JSON 입력은 불변입니다. 이후 변경은 새 버전의 마이그레이션으로 추가합니다. */
export async function initialMigrationSteps(): Promise<MongoMigrationStep[]> {
  const specs: Spec[] = JSON.parse(await readFile(new URL("./schema.json", import.meta.url), "utf8"));
  const seeds = BSON.EJSON.parse(await readFile(new URL("./seeds.json", import.meta.url), "utf8"), { relaxed: true }) as Seed[];
  return [
    ...specs.map((spec): MongoMigrationStep => ({
      id: `collection:${spec.name}`,
      async run(db) {
        const existing = await db.listCollections({ name: spec.name }, { nameOnly: true }).hasNext();
        if (existing) {
          await db.command({ collMod: spec.name, validator: spec.validator, validationLevel: "strict", validationAction: "error" });
        } else {
          await db.createCollection(spec.name, { validator: spec.validator, validationLevel: "strict", validationAction: "error" });
        }
        // createIndexes는 동일한 명세로 다시 호출할 수 있어 중간 실패 뒤에도 재실행 가능합니다.
        if (spec.indexes.length) await db.collection(spec.name).createIndexes(spec.indexes);
      },
    })),
    ...seeds.map((seed): MongoMigrationStep => ({
      id: `seed:${seed.collection}`,
      async run(db) {
        for (const document of seed.documents) {
          await db.collection<Document & { _id: string }>(seed.collection).updateOne(
            { _id: document._id }, { $setOnInsert: document }, { upsert: true },
          );
        }
      },
    })),
  ];
}
