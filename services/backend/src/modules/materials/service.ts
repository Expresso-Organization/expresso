import { MaterialsError } from "./public.js";
export { MaterialsError } from "./public.js";
import {
  BrewMaterialsSchema,
  BrewStateSchema,
  type BrewMaterial,
  type CreateBrew,
  type CreateFreeBrew,
  type UpdateBrew,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import { rankMaterials, type MaterialRecord } from "./ranking.js";
import { EntitlementService } from "../entitlements/index.js";

/** 한 번에 담을 수 있는 재료 수. 자동 선택도 여기까지다. */
const SELECTION_LIMIT = 10;

interface AnalysisRow {
  id: string;
  status: string;
}

interface BrewRow {
  id: string;
  job_analysis_id: string;
  updated_at: Date | string;
}

interface RecordRow {
  id: string;
  title: string;
  status: "organized" | "verified";
  body_md: string;
  properties: Record<string, unknown>;
}

interface RequirementRow {
  label: string;
}

interface SourceRow {
  record_id: string;
  title: string;
  status: "organized" | "verified";
  score: number;
  rank: number;
  is_selected: boolean;
  selected_by: "auto" | "user";
  excluded_reason: string | null;
  category_name: string;
  category_icon: string;
  period_from: string | null;
  period_to: string | null;
  origin: "manual" | "ai" | "interview" | "import";
  reason_text: string;
}

function mapSource(row: SourceRow): BrewMaterial {
  return {
    recordId: row.record_id,
    title: row.title,
    status: row.status,
    score: row.score,
    rank: row.rank,
    selected: row.is_selected,
    selectedBy: row.selected_by,
    excludedReason: row.excluded_reason,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    origin: row.origin,
    reason: row.reason_text,
  };
}

export class MaterialsService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
    this.#sql = sql;
  }

  async createBrew(userId: string, input: CreateBrew) {
    const brewId = await this.#sql.begin(async (transaction) => {
      const analysis = (await transaction<AnalysisRow[]>`
        select id, status from job_analysis
        where id = ${input.jobAnalysisId} and user_id = ${userId}
        for update
      `)[0];
      if (!analysis) throw new MaterialsError(404, "job analysis not found");
      if (analysis.status !== "done") {
        throw new MaterialsError(409, "job analysis must be complete before selecting materials");
      }
      const records = await transaction<RecordRow[]>`
        select id, title, status, body_md, properties
        from record
        where user_id = ${userId}
          and deleted_at is null
          and status in ('organized', 'verified')
      `;
      const requirements = await transaction<RequirementRow[]>`
        select job_posting_requirement.label
        from job_analysis
        join job_posting_requirement
          on job_posting_requirement.job_posting_id = job_analysis.job_posting_id
        where job_analysis.id = ${input.jobAnalysisId}
          and job_analysis.user_id = ${userId}
        order by job_posting_requirement.order_no, job_posting_requirement.id
      `;
      const ranked = rankMaterials(records.map((record): MaterialRecord => ({
        id: record.id,
        title: record.title,
        status: record.status,
        text: `${record.title}\n${record.body_md}\n${JSON.stringify(record.properties)}`,
      })), requirements.map(({ label }) => label)).slice(0, 50);
      const brews = await transaction<{ id: string }[]>`
        insert into brew (user_id, job_analysis_id, length_preset)
        values (${userId}, ${input.jobAnalysisId}, ${input.lengthPreset})
        returning id
      `;
      const brew = brews[0];
      if (!brew) throw new Error("brew was not persisted");
      for (const [index, record] of ranked.entries()) {
        const selected = index < SELECTION_LIMIT;
        await transaction`
          insert into brew_source (
            user_id, brew_id, record_id, \`rank\`, selected_by,
            excluded_reason, score, reason_text, is_selected
          ) values (
            ${userId}, ${brew.id}, ${record.id}, ${index}, 'auto',
            ${selected ? null : "AUTO_LIMIT"}, ${record.score}, ${record.reason}, ${selected}
          )
        `;
      }
      return brew.id;
    });
    return this.getMaterials(userId, brewId);
  }

  async createFreeBrew(userId: string, input: CreateFreeBrew) {
    const brewId = await this.#sql.begin(async (transaction) => {
      const analyses = await transaction<{ id: string }[]>`
        insert into job_analysis (
          user_id, job_posting_id, input_type, status, progress_stage,
          analyzed_at, result_version, target_version
        ) values (
          ${userId}, null, 'free', 'done', 'done', now(6), 1, 1
        ) returning id
      `;
      const analysis = analyses[0];
      if (!analysis) throw new Error("free job analysis was not persisted");

      const records = await transaction<RecordRow[]>`
        select id, title, status, body_md, properties
        from record
        where user_id = ${userId}
          and deleted_at is null
          and status in ('organized', 'verified')
      `;
      const ranked = rankMaterials(records.map((record): MaterialRecord => ({
        id: record.id,
        title: record.title,
        status: record.status,
        text: `${record.title}\n${record.body_md}\n${JSON.stringify(record.properties)}`,
      })), [input.brief]).slice(0, 50);
      const brews = await transaction<{ id: string }[]>`
        insert into brew (user_id, job_analysis_id, free_title, free_brief, length_preset)
        values (${userId}, ${analysis.id}, ${input.title}, ${input.brief}, ${input.lengthPreset})
        returning id
      `;
      const brew = brews[0];
      if (!brew) throw new Error("free brew was not persisted");
      for (const [index, record] of ranked.entries()) {
        const selected = index < SELECTION_LIMIT;
        await transaction`
          insert into brew_source (
            user_id, brew_id, record_id, \`rank\`, selected_by,
            excluded_reason, score, reason_text, is_selected
          ) values (
            ${userId}, ${brew.id}, ${record.id}, ${index}, 'auto',
            ${selected ? null : "AUTO_LIMIT"}, ${record.score}, ${record.reason}, ${selected}
          )
        `;
      }
      return brew.id;
    });
    return this.getMaterials(userId, brewId);
  }

  /**
   * 위저드가 자기 자리를 되찾는 데 필요한 것.
   *
   * 01b·02b는 brewId 하나만 들고 열린다 — 어느 세션인지, 레시피가 있는지,
   * 지금 만들어지는 중인지를 여기서 한 번에 읽는다.
   */
  async getState(userId: string, brewId: string) {
    const sql = this.#sql;
    const brew = (await sql<{
      id: string; job_analysis_id: string; status: string;
      length_preset: "single" | "double" | "triple"; updated_at: Date | string;
      free_title: string | null; free_brief: string | null;
    }[]>`
      select id, job_analysis_id, status, length_preset, free_title, free_brief, updated_at
      from brew where id = ${brewId} and user_id = ${userId}
    `)[0];
    if (!brew) throw new MaterialsError(404, "brew not found");

    const [posting, materials, session, recipe, portfolio, job, generation] = await Promise.all([
      sql<{ title: string; company_name: string }[]>`
        select job_posting.title, company.name as company_name
        from job_analysis
        join job_posting on job_posting.id = job_analysis.job_posting_id
        join company on company.id = job_posting.company_id
        where job_analysis.id = ${brew.job_analysis_id} and job_analysis.user_id = ${userId}
      `,
      sql<{ selected: number; total: number }[]>`
        select count(case when is_selected then 1 end) as selected,
               count(*) as total
        from brew_source where user_id = ${userId} and brew_id = ${brewId}
      `,
      sql<{ id: string }[]>`
        select id from interview_session where user_id = ${userId} and brew_id = ${brewId}
      `,
      // 레시피는 판을 거듭한다. 위저드는 최신판을 본다.
      sql<{ id: string }[]>`
        select id from recipe where user_id = ${userId} and brew_id = ${brewId}
        order by version desc limit 1
      `,
      // 재추출하면 포트폴리오가 하나 더 생긴다. 03은 마지막으로 만든 것을 연다.
      sql<{ id: string }[]>`
        select id from portfolio where user_id = ${userId} and brew_id = ${brewId}
        order by created_at desc limit 1
      `,
      sql<{
        id: string; type: "interview" | "recipe";
        status: "queued" | "running" | "succeeded" | "failed";
        stage: string; attempts: number; result_id: string | null;
        error_code: string | null; failure_retryable: boolean | null;
      }[]>`
        select id, type, status, stage, attempts, result_id, error_code, failure_retryable
        from brew_job
        where user_id = ${userId} and input ->> '$.brewId' = ${brewId}
        order by created_at desc limit 1
      `,
      sql<{
        id: string; status: "queued" | "running" | "done" | "failed";
        stage: "queued" | "validating" | "materializing" | "charging" | "done" | "failed";
        portfolio_id: string | null; error_code: string | null;
      }[]>`
        select id, status, stage, portfolio_id, error_code
        from generation_job
        where user_id = ${userId} and brew_id = ${brewId}
        order by created_at desc limit 1
      `,
    ]);

    return BrewStateSchema.parse({
      brewId: brew.id,
      jobAnalysisId: brew.job_analysis_id,
      status: brew.status,
      lengthPreset: brew.length_preset,
      freeTitle: brew.free_title,
      freeBrief: brew.free_brief,
      posting: posting[0]
        ? { title: posting[0].title, companyName: posting[0].company_name }
        : null,
      materials: {
        selected: materials[0]?.selected ?? 0,
        total: materials[0]?.total ?? 0,
      },
      interviewSessionId: session[0]?.id ?? null,
      recipeId: recipe[0]?.id ?? null,
      portfolioId: portfolio[0]?.id ?? null,
      latestJob: job[0]
        ? {
          jobId: job[0].id,
          type: job[0].type,
          status: job[0].status,
          stage: job[0].stage,
          attempts: job[0].attempts,
          resultId: job[0].result_id,
          failure: job[0].error_code
            ? { code: job[0].error_code, retryable: job[0].failure_retryable ?? false }
            : null,
        }
        : null,
      latestGeneration: generation[0]
        ? {
          id: generation[0].id,
          status: generation[0].status,
          stage: generation[0].stage,
          portfolioId: generation[0].portfolio_id,
          failureCode: generation[0].error_code,
        }
        : null,
      updatedAt: new Date(brew.updated_at).toISOString(),
    });
  }

  async getMaterials(userId: string, brewId: string) {
    const brews = await this.#sql<(BrewRow & { mode: "solo" | "collab"; length_preset: "single" | "double" | "triple" })[]>`
      select id, job_analysis_id, updated_at, mode, length_preset from brew
      where id = ${brewId} and user_id = ${userId}
    `;
    const brew = brews[0];
    if (!brew) throw new MaterialsError(404, "brew not found");
    const rows = await this.#sql<SourceRow[]>`
      select brew_source.record_id, record.title, record.status, record.origin,
             brew_source.score, brew_source.\`rank\`, brew_source.is_selected,
             brew_source.selected_by, brew_source.excluded_reason, brew_source.reason_text,
             category.name as category_name, category.icon as category_icon,
             record.period_start as period_from,
             record.period_end as period_to
      from brew_source
      join record on record.id = brew_source.record_id
        and record.user_id = brew_source.user_id
      join category on category.id = record.category_id
      where brew_source.user_id = ${userId} and brew_source.brew_id = ${brewId}
      order by brew_source.\`rank\`, brew_source.record_id
    `;
    return BrewMaterialsSchema.parse({
      brewId: brew.id,
      jobAnalysisId: brew.job_analysis_id,
      updatedAt: new Date(brew.updated_at).toISOString(),
      selectionLimit: SELECTION_LIMIT,
      mode: brew.mode,
      lengthPreset: brew.length_preset,
      materials: rows.map(mapSource),
    });
  }

  /**
   * 01b 레일의 제작 모드.
   *
   * `collab`(Cowork)은 PRO다. 자격이 없으면 켜지지 않는다 — 화면이 잠긴 이유를
   * 말하려면 서버도 같은 답을 해야 한다.
   */
  async updateBrew(userId: string, brewId: string, input: UpdateBrew) {
    if (input.mode === "collab") {
      const decision = await new EntitlementService(this.#sql).check(userId, "brew.cowork");
      if (!decision.allowed) throw new MaterialsError(403, "cowork mode requires an upgraded plan");
    }
    const rows = await this.#sql<{ id: string }[]>`
      update brew set mode = ${input.mode}, updated_at = now(6)
      where id = ${brewId} and user_id = ${userId}
      returning id
    `;
    if (!rows[0]) throw new MaterialsError(404, "brew not found");
    return this.getMaterials(userId, brewId);
  }

  async updateSelection(userId: string, brewId: string, recordIds: string[]) {
    await this.#sql.begin(async (transaction) => {
      const brew = (await transaction<BrewRow[]>`
        select id, job_analysis_id, updated_at from brew
        where id = ${brewId} and user_id = ${userId}
        for update
      `)[0];
      if (!brew) throw new MaterialsError(404, "brew not found");
      const allowed = recordIds.length > 0
        ? await transaction<{ record_id: string }[]>`
          select record_id from brew_source
          where user_id = ${userId} and brew_id = ${brewId}
            and record_id in ${transaction(recordIds)}
        `
        : [];
      if (allowed.length !== recordIds.length) {
        throw new MaterialsError(409, "selection contains an ineligible record");
      }
      // rank는 매칭 순위지 고른 차례가 아니다. 여기서 다시 매기면 목록이 두 가지
      // 뜻을 섞어 정렬되고, 뺀 기록이 고른 기록보다 위로 올라온다.
      if (recordIds.length > 0) {
        await transaction`
          update brew_source
          set is_selected = true, selected_by = 'user',
              excluded_reason = null, updated_at = now(6)
          where user_id = ${userId} and brew_id = ${brewId}
            and record_id in ${transaction(recordIds)}
        `;
        await transaction`
          update brew_source
          set is_selected = false, selected_by = 'user',
              excluded_reason = 'USER_DESELECTED', updated_at = now(6)
          where user_id = ${userId} and brew_id = ${brewId}
            and record_id not in ${transaction(recordIds)}
        `;
      } else {
        await transaction`
          update brew_source
          set is_selected = false, selected_by = 'user',
              excluded_reason = 'USER_DESELECTED', updated_at = now(6)
          where user_id = ${userId} and brew_id = ${brewId}
        `;
      }
      await transaction`
        update brew set updated_at = now(6)
        where id = ${brewId} and user_id = ${userId}
      `;
    });
    return this.getMaterials(userId, brewId);
  }
}
