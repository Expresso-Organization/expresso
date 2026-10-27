import type { Db } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 공개 주소의 주인을 배포 행에서 포트폴리오로 옮긴다.
 *
 * 배포는 버전마다 행을 쌓는다. 그런데 `deployments.subdomain`이 전역 unique라서 같은 주소로 두 번째 배포를 넣지 못했다
 * (409 "slug is already reserved"). 주소는 포트폴리오의 속성이므로 `portfolios.publishedSlug`가 unique를 지고,
 * 배포 행의 주소는 일반 인덱스로 둔다.
 *
 * 순서가 중요하다. 주소를 채우고 포트폴리오 unique 인덱스를 만든 뒤에 배포 unique 인덱스를 지운다. 그 사이에 다른
 * 포트폴리오가 같은 주소를 잡을 틈이 없다. 각 단계는 다시 돌려도 결과가 같다.
 */
export async function publishingSlugOwnershipSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "portfolios:published_slug_backfill", async run(db: Db) {
      const portfolios = db.collection("portfolios");
      const deployments = db.collection("deployments");
      const rows = await portfolios.find({ currentDeploymentId: { $type: "string" } }, { projection: { _id: 1, currentDeploymentId: 1 } }).toArray();
      const seen = new Map<string, string>();
      for (const row of rows) {
        const deployment = await deployments.findOne({ _id: row.currentDeploymentId as never }, { projection: { subdomain: 1 } });
        const slug = typeof deployment?.subdomain === "string" ? deployment.subdomain : null;
        if (!slug) continue;
        const owner = seen.get(slug);
        if (owner && owner !== String(row._id)) throw new Error(`두 포트폴리오가 같은 주소를 씁니다: ${slug}`);
        seen.set(slug, String(row._id));
        await portfolios.updateOne({ _id: row._id }, { $set: { publishedSlug: slug } });
      }
    } },
    { id: "portfolios:published_slug_key", async run(db: Db) {
      await db.collection("portfolios").createIndex(
        { publishedSlug: 1 },
        { name: "portfolio_published_slug_key", unique: true, partialFilterExpression: { publishedSlug: { $type: "string" } } },
      );
    } },
    { id: "deployments:subdomain_not_unique", async run(db: Db) {
      const deployments = db.collection("deployments");
      const indexes = await deployments.indexes();
      if (indexes.some((index) => index.name === "deployment_subdomain_key")) await deployments.dropIndex("deployment_subdomain_key");
      await deployments.createIndex({ subdomain: 1, version: -1 }, { name: "deployment_subdomain_idx" });
    } },
  ];
}
