import {
  PortfolioPlanSchema,
  RecipeEditResultSchema,
  RecipeSchema,
  type RecipeEdit,
} from "@expresso/contracts";
import type { SqlTag, JSONValue } from "../../platform/mysql.js";

import {
  DeterministicRecipePlanner,
  RECIPE_PROMPT_VERSION,
  type PlannerContext,
  type PlannerSource,
  type RecipePlanner,
} from "./planner.js";
import { withTimeout } from "../../platform/timeouts.js";
import type { ConsentService } from "../consent/service.js";

interface IdRow { id: string }
interface RecipeRow {
  id: string; brew_id: string; version: number; status: "draft" | "confirmed";
  completeness: string | number; portfolio_plan: unknown; planning_manifest: unknown;
  updated_at: Date | string;
}
interface SectionRow {
  id: string; order_no: number; title: string; purpose: string; target_length: number;
  context: { goal: string; points: string[]; metrics: string[]; format: string; tone: string; exclude: string[] };
  locked: boolean; edited_by: "ai" | "user";
}
interface ItemRow {
  id: string; recipe_section_id: string; order_no: number; point_text: string;
  locked: boolean; edited_by: "ai" | "user";
}
interface PathRow {
  id: string; source_type: "requirement" | "record" | "answer"; source_id: string;
  source_label: string; recipe_item_id: string; target_path: string;
}
/** 분량 프리셋이 정하는 전체 글자 수. 섹션 나누기는 계약이 한다. */
const TOTAL_LENGTH = { single: 900, double: 1_800, triple: 2_700 } as const;

export class RecipeError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message); this.name = "RecipeError"; this.statusCode = statusCode;
  }
}

const DEFAULT_CONTEXT = {
  goal: "선택한 근거로 핵심 경험을 설명",
  points: [] as string[],
  metrics: [] as string[],
  format: "narrative",
  tone: "professional",
  exclude: ["근거 없는 수치", "출처 없는 주장"],
};

export class RecipeService {
  readonly #sql: SqlTag;
  readonly #planner: RecipePlanner;
  readonly #promptVersion: number;
  readonly #consent: ConsentService | null;

  constructor(sql: SqlTag, planner?: RecipePlanner | null, consent?: ConsentService | null) {
    this.#sql = sql;
    this.#consent = consent ?? null;
    // AI가 없으면 규칙 구현이 그대로 쓰인다 — 죽은 코드가 아니라 폴백이다.
    this.#planner = planner ?? new DeterministicRecipePlanner();
    // 규칙 폴백이 낸 것은 계약의 산출물이 아니다. 0으로 남겨 가려낸다.
    this.#promptVersion = planner ? RECIPE_PROMPT_VERSION : 0;
  }

  async generate(userId: string, brewId: string, idempotencyKey: string) {
    const replayed = (await this.#sql<IdRow[]>`
      select id from recipe where user_id = ${userId} and input_idempotency_key = ${idempotencyKey}
    `)[0];
    if (replayed) return this.getRecipe(userId, replayed.id);

    // 계약 호출은 트랜잭션 **밖**이다. 몇 분이 걸리는 일이라 안에서 부르면
    // 그동안 brew 행을 잠근 채로 커넥션을 붙들고 있게 된다.
    // 규칙 폴백(promptVersion 0)은 아무것도 밖으로 보내지 않는다. 묻지 않는다.
    if (this.#promptVersion > 0) await this.#consent?.require(userId, "recipe_draft");
    const { context, brew } = await this.#plannerContext(userId, brewId);
    const planned = await withTimeout(this.#planner.plan(context), 420_000, "recipe planner");
    const { draft } = planned;

    const recipeId = await this.#sql.begin(async (transaction) => {
      const replay = (await transaction<IdRow[]>`
        select id from recipe where user_id = ${userId} and input_idempotency_key = ${idempotencyKey}
      `)[0];
      if (replay) return replay.id;
      const version = Number((await transaction<{ version: number }[]>`
        select coalesce(max(version), 0) + 1 as version
        from recipe where user_id = ${userId} and brew_id = ${brewId}
      `)[0]?.version ?? 1);
      const recipe = (await transaction<IdRow[]>`
        insert into recipe (
          user_id, brew_id, version, status, completeness,
          input_idempotency_key, prompt_version
        ) values (
          ${userId}, ${brewId}, ${version}, 'draft', 100,
          ${idempotencyKey}, ${this.#promptVersion}
        ) returning id
      `)[0];
      if (!recipe) throw new Error("recipe was not persisted");

      const citedNumbers = new Set<number>();
      const plannedSections: Array<{
        id: string; title: string; purpose: string; takeaway: string;
        evidenceIds: string[]; contentPattern: typeof draft.sections[number]["contentPattern"];
        interactionOpportunity: string | null; targetLength: number;
      }> = [];
      for (const [order, section] of draft.sections.entries()) {
        const sectionId = (await transaction<IdRow[]>`
          insert into recipe_section (
            user_id, recipe_id, order_no, title, purpose, target_length, context
          ) values (
            ${userId}, ${recipe.id}, ${order}, ${section.title}, ${section.purpose},
            ${section.targetLength},
            ${transaction.json({
              goal: section.goal,
              points: section.points,
              metrics: section.metrics,
              format: section.format,
              tone: section.tone,
              exclude: section.exclude,
              takeaway: section.takeaway,
              contentPattern: section.contentPattern,
              interactionOpportunity: section.interactionOpportunity,
            } as JSONValue)}
          ) returning id
        `)[0]?.id;
        if (!sectionId) throw new Error("recipe section missing");

        const sectionEvidenceIds = new Set<string>();
        for (const [itemOrder, item] of section.items.entries()) {
          // 없는 번호를 가리키는 근거는 버린다. 근거가 하나도 없으면 항목을 버린다 —
          // 근거 없는 항목은 `recipe_item`의 CHECK가 애초에 받지 않는다.
          const cited = [...new Set(item.sources)]
            .flatMap((number) => {
              const source = context.sources[number - 1];
              return source ? [{ number, source }] : [];
            });
          if (cited.length === 0) continue;
          for (const { number, source } of cited) {
            citedNumbers.add(number);
            sectionEvidenceIds.add(source.id);
          }

          const itemId = (await transaction<IdRow[]>`
            insert into recipe_item (
              user_id, recipe_section_id, order_no, point_text, evidence, edited_by
            ) values (
              ${userId}, ${sectionId}, ${itemOrder}, ${item.pointText},
              ${transaction.json(cited.map(({ source }) =>
                ({ sourceType: source.type, sourceId: source.id })) as JSONValue)},
              'ai'
            ) returning id
          `)[0]?.id;
          if (!itemId) throw new Error("recipe item missing");

          for (const { source } of cited) await transaction`
            insert ignore into recipe_evidence_path (
              user_id, recipe_id, recipe_item_id, source_type,
              source_id, source_label, target_path
            ) values (
              ${userId}, ${recipe.id}, ${itemId}, ${source.type}, ${source.id},
              ${source.label.slice(0, 5_000)},
              ${`sections[${order}].items[${itemOrder}]`}
            )
          `;
        }
        if (sectionEvidenceIds.size > 0) {
          plannedSections.push({
            id: sectionId,
            title: section.title,
            purpose: section.purpose,
            takeaway: section.takeaway,
            evidenceIds: [...sectionEvidenceIds],
            contentPattern: section.contentPattern,
            interactionOpportunity: section.interactionOpportunity,
            targetLength: section.targetLength,
          });
        }
      }

      // 안 쓴 기록은 이유와 함께 남긴다. 계약이 이유를 냈으면 그걸 쓰고,
      // 빠뜨렸으면 우리가 채운다 — 02b는 빈 칸이 아니라 이유를 보여줘야 한다.
      const reasons = new Map(draft.unused.map(({ source, reason }) => [source, reason]));
      for (const [index, source] of context.sources.entries()) {
        if (source.type !== "record" || citedNumbers.has(index + 1)) continue;
        await transaction`
          insert ignore into recipe_unused_source (user_id, recipe_id, record_id, reason)
          values (
            ${userId}, ${recipe.id}, ${source.id},
            ${reasons.get(index + 1) ?? "이번 공고에서 우선순위가 높은 근거를 먼저 배치함"}
          )   
        `;
      }

      const sourceAt = (number: number) => context.sources[number - 1];
      const portfolioPlan = PortfolioPlanSchema.parse({
        version: 1,
        target: {
          company: context.company?.name ?? "지원 회사",
          role: context.jobTitle ?? "지원 직무",
          primaryReaders: ["채용 담당자", "실무 리드"],
          decisionGoal: "실제 근거를 바탕으로 인터뷰 대상으로 판단하게 한다",
        },
        positioning: draft.plan.positioning,
        requirementCoverage: draft.plan.requirementCoverage.flatMap((entry) => {
          const requirement = sourceAt(entry.requirementSource);
          if (!requirement || requirement.type !== "requirement") return [];
          return [{
            requirementId: requirement.id,
            requirementLabel: requirement.label,
            priority: entry.priority,
            evidenceIds: entry.evidenceSources.flatMap((number) => {
              const source = sourceAt(number);
              return source && (source.type === "record" || source.type === "answer")
                ? [source.id]
                : [];
            }),
            coverage: entry.coverage,
            reason: entry.reason,
          }];
        }),
        narrative: {
          arc: draft.plan.narrativeArc,
          sectionOrder: plannedSections.map(({ id }) => id),
        },
        sections: plannedSections,
        claims: draft.plan.claims.map((claim, index) => ({
          id: `claim-${index + 1}`,
          intent: claim.intent,
          evidenceIds: claim.evidenceSources.flatMap((number) => {
            const source = sourceAt(number);
            return source && (source.type === "record" || source.type === "answer")
              ? [source.id]
              : [];
          }),
          allowedNumbers: claim.allowedNumbers,
        })),
        exclusions: draft.plan.exclusions,
        unusedEvidence: draft.unused.flatMap(({ source, reason }) => {
          const entry = sourceAt(source);
          return entry?.type === "record" ? [{ evidenceId: entry.id, reason }] : [];
        }),
        companyContext: context.companyResearch,
        rationale: draft.plan.rationale,
      });
      const planningManifest = {
        methodologyVersion: 1 as const,
        model: planned.usage?.model ?? null,
        promptVersion: this.#promptVersion,
        attempts: planned.attempts,
        sourceCounts: {
          records: context.sources.filter(({ type }) => type === "record").length,
          requirements: context.sources.filter(({ type }) => type === "requirement").length,
          answers: context.sources.filter(({ type }) => type === "answer").length,
          companyResearch: context.companyResearch.length,
        },
        sourceUrls: [...new Set(context.companyResearch.flatMap(({ sourceUrl }) =>
          sourceUrl ? [sourceUrl] : []))],
        usage: planned.usage
          ? {
            inputTokens: planned.usage.inputTokens,
            outputTokens: planned.usage.outputTokens,
            cacheReadTokens: planned.usage.cacheReadTokens,
            cacheCreationTokens: planned.usage.cacheCreationTokens,
            durationMs: planned.usage.durationMs,
            costUsd: planned.usage.costUsd,
          }
          : null,
      };
      await transaction`
        update recipe set
          portfolio_plan = ${transaction.json(portfolioPlan as JSONValue)},
          planning_manifest = ${transaction.json(planningManifest as JSONValue)}
        where user_id = ${userId} and id = ${recipe.id}
      `;

      await transaction`update brew set status = 'recipe', updated_at = now(6) where id = ${brew.id}`;
      return recipe.id;
    });
    return this.getRecipe(userId, recipeId);
  }

  /**
   * 계약에 넘길 재료를 모은다.
   *
   * 배열 순서가 곧 번호(1부터)이고, 모델은 그 번호로만 가리킨다. 기록이 먼저인
   * 것은 그것이 이 사람의 실제 재료이기 때문이다 — 요건과 답변은 그 재료를
   * 어디에 놓을지 정하는 맥락이다.
   */
  async #plannerContext(userId: string, brewId: string) {
    const sql = this.#sql;
    const brew = (await sql<{ id: string; job_analysis_id: string; length_preset: keyof typeof TOTAL_LENGTH }[]>`
      select id, job_analysis_id, length_preset from brew
      where id = ${brewId} and user_id = ${userId}
    `)[0];
    if (!brew) throw new RecipeError(404, "brew not found");

    const [records, requirements, answers, subject] = await Promise.all([
      sql<{ id: string; title: string; body_md: string }[]>`
        select record.id, record.title, coalesce(record.body_md, '') as body_md
        from brew_source
        join record on record.id = brew_source.record_id and record.user_id = brew_source.user_id
        where brew_source.user_id = ${userId} and brew_source.brew_id = ${brewId}
          and brew_source.is_selected
        order by brew_source.\`rank\`
        limit 8
      `,
      sql<{ id: string; label: string; kind: string; quote: string | null }[]>`
        select job_posting_requirement.id, job_posting_requirement.label,
               job_posting_requirement.kind,
               job_posting_requirement.source_span ->> '$.quote' as quote
        from job_analysis
        join job_posting_requirement
          on job_posting_requirement.job_posting_id = job_analysis.job_posting_id
        where job_analysis.id = ${brew.job_analysis_id} and job_analysis.user_id = ${userId}
        order by job_posting_requirement.order_no, job_posting_requirement.id
      `,
      sql<{ id: string; transcript: string; prompt: string }[]>`
        select answer.id, answer.transcript, question.text as prompt
        from answer
        join question on question.id = answer.question_id and question.user_id = answer.user_id
        join interview_session on interview_session.id = question.interview_session_id
          and interview_session.user_id = question.user_id
        where answer.user_id = ${userId} and interview_session.brew_id = ${brewId}
        order by question.order_no
        limit 6
      `,
      sql<{
        job_title: string; company_id: string; company_name: string;
        industry: string | null; tone_summary: string | null;
      }[]>`
        select job_posting.title as job_title, company.id as company_id, company.name as company_name,
               company.industry, company.tone_summary
        from job_analysis
        join job_posting on job_posting.id = job_analysis.job_posting_id
        join company on company.id = job_posting.company_id
        where job_analysis.id = ${brew.job_analysis_id} and job_analysis.user_id = ${userId}
      `,
    ]);

    const companyResearch = subject[0]
      ? await sql<{
        id: string; company_id: string; kind: "fact" | "signal"; topic: string;
        statement: string; source_url: string | null; published_at: Date | null;
        captured_at: Date; confidence: "low" | "medium" | "high"; basis_fact_ids: string[];
      }[]>`
        select * from company_research_item
        where user_id = ${userId} and company_id = ${subject[0].company_id}
        order by kind, captured_at desc, id
      `
      : [];

    const sources: PlannerSource[] = [
      ...records.map((row) => ({
        type: "record" as const, id: row.id, label: row.title, text: row.body_md,
      })),
      ...requirements.map((row) => ({
        type: "requirement" as const, id: row.id, label: row.label, text: row.quote ?? row.label,
      })),
      ...answers.map((row) => ({
        type: "answer" as const, id: row.id,
        label: row.prompt, text: row.transcript,
      })),
    ];
    if (sources.length < 3) throw new RecipeError(409, "at least three evidence sources are required");

    const context: PlannerContext = {
      sources,
      company: subject[0]
        ? {
          name: subject[0].company_name,
          industry: subject[0].industry,
          toneSummary: subject[0].tone_summary,
        }
        : null,
      jobTitle: subject[0]?.job_title ?? null,
      requirements: requirements.map(({ label, kind }) => ({ label, kind })),
      companyResearch: companyResearch.map((item) => ({
        id: item.id,
        companyId: item.company_id,
        kind: item.kind,
        topic: item.topic,
        statement: item.statement,
        sourceUrl: item.source_url,
        publishedAt: item.published_at?.toISOString() ?? null,
        capturedAt: item.captured_at.toISOString(),
        confidence: item.confidence,
        basisFactIds: item.basis_fact_ids,
      })),
      totalLength: TOTAL_LENGTH[brew.length_preset] ?? TOTAL_LENGTH.single,
    };
    return { context, brew };
  }

  async getRecipe(userId: string, recipeId: string) {
    return this.#loadRecipe(this.#sql, userId, recipeId);
  }

  async edit(userId: string, recipeId: string, edit: RecipeEdit) {
    let revisionId = "";
    let diff: Array<{ path: string; before?: unknown; after?: unknown }> = [];
    await this.#sql.begin(async (transaction) => {
      const before = await this.#loadRecipe(transaction, userId, recipeId, true);
      const sectionRows = await transaction<SectionRow[]>`
        select * from recipe_section where user_id = ${userId} and recipe_id = ${recipeId}
        order by order_no
      `;
      const sectionById = new Map(sectionRows.map((section) => [section.id, section]));
      if (edit.operation === "move_section") {
        if (!sectionById.has(edit.sectionId)) throw new RecipeError(404, "recipe section not found");
        const ids = sectionRows.map(({ id }) => id).filter((id) => id !== edit.sectionId);
        ids.splice(Math.min(edit.toOrder, ids.length), 0, edit.sectionId);
        await transaction`update recipe_section set order_no = order_no + 1000 where user_id = ${userId} and recipe_id = ${recipeId}`;
        for (const [order, id] of ids.entries()) await transaction`update recipe_section set order_no = ${order}, edited_by = 'user', locked = true where id = ${id}`;
        diff = [{ path: "sections.order", before: sectionRows.map(({ id }) => id), after: ids }];
      } else if (edit.operation === "add_section") {
        const section = (await transaction<IdRow[]>`
          insert into recipe_section (
            user_id, recipe_id, order_no, title, purpose, target_length,
            context, locked, edited_by
          ) values (
            ${userId}, ${recipeId}, ${sectionRows.length}, ${edit.title}, ${edit.purpose}, 300,
            ${transaction.json(DEFAULT_CONTEXT as JSONValue)}, true, 'user'
          ) returning id
        `)[0];
        diff = [{ path: `sections.${section?.id}`, after: edit.title }];
      } else if (edit.operation === "delete_section") {
        const section = sectionById.get(edit.sectionId);
        if (!section) throw new RecipeError(404, "recipe section not found");
        if (sectionRows.length === 1) throw new RecipeError(409, "recipe must keep one section");
        await transaction`delete from recipe_section where id = ${edit.sectionId} and user_id = ${userId}`;
        diff = [{ path: `sections.${edit.sectionId}`, before: section.title }];
      } else if (edit.operation === "update_item") {
        const item = (await transaction<ItemRow[]>`
          select recipe_item.* from recipe_item join recipe_section on recipe_section.id = recipe_item.recipe_section_id
          where recipe_item.id = ${edit.itemId} and recipe_item.user_id = ${userId}
            and recipe_section.recipe_id = ${recipeId} for update of recipe_item
        `)[0];
        if (!item) throw new RecipeError(404, "recipe item not found");
        await transaction`update recipe_item set point_text = ${edit.pointText}, locked = true, edited_by = 'user', updated_at = now(6) where id = ${item.id}`;
        diff = [{ path: `items.${item.id}.pointText`, before: item.point_text, after: edit.pointText }];
      } else if (edit.operation === "move_item") {
        const item = (await transaction<ItemRow[]>`
          select recipe_item.* from recipe_item join recipe_section on recipe_section.id = recipe_item.recipe_section_id
          where recipe_item.id = ${edit.itemId} and recipe_item.user_id = ${userId}
            and recipe_section.recipe_id = ${recipeId}
        `)[0];
        if (!item) throw new RecipeError(404, "recipe item not found");
        const items = await transaction<ItemRow[]>`select * from recipe_item where user_id = ${userId} and recipe_section_id = ${item.recipe_section_id} order by order_no`;
        const ids = items.map(({ id }) => id).filter((id) => id !== item.id);
        ids.splice(Math.min(edit.toOrder, ids.length), 0, item.id);
        await transaction`update recipe_item set order_no = order_no + 1000 where user_id = ${userId} and recipe_section_id = ${item.recipe_section_id}`;
        for (const [order, id] of ids.entries()) await transaction`update recipe_item set order_no = ${order}, locked = true, edited_by = 'user' where id = ${id}`;
        diff = [{ path: `sections.${item.recipe_section_id}.items.order`, before: items.map(({ id }) => id), after: ids }];
      } else if (edit.operation === "add_item") {
        if (!sectionById.has(edit.sectionId)) throw new RecipeError(404, "recipe section not found");
        const source = (await transaction<PathRow[]>`
          select * from recipe_evidence_path where id = ${edit.sourcePathId}
            and user_id = ${userId} and recipe_id = ${recipeId}
        `)[0];
        if (!source) throw new RecipeError(404, "recipe evidence path not found");
        const order = Number((await transaction<{ count: number }[]>`select count(*) as count from recipe_item where user_id = ${userId} and recipe_section_id = ${edit.sectionId}`)[0]?.count ?? 0);
        const item = (await transaction<IdRow[]>`
          insert into recipe_item (user_id, recipe_section_id, order_no, point_text, evidence, locked, edited_by)
          values (${userId}, ${edit.sectionId}, ${order}, ${edit.pointText}, ${transaction.json([{ sourceType: source.source_type, sourceId: source.source_id }] as JSONValue)}, true, 'user') returning id
        `)[0];
        if (!item) throw new Error("recipe item missing");
        await transaction`insert into recipe_evidence_path (user_id, recipe_id, recipe_item_id, source_type, source_id, source_label, target_path) values (${userId}, ${recipeId}, ${item.id}, ${source.source_type}, ${source.source_id}, ${source.source_label}, ${`sections.${edit.sectionId}.items.${item.id}`})`;
        diff = [{ path: `items.${item.id}`, after: edit.pointText }];
      } else if (edit.operation === "delete_item") {
        const item = (await transaction<ItemRow[]>`
          select recipe_item.* from recipe_item join recipe_section on recipe_section.id = recipe_item.recipe_section_id
          where recipe_item.id = ${edit.itemId} and recipe_item.user_id = ${userId} and recipe_section.recipe_id = ${recipeId}
        `)[0];
        if (!item) throw new RecipeError(404, "recipe item not found");
        await transaction`delete from recipe_item where id = ${item.id}`;
        diff = [{ path: `items.${item.id}`, before: item.point_text }];
      } else {
        const match = edit.instruction.match(/^(?:section|섹션)\s*(\d+)\s*(?:title|제목)\s*[:：]\s*(.+)$/i);
        if (!match) throw new RecipeError(409, "instruction is ambiguous; use 'section N title: ...'");
        const order = Number(match[1]) - 1;
        const section = sectionRows.find((item) => item.order_no === order);
        if (!section) throw new RecipeError(404, "instruction section not found");
        const title = match[2]!.trim();
        await transaction`update recipe_section set title = ${title}, locked = true, edited_by = 'user', updated_at = now(6) where id = ${section.id}`;
        diff = [{ path: `sections.${section.id}.title`, before: section.title, after: title }];
      }
      const revision = (await transaction<IdRow[]>`
        insert into recipe_revision (user_id, recipe_id, actor, action, snapshot, diff)
        values (${userId}, ${recipeId}, 'user', ${edit.operation}, ${transaction.json(before as JSONValue)}, ${transaction.json(diff as JSONValue)}) returning id
      `)[0];
      if (!revision) throw new Error("recipe revision missing");
      revisionId = revision.id;
      // 최근 50개만 남긴다. PostgreSQL 에서는 트리거가 하던 일인데, MySQL 트리거는
      // 자기 표를 지우지 못해 여기서 한다.
      const stale = await transaction<IdRow[]>`
        select id from recipe_revision
        where user_id = ${userId} and recipe_id = ${recipeId}
        order by created_at desc, id desc
        limit 18446744073709551615 offset 50
      `;
      if (stale.length > 0) {
        await transaction`delete from recipe_revision where id in ${transaction(stale.map(({ id }) => id))}`;
      }
      await transaction`update recipe set updated_at = now(6) where id = ${recipeId} and user_id = ${userId}`;
    });
    return RecipeEditResultSchema.parse({ recipe: await this.getRecipe(userId, recipeId), revisionId, diff });
  }

  async restoreItem(userId: string, recipeId: string, revisionId: string, itemId: string) {
    const revision = (await this.#sql<{ snapshot: { sections: Array<{ items: Array<{ id: string; pointText: string; locked: boolean; editedBy: string }> }> } }[]>`
      select snapshot from recipe_revision where id = ${revisionId} and user_id = ${userId} and recipe_id = ${recipeId}
    `)[0];
    const previous = revision?.snapshot.sections.flatMap(({ items }) => items).find(({ id }) => id === itemId);
    if (!previous) throw new RecipeError(404, "item is not present in revision snapshot");
    return this.edit(userId, recipeId, { operation: "update_item", itemId, pointText: previous.pointText });
  }

  async #loadRecipe(
    sql: SqlTag | SqlTag,
    userId: string,
    recipeId: string,
    forUpdate = false,
  ) {
    const recipes = forUpdate
      ? await sql<RecipeRow[]>`select * from recipe where id = ${recipeId} and user_id = ${userId} for update`
      : await sql<RecipeRow[]>`select * from recipe where id = ${recipeId} and user_id = ${userId}`;
    const recipe = recipes[0];
    if (!recipe) throw new RecipeError(404, "recipe not found");
    const sections = await sql<SectionRow[]>`select * from recipe_section where user_id = ${userId} and recipe_id = ${recipeId} order by order_no`;
    const items = await sql<ItemRow[]>`
      select recipe_item.* from recipe_item join recipe_section on recipe_section.id = recipe_item.recipe_section_id
      where recipe_item.user_id = ${userId} and recipe_section.recipe_id = ${recipeId}
      order by recipe_section.order_no, recipe_item.order_no
    `;
    const paths = await sql<PathRow[]>`select * from recipe_evidence_path where user_id = ${userId} and recipe_id = ${recipeId} order by target_path, id`;
    const mappedPaths = paths.map((path) => ({
      id: path.id, sourceType: path.source_type, sourceId: path.source_id,
      sourceLabel: path.source_label, recipeItemId: path.recipe_item_id,
      targetPath: path.target_path,
    }));
    const unused = await sql<{ record_id: string; reason: string }[]>`select record_id, reason from recipe_unused_source where user_id = ${userId} and recipe_id = ${recipeId} order by record_id`;
    return RecipeSchema.parse({
      id: recipe.id, brewId: recipe.brew_id, version: recipe.version,
      status: recipe.status, completeness: Number(recipe.completeness),
      sections: sections.map((section) => ({
        id: section.id, order: section.order_no, title: section.title,
        purpose: section.purpose, targetLength: section.target_length,
        context: section.context, locked: section.locked, editedBy: section.edited_by,
        items: items.filter((item) => item.recipe_section_id === section.id).map((item) => ({
          id: item.id, order: item.order_no, pointText: item.point_text,
          locked: item.locked, editedBy: item.edited_by,
          evidence: mappedPaths.filter((path) => path.recipeItemId === item.id),
        })),
      })),
      evidencePaths: mappedPaths,
      unusedSources: unused.map((row) => ({ recordId: row.record_id, reason: row.reason })),
      portfolioPlan: recipe.portfolio_plan,
      planningManifest: recipe.planning_manifest,
      updatedAt: new Date(recipe.updated_at).toISOString(),
    });
  }
}
