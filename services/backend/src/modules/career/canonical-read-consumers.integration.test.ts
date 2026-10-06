import { randomUUID } from "node:crypto";

import type { JobAnalysisExtraction } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoInterviewService } from "../interview/index.js";
import { MongoJobAnalysisService } from "../job-analysis/index.js";
import { MongoJobMarketService } from "../jobs/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { MongoCareerService } from "./index.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical-first CareerRecord read consumers", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;

  beforeAll(async () => {
    fixture = await createMongoFixture("canon-read");
  }, 60_000);

  afterAll(async () => {
    await fixture?.dispose();
  });

  async function userFixture() {
    const identity = new MongoIdentityService(fixture.resource);
    const userId = (await identity.signup({
      email: `canonical-read-${randomUUID()}@example.com`,
      displayName: "Canonical Read",
      password: "correct-horse-battery",
    })).user.id;
    const career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(userId))[0]!.id;
    const category = await mongoCollections(fixture.resource.db).careerCategories.findOne({ _id: categoryId });
    const definition = category?.propertyDefinitions?.find(
      (candidate) => candidate.type === "text" && candidate.deletedAt === null,
    );
    if (!definition) throw new Error("text PropertyDefinition fixture is missing");
    return { userId, career, categoryId, definition };
  }

  async function canonicalRecord(
    fixtureValue: Awaited<ReturnType<typeof userFixture>>,
    value: string,
    options: { status?: "draft" | "organized"; legacyValue?: string } = {},
  ) {
    const record = (await fixtureValue.career.createRecord(fixtureValue.userId, randomUUID(), {
      categoryId: fixtureValue.categoryId,
      title: "무관한 기록",
      properties: {},
      bodyMd: "무관한 본문",
    })).record;
    await mongoCollections(fixture.resource.db).careerRecords.updateOne(
      { _id: record.id },
      { $set: {
        status: options.status ?? "organized",
        properties: { [fixtureValue.definition.key]: options.legacyValue ?? "stale legacy value" },
        propertyValues: [{
          propertyDefinitionId: fixtureValue.definition.id,
          type: "text",
          value,
        }],
      } },
    );
    return record.id;
  }

  it("ranks Materials from canonical values", async () => {
    const setup = await userFixture();
    const marker = `canonical-material-${randomUUID()}`;
    const recordId = await canonicalRecord(setup, marker);

    const brew = await new MongoMaterialsService(fixture.resource).createFreeBrew(setup.userId, {
      title: "canonical read",
      brief: marker,
      lengthPreset: "single",
    });

    expect(brew.materials.find((material) => material.recordId === recordId)?.score).toBeGreaterThan(0);
  });

  it("calculates Job match from canonical values", async () => {
    const setup = await userFixture();
    const marker = `canonicaljob${randomUUID().replaceAll("-", "")}`;
    await canonicalRecord(setup, marker);
    await canonicalRecord(setup, "unrelated value");
    await canonicalRecord(setup, "another unrelated value");
    const market = new MongoJobMarketService(fixture.resource);
    const submission = await market.submitPosting(setup.userId, randomUUID(), {
      companyName: "Canonical Match",
      title: "Canonical Match",
      descriptionRaw: `${marker} `.repeat(20),
    });
    await mongoCollections(fixture.resource.db).jobPostings.updateOne(
      { _id: submission.jobPostingId },
      { $set: { requirements: { technologies: [marker], impacts: [], roles: [], conditions: [] } } },
    );

    expect((await market.computeMatch(setup.userId, submission.jobPostingId)).total).toBe(100);
  });

  it("calculates Job analysis coverage from canonical values", async () => {
    const setup = await userFixture();
    const quotes = [
      "Canonical MongoDB 운영 경험이 필요합니다.",
      "TypeScript API 개발 경험이 필요합니다.",
      "장애 대응 경험을 우대합니다.",
    ];
    const source = `${quotes.join("\n")}\n${"상세 직무 설명입니다. ".repeat(20)}`;
    const recordId = await canonicalRecord(setup, quotes[0]!);
    const market = new MongoJobMarketService(fixture.resource);
    const submission = await market.submitPosting(setup.userId, randomUUID(), {
      companyName: "Canonical Coverage",
      title: "Backend",
      descriptionRaw: source,
    });
    const extraction: JobAnalysisExtraction = {
      requirements: quotes.map((quote, index) => {
        const utf16Start = source.indexOf(quote);
        const start = Array.from(source.slice(0, utf16Start)).length;
        return {
          label: quote,
          kind: index < 2 ? "must" : "nice",
          axis: "other",
          sourceSpan: { start, end: start + Array.from(quote).length, quote },
        };
      }),
      normalized: { technologies: [], impacts: [], roles: [], conditions: [] },
    };

    const result = await new MongoJobAnalysisService(fixture.resource).process(
      submission.jobAnalysisId,
      { async extract() { return extraction; } },
    );

    expect(result.requirements.find(({ label }) => label === quotes[0])?.coveredBy).toContain(recordId);
  });

  it("plans Interview questions from canonical values", async () => {
    const setup = await userFixture();
    for (let index = 0; index < 3; index++) {
      await canonicalRecord(setup, "정성적인 협업 성과", { legacyValue: "성과 42%" });
    }
    const brew = await new MongoMaterialsService(fixture.resource).createFreeBrew(setup.userId, {
      title: "면접 준비",
      brief: "협업 성과",
      lengthPreset: "single",
    });

    const session = await new MongoInterviewService(fixture.resource).start(
      setup.userId,
      brew.brewId,
      `canonical-interview-${randomUUID()}`,
    );

    expect(session.questions).toHaveLength(3);
    expect(session.questions.every(({ basis }) => basis.type === "record_gap")).toBe(true);
  });
});
