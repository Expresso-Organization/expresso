// 실제 모델 실행 결과를 격리된 가상 계정에 저장해 제품 편집 화면을 점검합니다.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PageGenerationManifestSchema } from "../../../packages/contracts/src/index.js";
import { renderStructuredPortfolio } from "../../../packages/portfolio-renderer/dist/index.js";
import { mongoCollections } from "../../../packages/database/dist/index.js";
import { createMongoFixture } from "../../../services/backend/test/support/mongodb.js";
import { MongoIdentityService } from "../../../services/backend/src/modules/identity/index.js";
import { MongoCareerService } from "../../../services/backend/src/modules/career/index.js";
import { MongoMaterialsService } from "../../../services/backend/src/modules/materials/index.js";
import { MongoRecipeService } from "../../../services/backend/src/modules/recipe/index.js";
import { MongoGenerationService } from "../../../services/backend/src/modules/generation/index.js";
import { PageService } from "../../../services/backend/src/modules/page/service.js";

const file = process.argv[2];
if (!file) throw new Error("검증한 실행 기록 경로가 필요합니다.");
const { fictional, specOrigin, contentOrigin, htmlSha256, ...rawManifest } =
  JSON.parse(fs.readFileSync(file, "utf8"));
if (!fictional || specOrigin !== "model")
  throw new Error("모델이 생성한 가상 실행만 사용합니다.");
const manifest = PageGenerationManifestSchema.parse(rawManifest),
  content = manifest.structured!.content;
const fixture = await createMongoFixture("structured-ui");
try {
  const email = `structured-${randomUUID()}@example.com`,
    password = "correct-horse-battery";
  const identity = new MongoIdentityService(fixture.resource),
    user = (
      await identity.signup({
        email,
        password,
        displayName: content.profile.name,
      })
    ).user;
  const db = mongoCollections(fixture.resource.db),
    career = new MongoCareerService(fixture.resource),
    category = (await career.listCategories(user.id)).find(
      (item) => item.key === "experience",
    )!;
  const record = (
    await career.createRecord(user.id, randomUUID(), {
      categoryId: category.id,
      title: "가상 경로 연구",
      bodyMd: "가상 경로를 검토한 자료입니다.",
      properties: {},
    })
  ).record;
  await db.careerRecords.updateOne(
    { _id: record.id },
    { $set: { status: "organized" } },
  );
  const brew = (
    await new MongoMaterialsService(fixture.resource).createFreeBrew(user.id, {
      title: "구조화 편집 검증",
      brief: "가상 경로 연구",
      lengthPreset: "single",
    })
  ).brewId;
  const recipe = await new MongoRecipeService(fixture.resource).generate(
      user.id,
      brew,
      randomUUID(),
    ),
    template = await db.templates.findOne({ isActive: true });
  const generation = new MongoGenerationService(fixture.resource),
    job = await generation.submit(user.id, randomUUID(), {
      recipeId: recipe.id,
      templateId: template!._id,
    });
  const portfolio = (await generation.prepareFreeHtml(job.generationJobId))
    .portfolioId!;
  const rendered = renderStructuredPortfolio(
    manifest.structured!.spec,
    content,
  );
  await new PageService(fixture.resource).generate(user.id, portfolio, {
    async generate() {
      return {
        ...rendered,
        rationale: "실제 모델 출력의 가상 편집 검증",
        ungrounded: [],
        removed: [],
        usage: { model: manifest.model, ...manifest.usage },
        qaReport: { status: "ready", checks: [] },
        manifest,
      };
    },
  });
  fs.writeFileSync(
    "/tmp/expresso-structured-preview.json",
    JSON.stringify({
      email,
      password,
      userId: user.id,
      database: fixture.resource.db.databaseName,
      portfolioId: portfolio,
    }),
  );
  console.log(fixture.resource.db.databaseName, portfolio);
} finally {
  await fixture.resource.close();
}
