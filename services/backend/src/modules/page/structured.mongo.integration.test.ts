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
import { findDesignSystemRevision } from "../design-systems/index.js";
import { MongoPublishingService } from "../publishing/service.js";
import { PageService } from "./service.js";
import { PageElementEditor } from "./element-edit.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import type { PageGenerator, PageGenerationContext } from "./generator.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)(
  "구조화 지면 저장·편집·배포",
  () => {
    let fixture: Awaited<ReturnType<typeof createMongoFixture>>,
      service: PageService,
      user = "",
      other = "",
      portfolio = "",
      recipeId = "",
      recordId = "",
      categoryId = "";
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
      recordId = record.id;
      categoryId = category.id;
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
      recipeId = recipe.id;
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
        // 모델 출력에는 design이 없습니다. 생성기처럼 저장 계약의 배치 이름을 채웁니다.
        const spec = structuredModelSchema(content).parse({
          root: "page",
          elements: {
            page: {
              type: "PortfolioPage",
              props: {
                profile: { $state: "/profile" },
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
                variant: "statement",
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
        }) as { elements: { page: { props: Record<string, unknown> } } };
        spec.elements.page.props.design = { layout: "gallery" };
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
    it("디자인 시스템 판으로 만든 포트폴리오는 생성 문맥에 그 디자인의 이름과 토큰을 쓴다", async () => {
      // Refero Stripe 판은 내장 Clarity 틀을 쓰지만, 이름과 토큰은 판에서 와야 합니다.
      const revisionId = "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1702";
      const revision = findDesignSystemRevision(revisionId)!;
      const generation = new MongoGenerationService(fixture.resource);
      const job = await generation.submit(user, randomUUID(), {
        recipeId,
        designSystemRevisionId: revisionId,
      });
      const designed = (await generation.prepareFreeHtml(job.generationJobId))
        .portfolioId!;
      await service.generate(user, designed, {
        async generate(next) {
          expect(next.style?.name).toBe(revision.spec.identity.name);
          expect(next.style?.background).toBe(
            revision.spec.colors.canvas.value,
          );
          expect(next.style?.accent).toBe(revision.spec.colors.accent.value);
          expect(next.style?.structure).toBe(revision.spec.composition.layout);
          // 렌더러는 고른 판의 전체 토큰을 받습니다.
          expect(next.design).toEqual(revision.spec);
          return generator.generate(next);
        },
      });
    });

    it("생성 요청의 유형을 포트폴리오에 남기고 생성 문맥에 넘긴다", async () => {
      const revisionId = "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1702";
      const generation = new MongoGenerationService(fixture.resource);
      const job = await generation.submit(user, randomUUID(), { recipeId, designSystemRevisionId: revisionId, archetype: "list" });
      const created = (await generation.prepareFreeHtml(job.generationJobId)).portfolioId!;
      await service.generate(user, created, {
        async generate(next) {
          expect(next.archetype).toBe("list");
          return generator.generate(next);
        },
      });
      // 유형 없이 요청하면 문맥에도 없고, 생성기는 사례 상세형으로 만듭니다.
      const plain = await generation.submit(user, randomUUID(), { recipeId, designSystemRevisionId: revisionId });
      const plainPortfolio = (await generation.prepareFreeHtml(plain.generationJobId)).portfolioId!;
      await service.generate(user, plainPortfolio, {
        async generate(next) {
          expect(next.archetype).toBeUndefined();
          return generator.generate(next);
        },
      });
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
    it("컨테이너로 묶은 구성을 저장하고 문장 편집 뒤에도 보존한다", async () => {
      const current = (await service.latest(user, portfolio))!;
      const spec = structuredClone(
        current.generationManifest!.structured!.spec,
      );
      const root = spec.elements[spec.root]!;
      if (root.type !== "PortfolioPage") throw new Error("시험 지면 연결 오류");
      root.children = ["intro", "group-1"];
      spec.elements["group-1"] = {
        type: "Columns",
        props: { variant: "wide-end" },
        children: ["index", "section-project-a"],
      };
      const grouped = await service.editComposition(user, portfolio, {
        expectedRevision: current.revision,
        spec,
        patches: [],
      });
      expect(grouped.generationManifest?.structured?.spec).toEqual(spec);
      expect(grouped.html).toContain(
        'data-group="columns" data-variant="wide-end"',
      );
      const patched = await service.editComposition(user, portfolio, {
        expectedRevision: grouped.revision,
        patches: [
          { path: "/sections/project-a/summary", value: "묶음 안 요약" },
        ],
      });
      expect(patched.generationManifest?.structured?.spec).toEqual(spec);
      expect(patched.html).toContain("묶음 안 요약");
      const broken = structuredClone(spec);
      (broken.elements["group-1"] as { children: string[] }).children = [
        "intro",
        "section-project-a",
      ];
      (broken.elements[broken.root] as { children: string[] }).children = [
        "index",
        "group-1",
      ];
      await expect(
        service.editComposition(user, portfolio, {
          expectedRevision: patched.revision,
          spec: broken,
          patches: [],
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
    });
    it("수집 원본의 키·Spec·선택 해시를 저장하고 미연결 항목은 거절한다", async () => {
      const current = (await service.latest(user, portfolio))!;
      const spec = structuredClone(
        current.generationManifest!.structured!.spec,
      );
      const root = spec.elements[spec.root]!,
        intro = spec.elements.intro!,
        section = spec.elements["section-project-a"]!;
      if (
        root.type !== "PortfolioPage" ||
        intro.type !== "NameIntro" ||
        !("section" in section.props) ||
        section.type === "PullQuote"
      )
        throw new Error("시험 지면 연결 오류");
      root.props.design.layout = "library";
      intro.props.sourceId = "watermelon-hero-12";
      section.props.sourceId = "watermelon-card";
      const edited = await service.editComposition(user, portfolio, {
        expectedRevision: current.revision,
        spec,
        patches: [],
      });
      expect(edited.generationManifest?.structured?.spec).toEqual(spec);
      expect(
        edited.generationManifest?.library?.selected.map((item) => item.key),
      ).toEqual(["watermelon-hero-12", "watermelon-card"]);
      expect(edited.generationManifest?.library?.selected[0]?.sha256).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(edited.html).toContain("data-library-source");
      intro.props.sourceId = "unsupported-source";
      await expect(
        service.editComposition(user, portfolio, {
          expectedRevision: edited.revision,
          spec,
          patches: [],
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect((await service.latest(user, portfolio))?.revision).toBe(
        edited.revision,
      );
    });
    it("구조화 초안은 다듬기를 예약하고, 채택한 판을 새 판으로 저장하며, 그사이 고친 판은 덮지 않는다", async () => {
      const db = mongoCollections(fixture.resource.db);
      const draft = await service.generate(user, portfolio, generator);
      expect(draft.refinement).toEqual({ status: "pending" });
      expect(await db.outboxEvents.findOne({ topic: "page.refine", idempotencyKey: `page-refine:${draft.id}` })).toMatchObject({ payload: { userId: user, pageId: draft.id } });
      const improved = await generator.generate({ author: { name: "가상 작성자" } } as PageGenerationContext);
      const inputs: unknown[] = [];
      const review = { status: "adopted" as const, critique: ["사례를 첫 화면 가까이 올립니다."], comparison: { winner: "revised" as const, reason: "사례가 먼저 보입니다." }, durationMs: 10, calls: 3, costUsd: 0.5 };
      const refiner = { refine: async (input: unknown) => { inputs.push(input); return { status: "adopted" as const, review, result: { ...improved, html: `${improved.html}<p>다듬은 판</p>` } }; } };
      await service.refine(other, draft.id, refiner);
      expect(inputs).toHaveLength(0);
      await service.refine(user, draft.id, refiner);
      expect(inputs[0]).toMatchObject({ snapshot: draft.generationManifest!.structured });
      const latest = (await service.latest(user, portfolio))!;
      expect(latest.revision).toBe(draft.revision + 1);
      expect(latest.html).toContain("다듬은 판");
      expect(latest.refinement).toBeUndefined();
      const marked = (await service.history(user, portfolio)).find((page) => page.id === draft.id)!;
      expect(marked.refinement).toEqual({ status: "adopted", revisionId: latest.id });
      expect(marked.generationManifest!.visualReview).toEqual(review);
      // 재전달이 와도 다시 다듬지 않습니다.
      await service.refine(user, draft.id, refiner);
      expect(inputs).toHaveLength(1);

      const second = await service.generate(user, portfolio, generator);
      const edited = await service.editComposition(user, portfolio, { expectedRevision: second.revision, patches: [{ path: "/sections/project-a/summary", value: "사용자 편집" }] });
      // 다듬는 중인 초안을 고친 새 판은 다듬기 표시를 옮기지 않습니다. 옮기면 화면의 「다듬는 중」이 끝나지 않습니다.
      expect(edited.refinement).toBeUndefined();
      await service.refine(user, second.id, refiner);
      expect(inputs).toHaveLength(1);
      expect((await service.latest(user, portfolio))!.id).toBe(edited.id);
      expect((await service.history(user, portfolio)).find((page) => page.id === second.id)!.refinement).toEqual({ status: "superseded" });

      const third = await service.generate(user, portfolio, generator);
      await service.refine(user, third.id, null);
      expect((await service.latest(user, portfolio))!.refinement).toEqual({ status: "skipped", reason: "AI가 꺼져 있습니다." });
    });
    it("고른 요소를 말로 · 직접 고치고, 기록을 사례로 더한다", async () => {
      const db = mongoCollections(fixture.resource.db);
      const base = await service.generate(user, portfolio, generator);
      const owner = await db.portfolios.findOne({ _id: portfolio });
      const design = (await import("../design-systems/index.js")).findPortfolioDesign(owner!);
      const step = design.typography.scale.at(-1)!.name;

      // 직접 고친 글자 모양은 요소 키로 좁힌 규칙으로 그립니다. 디자인에 없는 단계는 받지 않습니다.
      const spec = structuredClone(base.generationManifest!.structured!.spec);
      (spec.elements["section-project-a"]!.props as Record<string, unknown>).style = { title: { color: "accent", size: step } };
      const styled = await service.editComposition(user, portfolio, { expectedRevision: base.revision, spec, patches: [] });
      expect(styled.html).toContain('data-xp-key="section-project-a"');
      expect(styled.css).toContain(`[data-xp-key="section-project-a"] :is(.xp-head .xp-h2){color:var(--xp-accent-text)`);
      (spec.elements["section-project-a"]!.props as Record<string, unknown>).style = { title: { size: "giant" } };
      await expect(service.editComposition(user, portfolio, { expectedRevision: styled.revision, spec, patches: [] })).rejects.toMatchObject({ statusCode: 422 });

      // 지시를 붙여 다시 만들어도 직접 고친 글자 모양은 같은 키 · 부품 요소로 옮깁니다.
      (spec.elements["section-project-a"]!.props as Record<string, unknown>).style = { title: { color: "accent" } };
      const restyled = await service.editComposition(user, portfolio, { expectedRevision: styled.revision, spec, patches: [] });
      const regenerated = await service.generate(user, portfolio, generator, { instruction: "다시" });
      expect((regenerated.generationManifest!.structured!.spec.elements["section-project-a"]!.props as { style?: unknown }).style).toEqual({ title: { color: "accent" } });
      expect(regenerated.css).toContain('[data-xp-key="section-project-a"] :is(.xp-head .xp-h2){color:var(--xp-accent-text)}');
      expect(restyled.revision + 1).toBe(regenerated.revision);
      const base2 = regenerated;

      // AI가 없으면 말로 고칠 수 없습니다.
      await expect(service.instructElement(user, portfolio, "section-project-a", { expectedRevision: base2.revision, instruction: "짧게" }, null)).rejects.toMatchObject({ statusCode: 503 });
      const ai = new ScriptedAiClient(
        () => ({ note: "요약을 바꿨습니다.", text: [{ path: "/sections/project-a/summary", value: "요약 77건" }], style: { summary: { color: "muted" } } }),
        (_request, paths) => paths.map((path) => ({ path, value: "짧은 요약" })),
      );
      const instructed = await service.instructElement(user, portfolio, "section-project-a", { expectedRevision: base2.revision, instruction: "요약 짧게" }, new PageElementEditor(ai));
      expect(ai.fixRequests).toHaveLength(1);
      expect(instructed.changes).toEqual([
        { label: "요약 모양", before: "기본", after: "흐린색" },
        { label: "요약", before: "초기 요약", after: "짧은 요약" },
      ]);
      expect(instructed.page.revision).toBe(base2.revision + 1);
      expect(instructed.page.rationale).toBe("요약을 바꿨습니다.");
      const after = instructed.page.generationManifest!.structured!;
      expect(after.spec.elements["intro"]).toEqual(base.generationManifest!.structured!.spec.elements["intro"]);
      // 앞서 고친 제목 모양은 그대로 두고 요약 모양만 더합니다.
      expect((after.spec.elements["section-project-a"]!.props as { style?: unknown }).style).toEqual({ title: { color: "accent" }, summary: { color: "muted" } });
      await expect(service.instructElement(user, portfolio, "missing", { expectedRevision: instructed.page.revision, instruction: "x" }, new PageElementEditor(ai))).rejects.toMatchObject({ statusCode: 404 });

      // 기록 추가: AI가 없으면 기록 글을 그대로 씁니다. 같은 기록은 두 번 더하지 않습니다.
      const added = await service.addRecordSection(user, portfolio, { expectedRevision: instructed.page.revision, recordId }, null);
      const structured = added.generationManifest!.structured!;
      expect(structured.content.sections.at(-1)).toMatchObject({ id: recordId, title: "가상 경로 연구", body: "통로 경로를 검토했습니다." });
      expect(structured.spec.elements[`section-${recordId}`]).toMatchObject({ type: "CaseEssay" });
      expect(structured.spec.elements[structured.spec.root]!.children!.at(-1)).toBe(`section-${recordId}`);
      expect(added.html).toContain("통로 경로를 검토했습니다.");
      await expect(service.addRecordSection(user, portfolio, { expectedRevision: added.revision, recordId }, null)).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.addRecordSection(other, portfolio, { expectedRevision: added.revision, recordId }, null)).rejects.toMatchObject({ statusCode: 404 });

      // AI가 있으면 기록을 읽고 사례 글을 씁니다.
      const career = new MongoCareerService(fixture.resource);
      const second = (await career.createRecord(user, randomUUID(), { categoryId, title: "배치 재설계", bodyMd: "야간 배치를 24분으로 줄였다.", properties: {} })).record;
      const writer = new ScriptedAiClient(() => ({ title: "배치 재설계", summary: "24분으로 줄인 배치", body: "본문", details: [], metrics: [], quote: "", steps: [] }));
      const written = await service.addRecordSection(user, portfolio, { expectedRevision: added.revision, recordId: second.id }, new PageElementEditor(writer));
      expect(writer.calls[0]!.contract).toBe("page_fill");
      expect(written.generationManifest!.structured!.content.sections.at(-1)).toMatchObject({ id: second.id, summary: "24분으로 줄인 배치" });
      await expect(service.addRecordSection(user, portfolio, { expectedRevision: added.revision, recordId: randomUUID() }, null)).rejects.toMatchObject({ statusCode: 409 });
    });
  },
);
