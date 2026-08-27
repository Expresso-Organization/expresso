import { randomUUID } from "node:crypto";
import { PORTFOLIO_STYLE_PRESETS } from "@expresso/contracts";
import { createMysqlResource } from "../../platform/mysql.js";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { RecipeService } from "../recipe/service.js";
import { TemplateService } from "../templates/service.js";
import type { GeneratedPageResult, PageGenerationContext, PageGenerator } from "./generator.js";
import { PageService } from "./service.js";

/**
 * 자유 생성 지면이 오가는 길 전체.
 *
 * 여기서 지키는 것은 넷이다 — 레시피와 근거가 **생성기까지 닿는가**, 다시 뽑아도
 * 앞 판이 남는가, 남의 포트폴리오에 뽑을 수 없는가, 그리고 내보내는 문서에
 * 껍데기가 제대로 씌워지는가.
 *
 * 모델은 부르지 않는다. 여기서 볼 것은 지면의 **품질이 아니라 배관**이고,
 * 품질은 실제 호출로 눈으로 본다.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 4_000, logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "expresso-page-test",
  mediaProvider: "local", mediaDir: "/tmp/unused",
};

interface IdRow { id: string }

/** 부른 맥락을 그대로 붙잡아 두는 가짜 생성기. 배관 검사의 눈이다. */
class RecordingGenerator implements PageGenerator {
  seen: PageGenerationContext[] = [];

  async generate(context: PageGenerationContext): Promise<GeneratedPageResult> {
    this.seen.push(context);
    const nth = this.seen.length;
    return {
      html: `<main><h1>지면 ${nth}</h1><p>${context.evidence.length}개 근거</p></main>`,
      css: `main{color:#16223a}`,
      rationale: `${nth}번째 판`,
      ungrounded: [],
      removed: [],
      usage: {
        model: "fixture", outputTokens: 0, inputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, costUsd: 0, durationMs: 0,
      },
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
        usage: {
          inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
          cacheCreationTokens: 0, durationMs: 0, costUsd: 0,
        },
      },
    };
  }
}

describeWithDatabase("free page generation integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const service = new PageService(sql);
  const generator = new RecordingGenerator();
  const identity = new IdentityService(sql);
  const app = buildApi({
    config, identityService: identity, pageService: service, pageGenerator: generator,
  });
  const marker = randomUUID();
  let ownerId = "";
  let strangerId = "";
  let portfolioId = "";

  beforeAll(async () => {
    const plan = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!plan) throw new Error("plan seed missing");
    ownerId = (await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id)
      values (${`page-owner-${marker}@example.com`}, 'Owner', ${plan}) returning id
    `)[0]?.id ?? "";
    strangerId = (await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id)
      values (${`page-stranger-${marker}@example.com`}, 'Stranger', ${plan}) returning id
    `)[0]?.id ?? "";

    const companyId = (await sql<IdRow[]>`
      insert into company (name, dedupe_key, industry, tone_summary, brand_colors)
      values ('페이지 컴퍼니', ${`page-${marker}`}, '핀테크', '숫자로 말한다', ${["#3182F6"]})
      returning id
    `)[0]?.id;
    const postingId = (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId!}, 'user_input', '결제 백엔드', ${"x".repeat(250)}, '{}', ${`page-posting-${marker}`})
      returning id
    `)[0]?.id;
    const analysisId = (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type, status)
      values (${ownerId}, ${postingId!}, 'paste', 'done') returning id
    `)[0]?.id;
    const brewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset, status)
      values (${ownerId}, ${analysisId!}, 'single', 'done') returning id
    `)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    portfolioId = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title)
      values (${ownerId}, ${brewId!}, ${templateId!}, '결제 백엔드 포트폴리오') returning id
    `)[0]?.id ?? "";

    const recipeId = (await sql<IdRow[]>`
      insert into recipe (user_id, brew_id, version, status, completeness)
      values (${ownerId}, ${brewId!}, 1, 'confirmed', 0.9) returning id
    `)[0]?.id;
    const sectionId = (await sql<IdRow[]>`
      insert into recipe_section (user_id, recipe_id, title, purpose, target_length, order_no, context)
      values (${ownerId}, ${recipeId!}, '정산 배치 재설계', '가장 큰 성과를 보인다', 480, 0,
              ${sql.json({ goal: "220분을 24분으로", points: ["원인", "한 일", "결과"],
                metrics: [], format: "narrative", tone: "professional", exclude: [] })})
      returning id
    `)[0]?.id;
    const itemId = (await sql<IdRow[]>`
      insert into recipe_item (user_id, recipe_section_id, point_text, order_no, evidence, edited_by)
      values (${ownerId}, ${sectionId!}, '정산 배치를 다시 짰다', 0,
              ${sql.json([{ sourceType: "record", label: "정산 배치 재설계" }])}, 'ai')
      returning id
    `)[0]?.id;
    // 근거 본문이 통째로 나가는 경로다. 기록에 실제 수치를 넣어 둔다.
    const categoryId = (await sql<IdRow[]>`
      insert into category (user_id, \`key\`, name, icon, default_view)
      values (${ownerId}, ${`project-${marker}`}, '프로젝트', 'folder', 'list') returning id
    `)[0]?.id;
    const recordId = (await sql<IdRow[]>`
      insert into record (user_id, category_id, title, body_md, origin)
      values (${ownerId}, ${categoryId!}, '정산 배치', '220분에서 96분, 다시 24분으로 줄였다.', 'manual')
      returning id
    `)[0]?.id;
    await sql`
      insert into recipe_evidence_path
        (user_id, recipe_id, recipe_item_id, source_type, source_id, source_label, target_path)
      values (${ownerId}, ${recipeId!}, ${itemId!}, 'record', ${recordId!}, '정산 배치 재설계',
              'sections.0.items.0')
    `;
    await app.ready();
  });

  afterAll(async () => {
    if (ownerId || strangerId) await sql`delete from \`user\` where id in (${ownerId}, ${strangerId})`;
    await sql`delete from job_posting where dedupe_hash like ${`%${marker}`}`;
    await sql`delete from company where dedupe_key like ${`%${marker}`}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("레시피와 근거가 생성기까지 닿는다", async () => {
    const page = await service.generate(ownerId, portfolioId, generator);

    expect(page.revision).toBe(0);
    expect(page.html).toContain("지면 1");

    const context = generator.seen.at(-1)!;
    // 섹션 설계가 그대로 실렸는가.
    expect(context.sections).toEqual([{
      title: "정산 배치 재설계",
      purpose: "가장 큰 성과를 보인다",
      goal: "220분을 24분으로",
      points: ["원인", "한 일", "결과"],
      targetLength: 480,
    }]);
    // 근거는 **라벨이 아니라 본문**이 가야 한다. 수치가 거기 있다.
    expect(context.evidence).toHaveLength(1);
    expect(context.evidence[0]?.text).toContain("220분에서 96분");
    // 기업 톤도 함께 간다.
    expect(context.company).toMatchObject({ name: "페이지 컴퍼니", toneSummary: "숫자로 말한다" });
    expect(context.jobTitle).toBe("결제 백엔드");
    // 이 fixture의 옛 recipe에는 아직 v1 설계안이 없다. 생성기는 이를 명시적으로
    // null로 받아 호환 경로를 쓴다.
    expect(context.portfolioPlan).toBeNull();
  });

  it("생성 전에 고른 스타일 문법이 생성기까지 닿는다", async () => {
    // 이 플랫폼이 여러 장 뽑아 고르게 하지 않는 근거다 — 문법을 미리 정하므로
    // 한 장으로 충분하다. 안 닿으면 그 기획이 통째로 없는 것이 된다.
    await service.generate(ownerId, portfolioId, generator);
    const { style } = generator.seen.at(-1)!;

    expect(style).toMatchObject({
      name: "Clarity",
      font: "sans",
      density: "comfortable",
      // 실행마다 가장 크게 흔들리던 축. 0047에서 문법에 넣었다.
      structure: "single-column",
      background: "#ffffff",
      accent: "#2563eb",
    });
    expect(style?.toneTags).toContain("clear");
    expect(style).toMatchObject({
      composition: "linear-story",
      typography: "display-led",
      interaction: "evidence-exploration",
      imagery: "typography-first",
    });
  });

  it("30종 스타일의 저장값이 카탈로그와 일치하고 선택 프롬프트가 지면에 보존된다", async () => {
    const rows = await sql<{ id: string; code: string; style: unknown }[]>`
      select id, code, style from template where code like 'designprompts-%' and is_active
    `;
    expect(rows).toHaveLength(30);
    for (const preset of PORTFOLIO_STYLE_PRESETS) {
      expect(rows.find(({ code }) => code === preset.code))
        .toMatchObject({ id: preset.templateId, style: preset.style });
    }
    const recipe = (await sql<{ id: string }[]>`
      select recipe.id from recipe join portfolio on portfolio.brew_id = recipe.brew_id
      where portfolio.id = ${portfolioId}
    `)[0]!;
    const choices = await new TemplateService(sql, new RecipeService(sql)).previews(ownerId, recipe.id, false);
    expect(choices.previews).toHaveLength(30);
    expect(choices.previews[0]?.code).toBe("designprompts-monochrome");
    expect(choices.previews.some(({ code }) => code === "clarity")).toBe(false);
    const terminal = rows.find(({ code }) => code === "designprompts-terminal")!;
    const previous = (await sql<{ template_id: string; style_overrides: Record<string, string> }[]>`
      select template_id, style_overrides from portfolio where id = ${portfolioId}
    `)[0]!;
    try {
      await sql`update portfolio set template_id = ${terminal.id},
        style_overrides = ${sql.json({ density: "spacious" })} where id = ${portfolioId}`;
      const page = await service.generate(ownerId, portfolioId, generator);
      const received = generator.seen.at(-1)!.style;
      expect(generator.seen.at(-1)!.useKit).toBe(false);
      expect(received).toMatchObject({
        name: "Terminal", font: "mono", density: "spacious",
        designReference: { code: "designprompts-terminal", version: 1,
          sourceUrl: "https://www.designprompts.dev/terminal" },
      });
      expect(received?.designReference?.prompt).toContain("터미널");
      expect(page.styleSpec).toEqual(received);
      expect((await service.latest(ownerId, portfolioId))?.styleSpec).toEqual(received);
    } finally {
      await sql`update portfolio set template_id = ${previous.template_id}, style_overrides = ${sql.json(previous.style_overrides)}
        where id = ${portfolioId}`;
    }
  });

  it("다시 뽑아도 앞 판이 남는다", async () => {
    const before = await service.latest(ownerId, portfolioId);
    const next = await service.generate(ownerId, portfolioId, generator, {
      instruction: "더 차분하게",
    });

    expect(next.revision).toBe((before?.revision ?? 0) + 1);
    // 고치라는 지시에는 지금 지면이 함께 간다 — 안 그러면 매번 새로 짠다.
    const context = generator.seen.at(-1)!;
    expect(context.instruction).toBe("더 차분하게");
    expect(context.previous?.html).toBe(before?.html);

    // 최신은 새 판이고, 앞 판은 그대로 있다.
    expect((await service.latest(ownerId, portfolioId))?.id).toBe(next.id);
    const history = await service.history(ownerId, portfolioId);
    // 판 번호는 앞선 테스트가 몇 번 뽑았는지에 달렸다. **내림차순으로 빈틈없이**
    // 이어지는지만 본다 — 그것이 이 표가 지켜야 하는 성질이다.
    const revisions = history.map(({ revision }) => revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => b - a));
    expect(revisions[0]).toBe(next.revision);
    expect(revisions.at(-1)).toBe(0);
    expect(history.find(({ id }) => id === before?.id)?.html).toBe(before?.html);
  });

  it("남의 포트폴리오에는 뽑을 수 없다", async () => {
    await expect(service.generate(strangerId, portfolioId, generator))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(await service.latest(strangerId, portfolioId)).toBeNull();
  });

  it("내보내는 문서에 껍데기가 씌워진다", async () => {
    const latest = await service.latest(ownerId, portfolioId);
    const document = await service.document(ownerId, portfolioId);

    expect(document).toContain("<!doctype html>");
    expect(document).toContain("<title>결제 백엔드 포트폴리오</title>");
    // 서체 변수는 껍데기가 깐다 — 모델이 바깥 스타일시트를 못 부르기 때문이다.
    expect(document).toContain("--page-sans");
    expect(document).toContain("word-break:keep-all");
    // 몸통과 CSS가 제자리에 들어간다 — 최신 판의 것이어야 한다.
    expect(document).toContain(latest!.html);
    expect(document).toContain(latest!.css);
  });

  it("QA와 호출 비용 원장을 판에 보존한다", async () => {
    const generated = await service.generate(ownerId, portfolioId, generator);
    expect(generated.qualityStatus).toBe("ready");
    expect(generated.qaReport.status).toBe("ready");
    expect(generated.generationManifest).toMatchObject({
      methodologyVersion: 1,
      model: "fixture",
      repairCount: 0,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    });
    expect(generated.styleSpec?.antiPatterns).toContain("color-only-variation");
  });

  it("문서 라우트는 스크립트를 막는 헤더와 함께 나간다", async () => {
    const session = await identity.issueSession({ userId: ownerId });
    const response = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/page/document`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    // 소독을 지났어도 우리 오리진에서 스크립트가 돌 길을 한 번 더 막는다.
    expect(response.headers["content-security-policy"]).toContain("script-src 'none'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("연결된 근거가 없어도 완결된 페이지 초안을 저장한다", async () => {
    await sql`delete from recipe_evidence_path where user_id = ${ownerId}`;
    const page = await service.generate(ownerId, portfolioId, generator, {
      instruction: "근거 연결 없이도 초안 유지",
    });

    expect(page.qualityStatus).toBe("ready");
    expect(generator.seen.at(-1)?.evidence).toEqual([]);
  });
});
