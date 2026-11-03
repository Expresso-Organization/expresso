import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 공개 주소를 배포가 아니라 포트폴리오가 가진다.
 *
 * 지금까지는 배포마다 `deployments.subdomain`에 주소를 적고 그 칸이 전역 unique였다.
 * 그래서 같은 포트폴리오도 같은 주소로 두 번째 배포를 할 수 없었다. 주소는
 * `portfolios.publicSlug`로 옮기고, `deployments.subdomain`은 그 판을 배포할 때의 주소를
 * 남기는 기록이 된다.
 *
 * 단계마다 다시 돌려도 같은 결과가 나온다. 값을 다 채운 뒤에 unique 인덱스를 만든다.
 * 0021 · 0022는 main이 쓰고 있다(2026-10-28 확인).
 */
async function validatorOf(db: Db, name: string) {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  return structuredClone((info.options.validator ?? {}) as Document);
}

async function hasIndex(db: Db, collection: string, name: string) {
  return (await db.collection(collection).listIndexes().toArray()).some((index) => index.name === name);
}

export async function portfolioPublicSlugSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "portfolios:public_slug_field", async run(db: Db) {
      const validator = await validatorOf(db, "portfolios");
      Object.assign((validator.$jsonSchema as Document).properties as Document, {
        publicSlug: { bsonType: ["string", "null"], minLength: 3, maxLength: 63, pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$" },
      });
      await db.command({ collMod: "portfolios", validator, validationLevel: "strict", validationAction: "error" });
    } },
    { id: "portfolios:public_slug_backfill", async run(db: Db) {
      // 지금까지 주소는 전역 unique였으므로 현재 배포의 주소를 옮겨도 겹치지 않는다.
      const portfolios = db.collection("portfolios");
      const rows = await portfolios.find({ currentDeploymentId: { $type: "string" }, publicSlug: { $exists: false } }, { projection: { currentDeploymentId: 1 } }).toArray();
      for (const row of rows) {
        const deployment = await db.collection("deployments").findOne({ _id: row.currentDeploymentId }, { projection: { subdomain: 1 } });
        if (deployment) await portfolios.updateOne({ _id: row._id }, { $set: { publicSlug: deployment.subdomain } });
      }
    } },
    { id: "portfolios:public_slug_key", async run(db: Db) {
      await db.collection("portfolios").createIndex(
        { publicSlug: 1 },
        { name: "portfolio_public_slug_key", unique: true, partialFilterExpression: { publicSlug: { $type: "string" } } },
      );
    } },
    { id: "deployments:subdomain_history", async run(db: Db) {
      // 같은 키에 unique와 일반 인덱스를 함께 둘 수 없어 먼저 지운다.
      if (await hasIndex(db, "deployments", "deployment_subdomain_key")) await db.collection("deployments").dropIndex("deployment_subdomain_key");
      await db.collection("deployments").createIndex({ subdomain: 1 }, { name: "deployment_subdomain_idx" });
    } },
  ];
}
