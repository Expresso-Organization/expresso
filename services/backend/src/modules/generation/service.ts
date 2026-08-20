import { createHash, randomUUID } from "node:crypto";

import {
  GenerationJobStatusSchema,
  GenerationOutputSchema,
  type GenerationOutput,
  type SubmitGeneration,
} from "@expresso/contracts";
import type postgres from "postgres";

import { EntitlementService } from "../entitlements/service.js";
import { addOutboxEvent } from "../../platform/outbox.js";
import {
  LAYOUT_PROMPT_VERSION,
  toLayoutSpecs,
  type LayoutDesignContext,
  type LayoutDesigner,
} from "../layout/designer.js";
import { GenerationValidationError, validateGenerationOutput } from "./validator.js";
import {
  SentenceWriterUnavailableError,
  type SentenceWriter,
  type WriterContext,
  type WriterSection,
} from "./writer.js";
import { withTimeout } from "../../platform/timeouts.js";
import type { ConsentService } from "../consent/service.js";

interface JobRow {
  id: string; user_id: string; brew_id: string; recipe_id: string; template_id: string;
  status: "queued" | "running" | "done" | "failed"; stage: string; attempts: number;
  usage_charged: boolean; error_code: string | null; failure_retryable: boolean | null;
  portfolio_id: string | null; request_hash: string | null;
  style_overrides: unknown;
}
interface PathRow {
  id: string; recipe_item_id: string;
  source_type: "record" | "requirement" | "answer";
  source_id: string; source_label: string;
  /** 근거 원문. 수치가 실제로 적혀 있는 곳이라 검증기가 이걸 본다. */
  source_text: string;
}
interface SectionContext {
  goal?: string; points?: string[]; metrics?: string[];
  format?: string; tone?: string; exclude?: string[];
}
interface ContextRow {
  section_id: string; section_title: string; section_purpose: string; target_length: number;
  item_id: string; point_text: string; context: SectionContext;
}
interface BrewSubjectRow {
  job_title: string | null; job_family: string | null;
  company_name: string; industry: string | null; tone_summary: string | null;
  brand_colors: string[];
}

export class GenerationError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.name = "GenerationError"; this.statusCode = statusCode; }
}

function requestHash(input: SubmitGeneration) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * 레시피 행들을 문장 계약의 입력으로 편다.
 *
 * 섹션과 근거에 **번호**를 매기는 곳이다. 배열 순서가 곧 번호(1부터)이고,
 * 모델은 그 번호로만 가리킨다 — UUID를 옮겨 적게 하지 않는다.
 */
export function buildWriterContext(input: {
  items: ContextRow[];
  evidence: PathRow[];
  subject: BrewSubjectRow | null;
  lockedTexts: string[];
}): WriterContext {
  const numberOf = new Map(input.evidence.map((path, index) => [path.id, index + 1]));
  const sections: WriterSection[] = [];
  const bySection = new Map<string, WriterSection>();

  for (const row of input.items) {
    let section = bySection.get(row.section_id);
    if (!section) {
      section = {
        recipeSectionId: row.section_id,
        title: row.section_title,
        purpose: row.section_purpose,
        targetLength: row.target_length,
        goal: row.context.goal ?? "",
        points: row.context.points ?? [],
        metrics: row.context.metrics ?? [],
        tone: row.context.tone ?? "",
        format: row.context.format ?? "",
        exclude: row.context.exclude ?? [],
        items: [],
      };
      bySection.set(row.section_id, section);
      sections.push(section);
    }
    section.items.push({
      pointText: row.point_text,
      sourceNumbers: input.evidence
        .filter(({ recipe_item_id }) => recipe_item_id === row.item_id)
        .flatMap((path) => {
          const number = numberOf.get(path.id);
          return number === undefined ? [] : [number];
        }),
    });
  }

  return {
    sections,
    evidence: input.evidence.map((path) => ({
      id: path.id,
      sourceType: path.source_type,
      label: path.source_label,
      text: path.source_text,
    })),
    company: input.subject
      ? {
        name: input.subject.company_name,
        industry: input.subject.industry,
        toneSummary: input.subject.tone_summary,
      }
      : null,
    jobTitle: input.subject?.job_title ?? null,
    lockedTexts: input.lockedTexts,
  };
}

/** 블록 종류마다 담기는 것이 다르다. 지면 렌더러가 이 모양을 읽는다. */
function blockContent(block: GenerationOutput["blocks"][number]): Record<string, unknown> {
  if (block.kind === "list") {
    // 쌍으로 낸 목록은 쌍 그대로 둔다 — 지면이 이름과 값을 다르게 세운다.
    const items = block.items
      ?? block.text.split("\n").map((line) => line.trim()).filter(Boolean);
    return { items };
  }
  if (block.kind === "metric") return { value: block.text, label: block.label ?? "" };
  // 그림은 content가 곧 그림이다. 렌더러가 이 모양을 그대로 읽는다.
  if (block.kind === "chart" && block.chart) return { ...block.chart };
  // 평문은 늘 함께 둔다 — 편집 · 검색 · 잠금 비교가 이걸 본다.
  return block.runs ? { text: block.text, runs: block.runs } : { text: block.text };
}

export class GenerationService {
  readonly #sql: postgres.Sql;
  readonly #consent: ConsentService | null;
  constructor(sql: postgres.Sql, consent?: ConsentService | null) {
    this.#sql = sql;
    this.#consent = consent ?? null;
  }

  async submit(userId: string, idempotencyKey: string, input: SubmitGeneration) {
    const hash = requestHash(input);
    const jobId = await this.#sql.begin(async (transaction) => {
      const recipe = (await transaction<{ id: string; brew_id: string }[]>`
        select id, brew_id from recipe where id = ${input.recipeId} and user_id = ${userId}
      `)[0];
      if (!recipe) throw new GenerationError(404, "recipe not found");
      const template = (await transaction<{ id: string }[]>`select id from template where id = ${input.templateId} and is_active`)[0];
      if (!template) throw new GenerationError(404, "template not found");
      const inserted = (await transaction<{ id: string; request_hash: string }[]>`
        insert into generation_job (
          user_id, brew_id, recipe_id, template_id, status,
          input_idempotency_key, request_hash, style_overrides
        ) values (
          ${userId}, ${recipe.brew_id}, ${input.recipeId}, ${input.templateId}, 'queued',
          ${idempotencyKey}, ${hash},
          ${transaction.json((input.styleOverrides ?? {}) as postgres.JSONValue)}
        ) on conflict (user_id, input_idempotency_key)
          where input_idempotency_key is not null
        do nothing returning id, request_hash
      `)[0] ?? (await transaction<{ id: string; request_hash: string }[]>`
        select id, request_hash from generation_job
        where user_id = ${userId} and input_idempotency_key = ${idempotencyKey}
      `)[0];
      if (!inserted) throw new Error("generation job missing");
      if (inserted.request_hash !== hash) throw new GenerationError(409, "idempotency key reused for another generation");
      await addOutboxEvent(transaction, {
        topic: "portfolio.generate",
        payload: { generationJobId: inserted.id, userId },
        idempotencyKey: `portfolio-generation:${inserted.id}`,
      });
      return inserted.id;
    });
    return this.getStatus(userId, jobId);
  }

  /** 이 추출이 누구에게 보내는 것인지. 문장과 지면이 같은 값을 본다. */
  async #subject(job: JobRow): Promise<BrewSubjectRow | null> {
    return (await this.#sql<BrewSubjectRow[]>`
      select job_posting.title as job_title, job_posting.job_family,
             company.name as company_name, company.industry, company.tone_summary,
             company.brand_colors
      from brew
      join job_analysis on job_analysis.id = brew.job_analysis_id
        and job_analysis.user_id = brew.user_id
      join job_posting on job_posting.id = job_analysis.job_posting_id
      join company on company.id = job_posting.company_id
      where brew.user_id = ${job.user_id} and brew.id = ${job.brew_id}
    `)[0] ?? null;
  }

  /**
   * 지면 초안을 받아 온다. **실패해도 던지지 않는다** — 지면이 없으면 기본
   * 배치로 그려지지만, 여기서 던지면 문장까지 통째로 날아간다.
   */
  async #design(
    designer: LayoutDesigner,
    job: JobRow,
    subject: BrewSubjectRow | null,
    context: WriterContext,
    output: GenerationOutput,
    sectionIds: string[],
  ) {
    try {
      const titles = new Map(context.sections.map((section) => [section.recipeSectionId, section.title]));
      const design: LayoutDesignContext = {
        // 블록 번호는 `output.blocks`의 자리다 — 아래 적재 순서와 같아야
        // 초안이 가리킨 번호가 실제 블록에 닿는다.
        sections: sectionIds.map((sectionId) => ({
          title: titles.get(sectionId) ?? "",
          blocks: output.blocks.flatMap((block, index) =>
            block.recipeSectionId === sectionId
              ? [{
                number: index + 1,
                kind: block.kind,
                preview: block.chart ? block.chart.caption : block.text,
                length: [...block.text].length,
              }]
              : []),
        })),
        company: subject
          ? {
            name: subject.company_name,
            industry: subject.industry,
            toneSummary: subject.tone_summary,
            brandColors: subject.brand_colors,
          }
          : null,
        jobTitle: subject?.job_title ?? null,
        jobFamily: subject?.job_family ?? null,
      };

      // 이 값은 지연 예산이 아니라 **멈춘 프로바이더**를 막는 backstop이다.
      // 실제 한계는 어댑터가 쥐고 있고(claude-code 기본 180초), 재시도까지
      // 하면 두 배가 되므로 여기서 먼저 끊으면 재시도가 잘린다.
      await this.#consent?.require(job.user_id, "layout_draft");
      return await withTimeout(designer.design(design), 420_000, "layout designer");
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "layout.design_failed",
        generationJobId: job.id,
        message: error instanceof Error ? error.message : String(error),
      }));
      return [];
    }
  }

  async getStatus(userId: string, jobId: string) {
    const job = (await this.#sql<JobRow[]>`select * from generation_job where id = ${jobId} and user_id = ${userId}`)[0];
    if (!job) throw new GenerationError(404, "generation job not found");
    return GenerationJobStatusSchema.parse({
      generationJobId: job.id, status: job.status, stage: job.stage,
      attempts: job.attempts, usageCharged: job.usage_charged,
      portfolioId: job.portfolio_id,
      failure: job.error_code ? { code: job.error_code, retryable: job.failure_retryable ?? false } : null,
    });
  }

  /**
   * 추출 한 번이 **문장과 지면을 함께** 만든다(§8.3). 지면 쪽은 없어도 되는
   * 것이라 `designer`가 없거나 실패하면 문장만 남기고 넘어간다 — 지면이 없는
   * 포트폴리오는 기본 배치로 그려지지만, 생성 자체가 실패하면 아무것도 남지
   * 않는다.
   */
  async process(jobId: string, writer: SentenceWriter, designer?: LayoutDesigner | null) {
    try {
      const job = await this.#sql.begin(async (transaction) => {
        const locked = (await transaction<JobRow[]>`select * from generation_job where id = ${jobId} for update`)[0];
        if (!locked) throw new GenerationError(404, "generation job not found");
        if (locked.status === "done") return locked;
        await transaction`update generation_job set status = 'running', stage = 'validating', attempts = attempts + 1, error_code = null, failure_retryable = null, updated_at = now() where id = ${jobId}`;
        return { ...locked, attempts: locked.attempts + 1 };
      });
      if (job.status === "done") return this.getStatus(job.user_id, job.id);
      const items = await this.#sql<ContextRow[]>`
        select recipe_section.id as section_id, recipe_section.title as section_title,
               recipe_section.purpose as section_purpose, recipe_section.target_length,
               recipe_item.id as item_id, recipe_item.point_text, recipe_section.context
        from recipe_section join recipe_item on recipe_item.recipe_section_id = recipe_section.id
        where recipe_section.user_id = ${job.user_id} and recipe_section.recipe_id = ${job.recipe_id}
        order by recipe_section.order_no, recipe_item.order_no
      `;
      // 근거는 라벨만으로 부족하다 — 수치는 기록 본문에 있고, 검증기가 그걸 본다.
      const evidence = await this.#sql<PathRow[]>`
        select path.id, path.recipe_item_id, path.source_type, path.source_id, path.source_label,
               coalesce(
                 nullif(concat_ws(E'\n', record.title, record.body_md), ''),
                 answer.transcript,
                 nullif(concat_ws(E'\n', requirement.label, requirement.source_span ->> 'quote'), ''),
                 ''
               ) as source_text
        from recipe_evidence_path path
        left join record
          on record.id = path.source_id and path.source_type = 'record'
        left join answer
          on answer.id = path.source_id and path.source_type = 'answer'
        left join job_posting_requirement requirement
          on requirement.id = path.source_id and path.source_type = 'requirement'
        where path.user_id = ${job.user_id} and path.recipe_id = ${job.recipe_id}
        order by path.created_at, path.id
      `;
      const locked = job.portfolio_id ? await this.#sql<{ text: string }[]>`
        select block.content ->> 'text' as text from block
        join portfolio_section on portfolio_section.id = block.portfolio_section_id
        where block.user_id = ${job.user_id} and portfolio_section.portfolio_id = ${job.portfolio_id} and block.locked
      ` : [];
      // 계약을 부르는 경로에만 문이 있다. 규칙 폴백은 지나지 않는다.
      if (writer.usesContract) await this.#consent?.require(job.user_id, "generation");
      const subject = await this.#subject(job);
      const context = buildWriterContext({
        items,
        evidence,
        subject,
        lockedTexts: locked.flatMap(({ text }) => (text ? [text] : [])),
      });
      const output = validateGenerationOutput(
        await withTimeout(writer.write(context), 420_000, "sentence writer"),
        evidence.map(({ id, source_type, source_label, source_text }) => ({
          id, sourceType: source_type, sourceLabel: source_label, sourceText: source_text,
        })),
        items.flatMap(({ context: sectionContext }) => sectionContext.exclude ?? []),
        context.lockedTexts,
      );
      // 섹션 순서는 여기서 정해진다 — 아래 txn이 이 순서로 portfolio_section을
      // 만들고, 지면 초안의 섹션 번호도 이 순서를 가리킨다.
      const sectionIds = [...new Set(output.blocks.map(({ recipeSectionId }) => recipeSectionId))];
      const layouts = designer
        ? await this.#design(designer, job, subject, context, output, sectionIds)
        : [];
      await this.#sql.begin(async (transaction) => {
        const current = (await transaction<JobRow[]>`select * from generation_job where id = ${jobId} for update`)[0];
        if (!current || current.status === "done") return;
        await transaction`select id from "user" where id = ${current.user_id} for update`;
        const decision = await new EntitlementService(transaction).check(current.user_id, "portfolio.generate");
        if (!decision.allowed || !decision.usage) throw new GenerationError(409, "generation quota is exhausted");
        await transaction`update generation_job set stage = 'materializing' where id = ${jobId}`;
        let portfolioId = current.portfolio_id;
        if (!portfolioId) {
          portfolioId = (await transaction<{ id: string }[]>`
            insert into portfolio (
              user_id, brew_id, template_id, title, status, style_overrides
            ) values (
              ${current.user_id}, ${current.brew_id}, ${current.template_id},
              'Generated portfolio', 'draft',
              ${transaction.json((current.style_overrides ?? {}) as postgres.JSONValue)}
            ) returning id
          `)[0]?.id ?? null;
        }
        if (!portfolioId) throw new Error("portfolio missing");
        const lockedCount = Number((await transaction<{ count: number }[]>`
          select count(*)::integer as count from block join portfolio_section on portfolio_section.id = block.portfolio_section_id
          where block.user_id = ${current.user_id} and portfolio_section.portfolio_id = ${portfolioId} and block.locked
        `)[0]?.count ?? 0);
        if (lockedCount === 0) await transaction`delete from portfolio_section where user_id = ${current.user_id} and portfolio_id = ${portfolioId}`;
        const sectionMap = new Map<string, string>();
        for (const [order, recipeSectionId] of sectionIds.entries()) {
          const id = (await transaction<{ id: string }[]>`
            insert into portfolio_section (user_id, portfolio_id, recipe_section_id, order_no)
            values (${current.user_id}, ${portfolioId}, ${recipeSectionId}, ${order})
            on conflict (user_id, portfolio_id, recipe_section_id)
              do update set order_no = excluded.order_no returning id
          `)[0]?.id;
          if (id) sectionMap.set(recipeSectionId, id);
        }
        // 초안이 가리키는 블록 번호(1부터)를 실제 식별자로 되돌릴 표.
        // 자리를 비워 두는 것이 중요하다 — 적재하지 못한 블록이 있어도 뒤
        // 블록의 번호가 밀리면 안 된다.
        const blockIds: (string | null)[] = output.blocks.map(() => null);
        for (const [blockOrder, generated] of output.blocks.entries()) {
          const portfolioSectionId = sectionMap.get(generated.recipeSectionId);
          if (!portfolioSectionId) continue;
          const paths = evidence.filter(({ id }) => generated.evidencePathIds.includes(id));
          const recordPath = paths.find(({ source_type }) => source_type === "record");
          const blockId = (await transaction<{ id: string }[]>`
            insert into block (user_id, portfolio_section_id, kind, content, source_record_id, order_no)
            values (${current.user_id}, ${portfolioSectionId}, ${generated.kind},
                    ${transaction.json(blockContent(generated) as postgres.JSONValue)},
                    ${recordPath?.source_id ?? null}, ${blockOrder}) returning id
          `)[0]?.id;
          if (!blockId) throw new Error("block missing");
          blockIds[blockOrder] = blockId;
          for (const path of paths) await transaction`
            insert into generation_sentence_evidence (user_id, generation_job_id, block_id, recipe_evidence_path_id, source_quote)
            values (${current.user_id}, ${jobId}, ${blockId}, ${path.id}, ${path.source_label})
          `;
          if (recordPath) await transaction`
            insert into record_usage (user_id, record_id, block_id, quoted_text)
            values (${current.user_id}, ${recordPath.source_id}, ${blockId}, ${recordPath.source_label}) on conflict do nothing
          `;
        }
        // 지면 후보를 남긴다. 03이 셋을 나란히 놓고, 고를 때까지는 1안이 붙는다.
        if (layouts.length > 0) {
          const specs = toLayoutSpecs(
            layouts,
            sectionIds.map((id) => sectionMap.get(id) ?? ""),
            blockIds,
          );
          const batchId = randomUUID();
          // 새 배치가 자리를 넘겨받는다. 옛 후보는 지우지 않고 선택만 내려놓는다.
          await transaction`
            update layout_spec set selected = false
            where user_id = ${current.user_id} and portfolio_id = ${portfolioId} and selected
          `;
          for (const [order, spec] of specs.entries()) await transaction`
            insert into layout_spec (
              user_id, portfolio_id, batch_id, generation_job_id, spec, prompt_version,
              order_no, selected
            ) values (
              ${current.user_id}, ${portfolioId}, ${batchId}, ${jobId},
              ${transaction.json(spec as unknown as postgres.JSONValue)},
              ${LAYOUT_PROMPT_VERSION}, ${order}, ${order === 0}
            )
          `;
        }
        await transaction`update generation_job set stage = 'charging' where id = ${jobId}`;
        const usage = (await transaction<{ id: string }[]>`
          insert into usage_counter (user_id, period_start, used, resets_at)
          values (${current.user_id}, ${decision.usage.periodStart}, 1, ${decision.usage.resetsAt})
          on conflict (user_id, period_start) do update set used = usage_counter.used + 1, resets_at = excluded.resets_at
          returning id
        `)[0];
        if (!usage) throw new Error("usage counter missing");
        await transaction`
          insert into generation_usage_ledger (user_id, generation_job_id, usage_counter_id, amount, reason)
          values (${current.user_id}, ${jobId}, ${usage.id}, 1, 'success') on conflict do nothing
        `;
        const snapshotSections = await transaction<{
          id: string; recipe_section_id: string | null; order_no: number; visible: boolean;
        }[]>`
          select id, recipe_section_id, order_no, visible from portfolio_section
          where user_id = ${current.user_id} and portfolio_id = ${portfolioId}
          order by order_no
        `;
        const snapshotBlocks = await transaction<{
          id: string; portfolio_section_id: string; kind: string;
          content: Record<string, unknown>; style: Record<string, unknown>;
          source_record_id: string | null; sync_state: string; locked: boolean;
        }[]>`
          select block.* from block join portfolio_section on portfolio_section.id = block.portfolio_section_id
          where block.user_id = ${current.user_id} and portfolio_section.portfolio_id = ${portfolioId}
          order by portfolio_section.order_no, block.order_no, block.id
        `;
        const snapshot = {
          portfolioId,
          sections: snapshotSections.map((section) => ({
            id: section.id,
            recipeSectionId: section.recipe_section_id,
            order: section.order_no,
            visible: section.visible,
            blocks: snapshotBlocks.filter((block) => block.portfolio_section_id === section.id).map((block) => ({
              id: block.id, kind: block.kind, content: block.content, style: block.style,
              sourceRecordId: block.source_record_id, syncState: block.sync_state,
              locked: block.locked,
            })),
          })),
        };
        await transaction`insert into portfolio_snapshot (user_id, portfolio_id, kind, snapshot) values (${current.user_id}, ${portfolioId}, 'initial_generation', ${transaction.json(snapshot as postgres.JSONValue)})`;
        await transaction`update generation_job set status = 'done', stage = 'done', usage_charged = true, portfolio_id = ${portfolioId}, updated_at = now() where id = ${jobId}`;
      });
      return this.getStatus(job.user_id, job.id);
    } catch (error) {
      const retryable = !(error instanceof GenerationValidationError
        || error instanceof GenerationError
        || error instanceof SentenceWriterUnavailableError);
      const code = error instanceof GenerationValidationError
        ? "EVIDENCE_INVALID"
        : error instanceof GenerationError
          ? "GENERATION_REJECTED"
          // 다시 시도해도 같다 — 프로바이더가 켜지기 전에는 쓸 방법이 없다.
          : error instanceof SentenceWriterUnavailableError
            ? "WRITER_UNAVAILABLE"
            : "PROVIDER_FAILED";
      await this.#sql.begin(async (transaction) => {
        const job = (await transaction<JobRow[]>`select * from generation_job where id = ${jobId} for update`)[0];
        if (!job || job.status === "done") return;
        let portfolioId = job.portfolio_id;
        if (!portfolioId) portfolioId = (await transaction<{ id: string }[]>`
          insert into portfolio (
            user_id, brew_id, template_id, title, status, style_overrides
          ) values (
            ${job.user_id}, ${job.brew_id}, ${job.template_id}, 'Failed generation draft',
            'draft', ${transaction.json((job.style_overrides ?? {}) as postgres.JSONValue)}
          ) returning id
        `)[0]?.id ?? null;
        await transaction`update generation_job set status = 'failed', stage = 'failed', error_code = ${code}, failure_retryable = ${retryable}, portfolio_id = ${portfolioId}, updated_at = now() where id = ${jobId}`;
      }).catch(() => undefined);
      throw error;
    }
  }
}
