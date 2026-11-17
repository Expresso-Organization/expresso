// 실험 입력을 만듭니다. DB 복사본의 가상 인물로 제품과 같은 생성 문맥(PageGenerationContext)을 조립해 JSON으로 저장합니다.
//
// 문맥은 `PageService.generate`에 문맥만 받아 두고 예외를 던지는 생성기를 넘겨 얻습니다. 지면은 저장되지 않습니다.
// 레시피가 없는 인물은 자유 입력 브루와 AI 레시피를 새로 만듭니다(실제 모델 호출, 인물당 한 번).
//
//   node --env-file=services/backend/.env --import ./services/backend/node_modules/tsx/dist/loader.mjs \
//     scripts/library/renderer/free-lab/capture.ts --run free-lab-2026-11-15
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mongoCollections } from "../../../../packages/database/dist/index.js";
import { createMongoResource } from "../../../../services/backend/src/platform/mongodb.js";
import { ClaudeCodeAiClient } from "../../../../services/backend/src/platform/ai/claude-code.js";
import { MongoMaterialsService } from "../../../../services/backend/src/modules/materials/index.js";
import { MongoRecipeService } from "../../../../services/backend/src/modules/recipe/index.js";
import { AiRecipePlanner } from "../../../../services/backend/src/modules/recipe/planner.js";
import { MongoGenerationService } from "../../../../services/backend/src/modules/generation/index.js";
import { PageService } from "../../../../services/backend/src/modules/page/service.js";
import type { PageGenerationContext, PageGenerator } from "../../../../services/backend/src/modules/page/generator.js";
import { catalogEntries } from "../../../../services/backend/src/modules/design-systems/catalog.js";

/** 공유 DB에 쓰지 않도록 복사본 이름을 고정합니다. */
const LAB_DATABASE = "expresso_free_lab";
const PERSONAS = [
  { key: "yun", email: /^dev01@/, title: "프론트엔드 개발자 윤하린 포트폴리오", designs: ["clarity", "refero-linear-midnight", "editorial"] },
  { key: "moon", email: /^dummy-data-analyst@/, title: "데이터 분석가 문가령 포트폴리오", designs: ["clarity"] },
  { key: "bae", email: /^dummy-ml-research@/, title: "ML 리서치 엔지니어 배준호 포트폴리오", designs: ["clarity"] },
] as const;

const run = process.argv[process.argv.indexOf("--run") + 1];
if (!run || !/^[a-zA-Z0-9-]+$/.test(run)) throw new Error("실행 식별자가 필요합니다: --run <이름>");
const url = process.env.MONGODB_URL;
if (!url || process.env.MONGODB_DATABASE !== LAB_DATABASE) throw new Error(`MONGODB_DATABASE가 ${LAB_DATABASE}여야 합니다. 공유 DB에는 쓰지 않습니다.`);
const out = path.join(process.cwd(), "docs/library/previews/portfolio/runs", run, "inputs");
fs.mkdirSync(out, { recursive: true });

const resource = createMongoResource(url, { databaseName: LAB_DATABASE });
const db = mongoCollections(resource.db);
const ai = new ClaudeCodeAiClient({ timeoutMs: 600_000 });
const designRevision = (code: string) => {
  const entry = catalogEntries().find(({ revision }) => revision.code === code);
  if (!entry) throw new Error(`알 수 없는 디자인 시스템 코드: ${code}`);
  return entry.revision.revisionId;
};

class Captured extends Error {}

try {
  for (const persona of PERSONAS) {
    const user = await db.users.findOne({ email: persona.email });
    if (!user) throw new Error(`${persona.key}: 사용자를 찾지 못했습니다`);
    let recipe = await db.recipes.find({ userId: user._id }).sort({ generatedAt: -1 }).limit(1).next();
    if (!recipe) {
      console.log(`${persona.key}: 자유 입력 브루와 AI 레시피를 만듭니다`);
      const { brewId } = await new MongoMaterialsService(resource).createFreeBrew(user._id, { title: persona.title, brief: "", lengthPreset: "double" });
      const made = await new MongoRecipeService(resource, new AiRecipePlanner(ai)).generate(user._id, brewId, randomUUID());
      recipe = await db.recipes.findOne({ _id: made.id, userId: user._id });
    }
    if (!recipe) throw new Error(`${persona.key}: 레시피를 만들지 못했습니다`);
    for (const design of persona.designs) {
      const file = path.join(out, `${persona.key}-${design}.json`);
      if (fs.existsSync(file)) { console.log(`${persona.key}-${design}: 저장된 입력 유지`); continue; }
      const generation = new MongoGenerationService(resource);
      const job = await generation.submit(user._id, randomUUID(), { recipeId: recipe._id, designSystemRevisionId: designRevision(design) });
      const { portfolioId } = await generation.prepareFreeHtml(job.generationJobId);
      if (!portfolioId) throw new Error(`${persona.key}-${design}: 포트폴리오를 만들지 못했습니다`);
      let captured: PageGenerationContext | undefined;
      const capture: PageGenerator = { async generate(context) { captured = context; throw new Captured(); } };
      await new PageService(resource).generate(user._id, portfolioId, capture).catch((error) => { if (!(error instanceof Captured)) throw error; });
      if (!captured) throw new Error(`${persona.key}-${design}: 문맥을 받지 못했습니다`);
      // 문맥만 쓰고 생성은 하지 않습니다. 생성 요청을 남겨 두면 나중에 이 DB로 Worker를 띄울 때 실제 생성이 돕니다
      // (2026-11-17 검증에서 구조화 생성 세 건이 시작됐습니다). 작업을 끝난 것으로 표시하고 대기 중인 발행 요청을 지웁니다.
      await db.generationJobs.updateOne({ _id: job.generationJobId, userId: user._id }, { $set: { status: "failed", errorCode: "LAB_CAPTURE_ONLY", updatedAt: new Date() } });
      await db.outboxEvents.deleteMany({ topic: "portfolio.generate", idempotencyKey: `portfolio-generation:${job.generationJobId}`, publishedAt: null });
      // 사용량을 실제 계정에 남기지 않도록 사용자 ID를 비웁니다. 나머지는 제품이 조립한 그대로입니다.
      const context = { ...captured, userId: null };
      fs.writeFileSync(file, `${JSON.stringify({ persona: persona.key, design, context }, null, 2)}\n`);
      console.log(`${persona.key}-${design}: 섹션 ${context.sections.length} · 근거 ${context.evidence.length} · 그림 ${context.media.length} · 스타일 ${context.style?.name ?? "없음"} · 키트 ${context.useKit} · 등급 ${context.modelTier}`);
    }
  }
} finally {
  await resource.close();
}
