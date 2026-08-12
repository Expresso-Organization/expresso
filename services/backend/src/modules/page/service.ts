import {
  GeneratedPageSchema,
  PAGE_PROMPT_VERSION,
  PageStyleGrammarSchema,
  PortfolioPlanSchema,
  composeTemplateStyle,
  mediaAssetUrl,
  pageDocument,
  type GeneratedPage,
  type PageStyleGrammar,
} from "@expresso/contracts";
import type postgres from "postgres";

import type { ConsentService } from "../consent/service.js";
import { withTimeout } from "../../platform/timeouts.js";
import type {
  PageGenerationContext,
  PageGenerator,
  PageMedia,
} from "./generator.js";
import { DESIGN_PRINCIPLES_VERSION } from "./generator.js";

/**
 * 자유 생성 지면의 살림.
 *
 * 하는 일은 셋이다 — 재료를 모아 생성기에 넘기고, 나온 것을 **판(revision)으로**
 * 쌓고, 꺼내 준다.
 *
 * 판을 쌓는 것이 이 경로의 되돌리기다. 블록을 고칠 수 없으니 마음에 안 들면
 * 다시 뽑는 수밖에 없고, 그러면 **직전 것이 남아 있어야 한다** — 다시 뽑은 게
 * 더 나쁠 때 돌아갈 곳이 없으면 사용자는 생성 버튼을 누르기를 두려워한다.
 */

export class PageServiceError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PageServiceError";
    this.statusCode = statusCode;
  }
}

interface SectionRow {
  section_id: string;
  section_title: string;
  section_purpose: string;
  target_length: number;
  context: { goal?: string; points?: string[] };
}
interface EvidenceRow { source_label: string; source_text: string }
interface SubjectRow {
  job_title: string | null;
  company_name: string;
  industry: string | null;
  tone_summary: string | null;
  brand_colors: string[];
}
interface TemplateRow {
  name: string;
  description: string;
  tone_tags: string[];
  style: unknown;
  style_overrides: unknown;
}
interface MediaRow {
  asset_id: string;
  alt: string | null;
  width: number;
  height: number;
  variants: number[];
}
interface PageRow {
  id: string; portfolio_id: string; html: string; css: string; rationale: string;
  revision: number; prompt_version: number; created_at: Date;
  ungrounded_numbers: string[]; removed: string[];
  quality_status: "ready" | "failed_qa";
  qa_report: unknown;
  generation_manifest: unknown;
  portfolio_plan_snapshot: unknown;
  style_spec_snapshot: unknown;
}

function toPage(row: PageRow): GeneratedPage {
  return GeneratedPageSchema.parse({
    id: row.id,
    portfolioId: row.portfolio_id,
    html: row.html,
    css: row.css,
    rationale: row.rationale,
    promptVersion: row.prompt_version,
    revision: row.revision,
    qualityStatus: row.quality_status,
    qaReport: row.qa_report,
    generationManifest: Object.keys((row.generation_manifest ?? {}) as object).length > 0
      ? row.generation_manifest
      : null,
    styleSpec: row.style_spec_snapshot,
    createdAt: row.created_at.toISOString(),
  });
}

export class PageService {
  readonly #sql: postgres.Sql;
  readonly #consent: ConsentService | null;

  constructor(sql: postgres.Sql, consent?: ConsentService | null) {
    this.#sql = sql;
    this.#consent = consent ?? null;
  }

  /** 가장 최근 판. 없으면 null — 아직 안 뽑은 포트폴리오다. */
  async latest(userId: string, portfolioId: string): Promise<GeneratedPage | null> {
    const row = (await this.#sql<PageRow[]>`
      select * from generated_page
      where user_id = ${userId} and portfolio_id = ${portfolioId}
      order by revision desc limit 1
    `)[0];
    return row ? toPage(row) : null;
  }

  async history(userId: string, portfolioId: string): Promise<GeneratedPage[]> {
    const rows = await this.#sql<PageRow[]>`
      select * from generated_page
      where user_id = ${userId} and portfolio_id = ${portfolioId}
      order by revision desc
    `;
    return rows.map(toPage);
  }

  /** 내보낼 문서 한 장. 배포와 미리보기가 **같은 이것**을 본다. */
  async document(userId: string, portfolioId: string): Promise<string | null> {
    const row = (await this.#sql<PageRow[]>`
      select * from generated_page
      where user_id = ${userId} and portfolio_id = ${portfolioId} and quality_status = 'ready'
      order by revision desc limit 1
    `)[0];
    if (!row) return null;
    const page = toPage(row);
    const title = (await this.#sql<{ title: string }[]>`
      select title from portfolio where user_id = ${userId} and id = ${portfolioId}
    `)[0]?.title ?? "포트폴리오";
    const grammar = isPageStyleGrammar(row.style_spec_snapshot)
      ? row.style_spec_snapshot
      : undefined;
    return pageDocument({
      html: page.html,
      css: page.css,
      title,
      description: page.rationale,
      ...(grammar ? { grammar } : {}),
    });
  }

  /** 지면의 재료. 레시피가 뼈대이고 근거가 사실이다. */
  async #context(
    userId: string,
    portfolioId: string,
    instruction: string | undefined,
    previous: { html: string; css: string } | undefined,
  ): Promise<PageGenerationContext> {
    const recipe = (await this.#sql<{ id: string; portfolio_plan: unknown }[]>`
      select recipe.id, recipe.portfolio_plan from recipe
      join portfolio on portfolio.brew_id = recipe.brew_id and portfolio.user_id = recipe.user_id
      where recipe.user_id = ${userId} and portfolio.id = ${portfolioId}
      order by recipe.version desc limit 1
    `)[0];
    if (!recipe) throw new PageServiceError(404, "recipe not found for portfolio");

    const sections = await this.#sql<SectionRow[]>`
      select id as section_id, title as section_title, purpose as section_purpose,
             target_length, context
      from recipe_section
      where user_id = ${userId} and recipe_id = ${recipe.id}
      order by order_no
    `;
    if (sections.length === 0) throw new PageServiceError(409, "recipe has no sections");

    // 근거 본문이 통째로 나간다 — 문장을 모델이 직접 쓰기 때문이다.
    const evidence = await this.#sql<EvidenceRow[]>`
      select distinct path.source_label,
             coalesce(
               nullif(concat_ws(E'\n', record.title, record.body_md), ''),
               answer.transcript,
               nullif(concat_ws(E'\n', requirement.label, requirement.source_span ->> 'quote'), ''),
               ''
             ) as source_text
      from recipe_evidence_path path
      left join record on record.id = path.source_id and path.source_type = 'record'
      left join answer on answer.id = path.source_id and path.source_type = 'answer'
      left join job_posting_requirement requirement
        on requirement.id = path.source_id and path.source_type = 'requirement'
      where path.user_id = ${userId} and path.recipe_id = ${recipe.id}
    `;

    // 사용자가 03에서 고른 스타일 문법. 생성기는 이걸 제약으로 받는다.
    const template = (await this.#sql<TemplateRow[]>`
      select template.name, template.description, template.tone_tags, template.style,
             portfolio.style_overrides
      from portfolio join template on template.id = portfolio.template_id
      where portfolio.user_id = ${userId} and portfolio.id = ${portfolioId}
    `)[0];
    // 옛 행은 style이 비어 있을 수 있다. 그때는 문법 없이 간다 — 반쯤 채운
    // 문법을 넘기면 모델이 나머지를 지어내고, 고른 것과 다른 지면이 나온다.
    const composed = template
      ? composeTemplateStyle(template.style, template.style_overrides)
      : null;
    const style: PageStyleGrammar | undefined = composed && template
      ? {
        name: template.name,
        description: template.description,
        toneTags: template.tone_tags,
        ...composed,
        composition: composed.structure === "dense-grid"
          ? "evidence-grid"
          : composed.structure === "wide-margin"
            ? "asymmetric-editorial"
            : "linear-story",
        typography: composed.font === "serif"
          ? "editorial"
          : composed.structure === "dense-grid" ? "technical" : "display-led",
        geometry: composed.structure === "dense-grid"
          ? "ruled-sections"
          : composed.structure === "wide-margin" ? "open-planes" : "contained-cards",
        motion: composed.density === "compact" ? "precise-technical" : "calm-responsive",
        interaction: composed.structure === "dense-grid" ? "comparison" : "evidence-exploration",
        imagery: composed.structure === "wide-margin"
          ? "project-artifacts-first"
          : composed.structure === "dense-grid" ? "data-visual-first" : "typography-first",
        antiPatterns: [
          "generic-saas-landing",
          "three-identical-cards",
          "decorative-dashboard-without-evidence",
          "color-only-variation",
        ],
      }
      : undefined;

    const subject = (await this.#sql<SubjectRow[]>`
      select job_posting.title as job_title, company.name as company_name,
             company.industry, company.tone_summary, company.brand_colors
      from portfolio
      join brew on brew.id = portfolio.brew_id and brew.user_id = portfolio.user_id
      join job_analysis on job_analysis.id = brew.job_analysis_id
      join job_posting on job_posting.id = job_analysis.job_posting_id
      join company on company.id = job_posting.company_id
      where portfolio.user_id = ${userId} and portfolio.id = ${portfolioId}
    `)[0] ?? null;

    // 이 포트폴리오가 이미 쓰고 있는 그림만 내민다. 사용자의 자산 전부를 열면
    // 상관없는 사진이 지면에 실릴 수 있다.
    const media = await this.#sql<MediaRow[]>`
      select distinct asset.id as asset_id, asset.width, asset.height,
             block.content ->> 'alt' as alt,
             coalesce(array_agg(variant.width order by variant.width)
                      filter (where variant.width is not null), '{}') as variants
      from block
      join portfolio_section on portfolio_section.id = block.portfolio_section_id
      join media_asset asset
        on asset.id = (block.content ->> 'assetId')::uuid and asset.user_id = block.user_id
      left join media_variant variant on variant.media_asset_id = asset.id
      where block.user_id = ${userId} and portfolio_section.portfolio_id = ${portfolioId}
        and block.kind = 'media'
      group by asset.id, asset.width, asset.height, block.content ->> 'alt'
    `;

    return {
      portfolioPlan: recipe.portfolio_plan
        ? PortfolioPlanSchema.parse(recipe.portfolio_plan)
        : null,
      ...(style ? { style } : {}),
      sections: sections.map((row) => ({
        title: row.section_title,
        purpose: row.section_purpose,
        goal: row.context.goal ?? "",
        points: row.context.points ?? [],
        targetLength: row.target_length,
      })),
      evidence: evidence
        .filter(({ source_text }) => source_text.trim().length > 0)
        .map(({ source_label, source_text }) => ({ label: source_label, text: source_text })),
      media: media.map((row): PageMedia => ({
        // 상대 주소로 낸다 — 소독기가 이 접두어만 통과시킨다.
        src: mediaAssetUrl("", row.asset_id),
        srcSet: row.variants.map((width) =>
          `${mediaAssetUrl("", row.asset_id, width)} ${width}w`).join(", "),
        alt: row.alt ?? "",
        width: row.width,
        height: row.height,
      })),
      jobTitle: subject?.job_title ?? null,
      company: subject
        ? {
          name: subject.company_name,
          industry: subject.industry,
          toneSummary: subject.tone_summary,
          brandColors: subject.brand_colors,
        }
        : null,
      instruction,
      previous,
      // 키트가 sonnet을 쓸 수 있게 해 준다. 실측에서 sonnet은 키트가 없으면
      // 헤매느라 토큰을 더 쓰고(26k), 키트가 붙으면 16k로 내려오면서 품질은
      // opus와 눈으로 구분되지 않았다.
      useKit: true,
      modelTier: "sonnet",
    };
  }

  /**
   * 지면을 뽑는다.
   *
   * `instruction`이 있고 앞 판이 있으면 **고치는 것**이고, 없으면 새로 만드는
   * 것이다. 어느 쪽이든 새 판으로 쌓이고 앞 판은 그대로 남는다.
   */
  async generate(
    userId: string,
    portfolioId: string,
    generator: PageGenerator,
    options: { instruction?: string | undefined } = {},
  ): Promise<GeneratedPage> {
    const owned = (await this.#sql<{ id: string }[]>`
      select id from portfolio where user_id = ${userId} and id = ${portfolioId}
    `)[0];
    if (!owned) throw new PageServiceError(404, "portfolio not found");

    const current = await this.latest(userId, portfolioId);
    const context = await this.#context(
      userId,
      portfolioId,
      options.instruction,
      current ? { html: current.html, css: current.css } : undefined,
    );
    if (context.evidence.length === 0) {
      throw new PageServiceError(409, "지면을 만들 근거가 없습니다");
    }

    // 계약을 부르기 전에 문을 지난다. 기록 본문이 통째로 나가는 계약이다.
    await this.#consent?.require(userId, "page_generation");
    // 멈춘 프로바이더를 막는 backstop이다. 실제 한계는 어댑터가 쥐고 있고,
    // 재시도까지 하면 두 배가 되므로 여기서 먼저 끊으면 재시도가 잘린다.
    const result = await withTimeout(generator.generate(context), 900_000, "page generator");

    const row = (await this.#sql<PageRow[]>`
      insert into generated_page (
        user_id, portfolio_id, html, css, rationale, revision, instruction,
        prompt_version, ungrounded_numbers, removed, quality_status, qa_report,
        generation_manifest, portfolio_plan_snapshot, style_spec_snapshot,
        design_principles_version
      ) values (
        ${userId}, ${portfolioId}, ${result.html}, ${result.css}, ${result.rationale},
        ${(current?.revision ?? -1) + 1}, ${options.instruction ?? null},
        ${PAGE_PROMPT_VERSION}, ${result.ungrounded}, ${result.removed},
        ${result.qaReport.status}, ${this.#sql.json(result.qaReport as postgres.JSONValue)},
        ${this.#sql.json(result.manifest as postgres.JSONValue)},
        ${context.portfolioPlan
          ? this.#sql.json(context.portfolioPlan as postgres.JSONValue)
          : null},
        ${context.style ? this.#sql.json(context.style as unknown as postgres.JSONValue) : null},
        ${DESIGN_PRINCIPLES_VERSION}
      ) returning *
    `)[0];
    if (!row) throw new Error("generated page missing");

    // 지운 것이 있으면 프롬프트가 규칙을 덜 가르쳤다는 뜻이다. 지면은 나가되
    // 우리는 알아야 한다.
    if (result.removed.length > 0) {
      console.error(JSON.stringify({
        level: "warn",
        event: "page.sanitized",
        portfolioId,
        removed: result.removed,
      }));
    }
    return toPage(row);
  }
}

function isPageStyleGrammar(value: unknown): value is PageStyleGrammar {
  return PageStyleGrammarSchema.safeParse(value).success;
}
