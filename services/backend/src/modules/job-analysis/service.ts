import {
  JobAnalysisExtractionSchema,
  JobAnalysisResultSchema,
  JobAnalysisStatusSchema,
  ReanalysisRequestResultSchema,
  type ExtractedRequirement,
  type JobAnalysisExtraction,
} from "@expresso/contracts";
import type postgres from "postgres";

import { addOutboxEvent } from "../../platform/outbox.js";
import { calculateRequirementCoverage } from "./coverage.js";
import type { RequirementExtractor } from "./rule-extractor.js";
import { AnalysisEvidenceError, validateExtractionSource } from "./source-span.js";

interface AnalysisRow {
  id: string;
  user_id: string;
  job_posting_id: string;
  status: "queued" | "running" | "done" | "failed";
  progress_stage: "queued" | "extracting" | "validating" | "covering" | "done" | "failed";
  attempts: number;
  result_version: number;
  target_version: number;
  failure_code: string | null;
  failure_retryable: boolean | null;
  analyzed_at: Date | string | null;
  description_raw: string;
}

interface RequirementRow {
  id: string;
  label: string;
  kind: "must" | "nice" | "tone";
  /** 어느 축에도 확실히 안 붙으면 null. "other"는 DB에 null로 들어간다. */
  axis: "technology" | "impact" | "role" | "conditions" | null;
  source_span: ExtractedRequirement["sourceSpan"];
  coverage: "covered" | "partial" | "missing";
  covered_by: string[];
}

/**
 * 추출기를 갈아 끼울 때만 올린다. 공고 원문은 불변이라, 같은 추출기로 다시
 * 뽑아도 같은 요건이 나온다 — 그래서 재분석은 요건을 다시 뽑지 않고 내
 * 커버리지만 다시 잰다.
 *
 * 이 값을 올리면 그 공고의 요건이 통째로 교체되고, 다른 사람의 커버리지도
 * 함께 지워진다(각자 다음 분석에서 다시 채워진다).
 */
const EXTRACTOR_VERSION = 1;

interface StoredRequirementRow {
  id: string;
  order_no: number;
  label: string;
  kind: "must" | "nice" | "tone";
  axis: "technology" | "impact" | "role" | "conditions" | null;
  source_span: ExtractedRequirement["sourceSpan"];
}

interface HistoryRow {
  previous_version: number;
  requirements: Array<{
    requirementId: string;
    label: string;
    kind: "must" | "nice" | "tone";
    sourceSpan: ExtractedRequirement["sourceSpan"];
    coverage: "covered" | "partial" | "missing";
    coveredBy: string[];
  }>;
  archived_at: Date | string;
}

interface RecordRow {
  id: string;
  title: string;
  body_md: string;
  properties: Record<string, unknown>;
}

interface ImpactRow {
  brew_count: number;
  recipe_count: number;
}

export class JobAnalysisNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() {
    super("job analysis not found");
    this.name = "JobAnalysisNotFoundError";
  }
}

function mapRequirement(row: RequirementRow) {
  return {
    requirementId: row.id,
    label: row.label,
    kind: row.kind,
    axis: row.axis,
    sourceSpan: row.source_span,
    coverage: row.coverage,
    coveredBy: row.covered_by,
  };
}

function safeFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof AnalysisEvidenceError) {
    return { code: "INVALID_SOURCE_SPAN", retryable: false };
  }
  return { code: "EXTRACTION_FAILED", retryable: true };
}

export class JobAnalysisService {
  readonly #sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.#sql = sql;
  }

  /**
   * 내 분석 결과가 보여주는 요건. 요건은 공고에 붙고 커버리지만 사용자별인데,
   * 여기서는 **내가 대조를 끝낸 것만** 보여준다 — 다른 사람이 뽑아 둔 요건을
   * 내 커버리지인 양 "없음"으로 채우면 대조한 적 없는 것과 구별되지 않는다.
   * 그래서 left join이 아니라 inner join이다.
   */
  #requirementSelect(userId: string, jobPostingId: string) {
    return this.#sql`
      select
        job_posting_requirement.id,
        job_posting_requirement.label,
        job_posting_requirement.kind,
        job_posting_requirement.axis,
        job_posting_requirement.source_span,
        requirement_coverage.coverage,
        requirement_coverage.covered_by
      from job_posting_requirement
      join requirement_coverage
        on requirement_coverage.requirement_id = job_posting_requirement.id
        and requirement_coverage.user_id = ${userId}
      where job_posting_requirement.job_posting_id = ${jobPostingId}
        and job_posting_requirement.extractor_version = ${EXTRACTOR_VERSION}
      order by job_posting_requirement.order_no, job_posting_requirement.id
    `;
  }

  async process(jobAnalysisId: string, extractor: RequirementExtractor) {
    let source = "";
    let targetVersion = 0;
    try {
      const start = await this.#sql.begin(async (transaction) => {
        const rows = await transaction<AnalysisRow[]>`
          select job_analysis.*, job_posting.description_raw
          from job_analysis
          join job_posting on job_posting.id = job_analysis.job_posting_id
          where job_analysis.id = ${jobAnalysisId}
          for update of job_analysis
        `;
        const analysis = rows[0];
        if (!analysis) throw new JobAnalysisNotFoundError();
        if (
          analysis.status === "done"
          && analysis.result_version >= analysis.target_version
        ) {
          return { alreadyComplete: true, source: analysis.description_raw, target: analysis.target_version };
        }
        await transaction`
          update job_analysis
          set status = 'running', progress_stage = 'extracting',
              attempts = attempts + 1, failure_code = null, failure_retryable = null
          where id = ${jobAnalysisId}
        `;
        return { alreadyComplete: false, source: analysis.description_raw, target: analysis.target_version };
      });
      source = start.source;
      targetVersion = start.target;
      if (start.alreadyComplete) return this.getResultById(jobAnalysisId);

      const analysisRows = await this.#sql<Pick<AnalysisRow, "user_id" | "job_posting_id">[]>`
        select user_id, job_posting_id from job_analysis where id = ${jobAnalysisId}
      `;
      const userId = analysisRows[0]?.user_id;
      const jobPostingId = analysisRows[0]?.job_posting_id;
      if (!userId || !jobPostingId) throw new JobAnalysisNotFoundError();

      // 요건은 공고에 붙는다. 이미 뽑혀 있으면 다시 뽑지 않는다 — 원문이
      // 불변이라 같은 추출기로 다시 돌려도 같은 결과가 나온다.
      const stored = await this.#sql<StoredRequirementRow[]>`
        select id, order_no, label, kind, axis, source_span
        from job_posting_requirement
        where job_posting_id = ${jobPostingId}
          and extractor_version = ${EXTRACTOR_VERSION}
        order by order_no, id
      `;
      let extraction: JobAnalysisExtraction | null = null;
      if (stored.length === 0) {
        extraction = JobAnalysisExtractionSchema.parse(await extractor.extract(source));
        await this.#sql`
          update job_analysis set progress_stage = 'validating'
          where id = ${jobAnalysisId} and result_version < target_version
        `;
        validateExtractionSource(source, extraction);
      }
      const requirements: ExtractedRequirement[] = extraction
        ? extraction.requirements
        : stored.map((row) => ({
            label: row.label,
            kind: row.kind,
            axis: row.axis ?? ("other" as const),
            sourceSpan: row.source_span,
          }));

      const records = await this.#sql<RecordRow[]>`
        select id, title, body_md, properties
        from record where user_id = ${userId} and deleted_at is null
      `;
      const recordTexts = records.map((record) => ({
        id: record.id,
        text: `${record.title}\n${record.body_md}\n${JSON.stringify(record.properties)}`,
      }));
      await this.#sql`
        update job_analysis set progress_stage = 'covering'
        where id = ${jobAnalysisId} and result_version < target_version
      `;

      await this.#sql.begin(async (transaction) => {
        const locks = await transaction<AnalysisRow[]>`
          select job_analysis.*, job_posting.description_raw
          from job_analysis
          join job_posting on job_posting.id = job_analysis.job_posting_id
          where job_analysis.id = ${jobAnalysisId}
          for update of job_analysis
        `;
        const analysis = locks[0];
        if (!analysis) throw new JobAnalysisNotFoundError();
        if (analysis.result_version >= targetVersion) return;

        const previousRows = await transaction<RequirementRow[]>`
          ${this.#requirementSelect(analysis.user_id, analysis.job_posting_id)}
        `;
        if (analysis.result_version > 0) {
          await transaction`
            insert into job_analysis_history (
              job_analysis_id, user_id, previous_version, requirements, archived_at
            ) values (
              ${jobAnalysisId}, ${analysis.user_id}, ${analysis.result_version},
              ${transaction.json(previousRows.map(mapRequirement) as postgres.JSONValue)}, now()
            )
            on conflict (job_analysis_id)
            do update set
              previous_version = excluded.previous_version,
              requirements = excluded.requirements,
              archived_at = excluded.archived_at
          `;
        }
        // 같은 공고를 두 사람이 동시에 처음 읽으면 요건이 두 벌 들어간다.
        // 공고 하나에 한 번만 쓰이도록 잠근다.
        await transaction`
          select pg_advisory_xact_lock(hashtext(${analysis.job_posting_id})::bigint)
        `;

        // 요건은 처음 뽑을 때만 쓴다. 이미 있으면 그대로 두고, 그래서 다른
        // 사람이 이미 재 둔 커버리지도 지워지지 않는다.
        let targets: StoredRequirementRow[] = [...await transaction<StoredRequirementRow[]>`
          select id, order_no, label, kind, axis, source_span
          from job_posting_requirement
          where job_posting_id = ${analysis.job_posting_id}
            and extractor_version = ${EXTRACTOR_VERSION}
          order by order_no, id
        `];
        if (targets.length === 0 && extraction) {
          const inserted: StoredRequirementRow[] = [];
          for (const [order, requirement] of extraction.requirements.entries()) {
            const row = (await transaction<{ id: string }[]>`
              insert into job_posting_requirement (
                job_posting_id, order_no, label, kind, axis, source_span,
                extractor_version
              ) values (
                ${analysis.job_posting_id}, ${order}, ${requirement.label},
                ${requirement.kind},
                ${requirement.axis === "other" ? null : requirement.axis},
                ${transaction.json(requirement.sourceSpan as postgres.JSONValue)},
                ${EXTRACTOR_VERSION}
              )
              returning id
            `)[0];
            if (!row) throw new Error("job posting requirement was not persisted");
            inserted.push({
              id: row.id,
              order_no: order,
              label: requirement.label,
              kind: requirement.kind,
              axis: requirement.axis === "other" ? null : requirement.axis,
              source_span: requirement.sourceSpan,
            });
          }
          targets = inserted;
          await transaction`
            update job_posting
            set requirements = ${transaction.json(extraction.normalized as postgres.JSONValue)},
                normalized_at = now()
            where id = ${analysis.job_posting_id}
          `;
        }

        // 커버리지는 **실제로 저장된 요건**에 맞춰 다시 잰다. 라벨로 짝을
        // 맞추면 추출기가 같은 문장을 두 번 뽑았을 때 어긋난다.
        await transaction`
          delete from requirement_coverage
          where user_id = ${analysis.user_id}
            and requirement_id in (
              select id from job_posting_requirement
              where job_posting_id = ${analysis.job_posting_id}
            )
        `;
        for (const target of targets) {
          const result = calculateRequirementCoverage(
            {
              label: target.label,
              kind: target.kind,
              axis: target.axis ?? "other",
              sourceSpan: target.source_span,
            },
            recordTexts,
          );
          await transaction`
            insert into requirement_coverage (
              user_id, requirement_id, coverage, covered_by, computed_at
            ) values (
              ${analysis.user_id}, ${target.id}, ${result.coverage},
              ${result.coveredBy}, now()
            )
          `;
        }
        await transaction`
          update job_analysis
          set status = 'done', progress_stage = 'done',
              result_version = ${targetVersion}, analyzed_at = now(),
              failure_code = null, failure_retryable = null
          where id = ${jobAnalysisId}
        `;
      });
      return this.getResultById(jobAnalysisId);
    } catch (error) {
      const failure = safeFailure(error);
      await this.#sql`
        update job_analysis
        set status = 'failed', progress_stage = 'failed',
            failure_code = ${failure.code}, failure_retryable = ${failure.retryable}
        where id = ${jobAnalysisId}
          and result_version < target_version
      `.catch(() => undefined);
      throw error;
    }
  }

  async getResult(userId: string, jobAnalysisId: string) {
    const results = await this.#getResult(userId, jobAnalysisId);
    if (!results) throw new JobAnalysisNotFoundError();
    return results;
  }

  async getResultById(jobAnalysisId: string) {
    const users = await this.#sql<{ user_id: string }[]>`
      select user_id from job_analysis where id = ${jobAnalysisId}
    `;
    const userId = users[0]?.user_id;
    if (!userId) throw new JobAnalysisNotFoundError();
    const result = await this.#getResult(userId, jobAnalysisId);
    if (!result) throw new JobAnalysisNotFoundError();
    return result;
  }

  async #getResult(userId: string, jobAnalysisId: string) {
    const analyses = await this.#sql<AnalysisRow[]>`
      select job_analysis.*, job_posting.description_raw
      from job_analysis
      left join job_posting on job_posting.id = job_analysis.job_posting_id
      where job_analysis.id = ${jobAnalysisId} and job_analysis.user_id = ${userId}
    `;
    const analysis = analyses[0];
    if (!analysis) return null;
    const requirements = analysis.job_posting_id
      ? await this.#sql<RequirementRow[]>`
          ${this.#requirementSelect(userId, analysis.job_posting_id)}
        `
      : [];
    const histories = await this.#sql<HistoryRow[]>`
      select previous_version, requirements, archived_at
      from job_analysis_history
      where user_id = ${userId} and job_analysis_id = ${jobAnalysisId}
    `;
    const history = histories[0];
    return JobAnalysisResultSchema.parse({
      analysis: JobAnalysisStatusSchema.parse({
        jobAnalysisId,
        status: analysis.status,
        stage: analysis.progress_stage,
        attempts: analysis.attempts,
        resultVersion: analysis.result_version,
        failure: analysis.failure_code
          ? { code: analysis.failure_code, retryable: analysis.failure_retryable ?? false }
          : null,
        analyzedAt: analysis.analyzed_at
          ? new Date(analysis.analyzed_at).toISOString()
          : null,
      }),
      requirements: requirements.map(mapRequirement),
      previous: history
        ? {
            version: history.previous_version,
            requirements: history.requirements,
            archivedAt: new Date(history.archived_at).toISOString(),
          }
        : null,
    });
  }

  async requestReanalysis(userId: string, jobAnalysisId: string) {
    return this.#sql.begin(async (transaction) => {
      const rows = await transaction<AnalysisRow[]>`
        select job_analysis.*, job_posting.description_raw
        from job_analysis
        left join job_posting on job_posting.id = job_analysis.job_posting_id
        where job_analysis.id = ${jobAnalysisId} and job_analysis.user_id = ${userId}
        for update of job_analysis
      `;
      const analysis = rows[0];
      if (!analysis) throw new JobAnalysisNotFoundError();
      if (analysis.status !== "done") {
        const error = new Error("only completed analysis can be reanalyzed") as Error & { statusCode: number };
        error.statusCode = 409;
        throw error;
      }
      const impacts = await transaction<ImpactRow[]>`
        select
          count(distinct brew.id)::integer as brew_count,
          count(distinct recipe.id)::integer as recipe_count
        from brew
        left join recipe on recipe.brew_id = brew.id and recipe.user_id = brew.user_id
        where brew.user_id = ${userId} and brew.job_analysis_id = ${jobAnalysisId}
      `;
      const targetVersion = analysis.result_version + 1;
      await transaction`
        update job_analysis
        set status = 'queued', progress_stage = 'queued',
            target_version = ${targetVersion}, failure_code = null,
            failure_retryable = null
        where id = ${jobAnalysisId} and user_id = ${userId}
      `;
      await addOutboxEvent(transaction, {
        topic: "job.normalize",
        payload: { jobAnalysisId, userId, targetVersion },
        idempotencyKey: `job-reanalysis:${jobAnalysisId}:v${targetVersion}`,
      });
      return ReanalysisRequestResultSchema.parse({
        jobAnalysisId,
        status: "queued",
        targetVersion,
        impact: {
          brewCount: Number(impacts[0]?.brew_count ?? 0),
          recipeCount: Number(impacts[0]?.recipe_count ?? 0),
        },
      });
    });
  }
}
