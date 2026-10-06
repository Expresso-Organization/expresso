import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mongoCollections } from "@expresso/database";
import {
  StructuredPortfolioContentSchema,
  structuredModelSchema,
  validateStructuredPortfolio,
} from "@expresso/contracts";
import { renderStructuredPortfolio } from "@expresso/portfolio-renderer";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCareerService } from "../career/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { MongoRecipeService } from "../recipe/index.js";
import { MongoGenerationService } from "../generation/index.js";
import { MongoPublishingService } from "../publishing/service.js";
import { PageService } from "./service.js";
import type { PageGenerator, PageGenerationContext } from "./generator.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)(
  "구조화 지면 저장·편집·배포",
  () => {
    let fixture: Awaited<ReturnType<typeof createMongoFixture>>,
      service: PageService,
      user = "",
      other = "",
      portfolio = "";
    beforeAll(async () => {
      fixture = await createMongoFixture("structured-page");
      service = new PageService(fixture.resource);
      const identity = new MongoIdentityService(fixture.resource);
      user = (
        await identity.signup({
          email: `${randomUUID()}@example.com`,
          displayName: "가상 작성자",
          password: "correct-horse-battery",
        })
      ).user.id;
      other = (
        await identity.signup({
          email: `${randomUUID()}@example.com`,
          displayName: "다른 작성자",
          password: "correct-horse-battery",
        })
      ).user.id;
      const db = mongoCollections(fixture.resource.db),
        pro = await db.plans.findOne({ code: "pro" });
      await db.users.updateOne({ _id: user }, { $set: { planId: pro!._id } });
      const career = new MongoCareerService(fixture.resource),
        category = (await career.listCategories(user)).find(
          (item) => item.key === "experience",
        )!;
      const record = (
        await career.createRecord(user, randomUUID(), {
          categoryId: category.id,
          title: "가상 경로 연구",
          bodyMd: "통로 경로를 검토했습니다.",
          properties: {},
        })
      ).record;
      await db.careerRecords.updateOne(
        { _id: record.id },
        { $set: { status: "organized" } },
      );
      const brew = (
        await new MongoMaterialsService(fixture.resource).createFreeBrew(user, {
          title: "가상 포트폴리오",
          brief: "경로 연구",
          lengthPreset: "single",
        })
      ).brewId;
      const recipe = await new MongoRecipeService(fixture.resource).generate(
          user,
          brew,
          randomUUID(),
        ),
        template = await db.templates.findOne({ isActive: true });
      const generation = new MongoGenerationService(fixture.resource),
        job = await generation.submit(user, randomUUID(), {
          recipeId: recipe.id,
          templateId: template!._id,
        });
      portfolio = (await generation.prepareFreeHtml(job.generationJobId))
        .portfolioId!;
    }, 60_000);
    afterAll(async () => {
      await fixture?.dispose();
    });
    const generator: PageGenerator = {
      async generate(context: PageGenerationContext) {
        expect(context.author?.name).toBe("가상 작성자");
        const content = StructuredPortfolioContentSchema.parse({
          version: 1,
          profile: {
            name: context.author!.name,
            role: "엔지니어",
            headline: "경로를 설계하는 엔지니어입니다.",
            intro: "가상 연구",
            focus: [],
          },
          sections: [
            {
              id: "project-a",
              title: "경로 연구",
              summary: "초기 요약",
              body: "원문",
              pattern: "project",
              details: [],
              media: [],
              sourceIds: [],
            },
          ],
          career: [],
          evidence: [],
          contact: null,
        });
        const spec = structuredModelSchema(content).parse({
          root: "page",
          elements: {
            page: {
              type: "PortfolioPage",
              props: {
                profile: { $state: "/profile" },
                design: { layout: "gallery", palette: "ivory", font: "sans" },
                motion: "subtle",
                rationale: "자료 전시",
              },
              children: ["intro", "index", "section-project-a"],
            },
            intro: {
              type: "NameIntro",
              props: {
                profile: { $state: "/profile" },
                sections: { $state: "/sections" },
              },
              children: [],
            },
            index: {
              type: "ProjectIndex",
              props: { sections: { $state: "/sections" }, variant: "rows" },
              children: [],
            },
            "section-project-a": {
              type: "CaseEssay",
              props: { section: { $state: "/sectionById/project-a" } },
              children: [],
            },
          },
        });
        const rendered = renderStructuredPortfolio(spec, content),
          usage = {
            model: "fixture",
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            durationMs: 0,
            costUsd: null,
          };
        const { model: _model, ...manifestUsage } = usage;
        return {
          ...rendered,
          rationale: "자료 전시",
          ungrounded: [],
          removed: [],
          usage,
          qaReport: { status: "ready", checks: [] },
          manifest: {
            methodologyVersion: 1,
            model: "fixture",
            promptHash: "0".repeat(64),
            promptVersions: { page: 6, designPrinciples: 1 },
            tools: [],
            sourceUrls: [],
            attempts: 1,
            repairCount: 0,
            usage: manifestUsage,
            structured: validateStructuredPortfolio(spec, content),
          },
        };
      },
    };
    it("Spec·내용을 저장하고 지정 문장만 새 판으로 편집한다", async () => {
      const first = await service.generate(user, portfolio, generator);
      expect(first.generationManifest?.structured).toBeDefined();
      const edited = await service.editComposition(user, portfolio, {
        expectedRevision: first.revision,
        patches: [
          { path: "/sections/project-a/summary", value: "편집한 요약" },
        ],
      });
      expect(edited.revision).toBe(first.revision + 1);
      expect(edited.html).toContain("편집한 요약");
      expect((await service.history(user, portfolio)).at(-1)?.html).toBe(
        first.html,
      );
      await expect(
        service.editComposition(user, portfolio, {
          expectedRevision: first.revision,
          patches: [{ path: "/profile/name", value: "다른 이름" }],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        service.editComposition(other, portfolio, {
          expectedRevision: edited.revision,
          patches: [{ path: "/profile/name", value: "침입" }],
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
    it("배포한 문서는 후속 편집에도 같은 판으로 유지한다", async () => {
      const publisher = new MongoPublishingService(
          fixture.resource,
          "test-signing-secret-at-least-16",
        ),
        slug = `structured-${randomUUID().slice(0, 8)}`;
      await publisher.publish(user, portfolio, {
        slug,
        seo: { indexable: false },
        contactVisibility: "hidden",
      });
      const document = await service.document(user, portfolio),
        before = await mongoCollections(
          fixture.resource.db,
        ).deployments.findOne({ portfolioId: portfolio });
      const current = (await service.latest(user, portfolio))!;
      await service.editComposition(user, portfolio, {
        expectedRevision: current.revision,
        patches: [{ path: "/sections/project-a/summary", value: "후속 편집" }],
      });
      const after = await mongoCollections(
        fixture.resource.db,
      ).deployments.findOne({ _id: before!._id });
      expect(after?.snapshot).toEqual(before?.snapshot);
      expect(await service.document(user, portfolio)).not.toBe(document);
    });
    it("직접 선택한 레이아웃을 다음 생성 문맥에도 유지한다", async () => {
      const current = (await service.latest(user, portfolio))!;
      const spec = structuredClone(
        current.generationManifest!.structured!.spec,
      );
      const root = spec.elements[spec.root]!;
      if (root.type !== "PortfolioPage") throw new Error("루트 없음");
      root.props.design.layout = "dossier";
      await service.editComposition(user, portfolio, {
        expectedRevision: current.revision,
        spec,
        patches: [],
      });
      await service.generate(user, portfolio, {
        async generate(next) {
          expect(next.style?.structure).toBe("dense-grid");
          expect(next.structuredContent?.sections[0]?.summary).toBe(
            "후속 편집",
          );
          return generator.generate(next);
        },
      });
    });
  },
);
