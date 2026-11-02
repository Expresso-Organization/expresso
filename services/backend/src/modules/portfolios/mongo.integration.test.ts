import { randomUUID } from "node:crypto";

import { ListPortfoliosQuerySchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoPortfolioReadService } from "./index.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB portfolio summary", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoPortfolioReadService;
  let userId = "";
  beforeAll(async () => {
    fixture = await createMongoFixture("portfolios");
    service = new MongoPortfolioReadService(fixture.resource);
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `portfolios-${randomUUID()}@example.com`, displayName: "Portfolio", password: "correct-horse-battery" })).user.id;
  });
  afterAll(async () => fixture?.dispose());

  it("공고로 만든 포트폴리오에는 대상 공고와 회사가, 공고 없이 만든 것에는 null이 실린다", async () => {
    const db = mongoCollections(fixture.resource.db);
    const now = new Date("2026-11-03T00:00:00Z");
    const companyId = randomUUID();
    const postingId = randomUUID();
    const analysisId = randomUUID();
    const postingBrewId = randomUUID();
    const freeBrewId = randomUUID();
    const targeted = randomUUID();
    const free = randomUUID();
    const templateId = randomUUID();
    // 요약은 템플릿 코드 · 이름을 함께 싣는다. 계약이 빈 문자열을 받지 않는다.
    await db.templates.insertOne({ _id: templateId, code: `t-${templateId.slice(0, 8)}`, name: "시험", toneTags: [], supportedSections: [], planRequired: "free", description: "", rendererVersion: 1, style: {}, industries: [], isActive: true });
    await db.companies.insertOne({ _id: companyId, name: "컬리", brandColors: [], logoChecksum: "779d0b85553fe814aa" });
    await db.jobPostings.insertOne({ _id: postingId, companyId, source: "api", title: "커머스 주니어 프론트엔드 개발자", descriptionRaw: "React", requirements: {}, dedupeHash: randomUUID(), createdAt: now, duties: [], preferred: [], hiringProcess: [] });
    await db.jobAnalyses.insertOne({ _id: analysisId, userId, jobPostingId: postingId, inputType: "board", status: "done", attachments: [], progressStage: "done", attempts: 1, resultVersion: 1, targetVersion: 1 });
    await db.brews.insertMany([
      { _id: postingBrewId, userId, jobAnalysisId: analysisId, mode: "solo", lengthPreset: "single", status: "done", createdAt: now, updatedAt: now },
      // 공고 없이 시작한 제작은 분석 문서에 공고가 없다.
      { _id: freeBrewId, userId, jobAnalysisId: randomUUID(), freeTitle: "범용", mode: "solo", lengthPreset: "single", status: "done", createdAt: now, updatedAt: now },
    ]);
    await db.portfolios.insertMany([
      { _id: targeted, userId, brewId: postingBrewId, templateId, title: "같은 제목", status: "draft", createdAt: now, updatedAt: now, styleOverrides: {} },
      { _id: free, userId, brewId: freeBrewId, templateId, title: "같은 제목", status: "draft", createdAt: now, updatedAt: new Date("2026-11-02T00:00:00Z"), styleOverrides: {} },
    ]);

    const { data } = await service.list(userId, ListPortfoliosQuerySchema.parse({}));
    expect(data.find(({ id }) => id === targeted)?.target).toEqual({
      postingTitle: "커머스 주니어 프론트엔드 개발자",
      company: { name: "컬리", logoUrl: `/v1/companies/${companyId}/logo?v=779d0b85553fe814` },
    });
    expect(data.find(({ id }) => id === free)?.target).toBeNull();
  });
});
