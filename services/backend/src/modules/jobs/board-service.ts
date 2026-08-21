import {
  API_PREFIX,
  JobPostingDetailSchema,
  JobPostingListResponseSchema,
  JobRequirementsSchema,
  RecentJobSearchListResponseSchema,
  type JobDutyGroup,
  type JobPostingCategory,
  type JobPostingFacet,
  type JobPostingMatch,
  type JobPostingSort,
  type JobRequirements,
  type ListJobPostingsQuery,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import { JobMarketError } from "./errors.js";
import { countryOf, regionsOf } from "./ingest/classify.js";

/**
 * 공고 읽기.
 *
 * 공고 자체는 전역이고 일치도 · 관심 · 해석만 사용자별로 붙는다. 그래서 모든
 * 질의가 `job_posting`에서 시작해 사용자 테이블을 left join으로 건다 —
 * 점수가 없는 공고도 목록에서 사라지면 안 되기 때문이다.
 *
 * 제출 · 해석 · 관심 쓰기는 `JobMarketService`가 소유한다.
 */

interface PostingRow {
  id: string;
  title: string;
  source: "api" | "partner" | "user_input";
  source_url: string | null;
  source_board: string | null;
  team: string | null;
  requirements: Record<string, unknown>;
  location: string | null;
  work_type: string | null;
  experience_label: string | null;
  experience_note: string | null;
  job_family: string | null;
  expires_at: Date | string | null;
  deadline_note: string | null;
  created_at: Date | string;
  days_left: number | null;
  company_id: string;
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_tone_summary: string | null;
  company_initial: string | null;
  company_avatar_background: string | null;
  company_avatar_color: string | null;
  company_logo_checksum: string | null;
  match_total: string | number | null;
  match_axes: JobPostingMatch["axes"] | null;
  match_reason: string | null;
  match_next_action: string | null;
  match_computed_at: Date | string | null;
  interest_id: string | null;
  interest_stage: "saved" | "applied" | "closed" | null;
  interest_deadline_at: Date | string | null;
  interest_memo: string | null;
  interest_updated_at: Date | string | null;
}

interface DetailRow extends PostingRow {
  description_raw: string;
  employment_type: string | null;
  salary_note: string | null;
  duties: JobDutyGroup[];
  preferred: string[];
  hiring_process: string[];
  process_note: string | null;
  notice: string | null;
  company_brand_colors: string[];
  company_tone_palette: Record<string, string> | null;
  company_tone_impression: string | null;
}

interface FacetRow {
  label: string;
  count: number;
}

interface CategoryCountRow {
  total: number;
  remote: number;
  urgent: number;
}

interface BrewRow {
  job_posting_id: string;
  id: string;
  status: "draft" | "interviewing" | "recipe" | "generating" | "done";
  answered: number;
  question_count: number;
  portfolio_id: string | null;
}

interface RequirementRow {
  id: string;
  order_no: number;
  label: string;
  kind: "must" | "nice" | "tone";
  /** 아직 대조하지 않았으면 null. "없음"과 구별한다. */
  coverage: "covered" | "partial" | "missing" | null;
  covered_by: string[] | null;
  source_span: { start: number; end: number; quote: string };
}

interface AnalysisRow {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  progress_stage: "queued" | "extracting" | "validating" | "covering" | "done" | "failed";
  analyzed_at: Date | string | null;
}

interface RecordRow {
  id: string;
  title: string;
}

interface RecentSearchRow {
  id: string;
  query_text: string;
  conditions: unknown[];
  result_count: number;
  created_at: Date | string;
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

/**
 * 회사 마크를 내려받는 주소. 받아 둔 것이 없으면 null이다.
 *
 * 끝에 붙는 `v=`는 그림의 지문 앞 16자다. 그림이 바뀌면 주소가 바뀌므로,
 * 라우트는 이 주소를 **영원히 캐시해도 된다**고 말할 수 있다.
 */
function logoUrl(companyId: string, checksum: string | null): string | null {
  if (checksum === null) return null;
  return `${API_PREFIX}/companies/${companyId}/logo?v=${checksum.slice(0, 16)}`;
}

function technologies(
  requirements: JobRequirements,
  match: JobPostingMatch | null,
): { name: string; matched: boolean | null }[] {
  const matched = match ? new Set(match.axes.technology.matched) : null;
  return requirements.technologies.map((name) => ({
    name,
    matched: matched ? matched.has(name) : null,
  }));
}

function mapMatch(row: PostingRow): JobPostingMatch | null {
  if (row.match_total === null || row.match_axes === null) return null;
  // 분자·분모는 축의 합이다. 열로 따로 두면 두 값이 어긋날 수 있다.
  const axes = Object.values(row.match_axes);
  return {
    total: Math.round(Number(row.match_total)),
    covered: axes.reduce((sum, axis) => sum + axis.covered, 0),
    required: axes.reduce((sum, axis) => sum + axis.required, 0),
    axes: row.match_axes,
    reason: row.match_reason!,
    nextAction: row.match_next_action!,
    computedAt: iso(row.match_computed_at!),
  };
}

/** 필터 축 하나. 칩을 셀 때 "나만 빼고"의 그 나다. */
type FilterAxis = "category" | "country" | "experience" | "workType" | "company";

/** 내 연차로 고를 수 있는 칸막이. 상한이라 서로 겹친다. */
const EXPERIENCE_LEVELS = [0, 3, 5, 7, 10, 15] as const;

function experienceLabel(years: number): string {
  return years === 0 ? "신입" : `${years}년`;
}

/** 근무 형태는 한 칸에 여럿이 적힌다. 포함으로 세고 포함으로 건다. */
const WORK_TYPES = ["재택", "하이브리드", "출근"] as const;

/**
 * 겹치는 칸막이의 칩. 0건짜리는 세우지 않는다 — 누를 수는 있는데 아무것도
 * 없는 줄이 된다.
 *
 * 비율은 그 축에서 가장 큰 칸을 1로 본다. 합으로 나눌 수가 없어서다 —
 * `신입 3` · `3년 34`처럼 서로를 품는 수라 합에 뜻이 없다.
 */
function overlapping(rows: { label: string; count: number }[]): JobPostingFacet[] {
  const biggest = rows.reduce((max, row) => Math.max(max, row.count), 0);
  return rows
    .filter((row) => row.count > 0)
    .map((row) => ({ ...row, ratio: biggest === 0 ? 0 : row.count / biggest }));
}

/**
 * 어떤 축의 조건을 빼고 센 칩들의 비율.
 *
 * 그 축의 건수 합이 곧 모집단이다. 걸러진 총계로 나누면 1을 넘는다 — 회사
 * 하나로 좁힌 화면에서 다른 회사의 건수가 그대로 남아 있기 때문이다.
 */
function ratioOf<T extends { count: number | string }>(
  rows: T[],
): { row: T; ratio: number }[] {
  const population = rows.reduce((sum, row) => sum + Number(row.count), 0);
  return rows.map((row) => ({
    row,
    ratio: population === 0 ? 0 : Number(row.count) / population,
  }));
}

function facets(rows: FacetRow[], total: number): JobPostingFacet[] {
  return rows.map((row) => ({
    label: row.label,
    count: Number(row.count),
    ratio: total === 0 ? 0 : Number(row.count) / total,
  }));
}

function mapSummary(row: PostingRow, brew: BrewRow | undefined) {
  const requirements = JobRequirementsSchema.parse(row.requirements);
  const match = mapMatch(row);
  return {
    id: row.id,
    title: row.title,
    company: {
      id: row.company_id,
      name: row.company_name,
      domain: row.company_domain,
      industry: row.company_industry,
      toneSummary: row.company_tone_summary,
      initial: row.company_initial,
      avatarBackground: row.company_avatar_background,
      avatarColor: row.company_avatar_color,
      logoUrl: logoUrl(row.company_id, row.company_logo_checksum),
    },
    source: row.source,
    sourceUrl: row.source_url,
    sourceBoard: row.source_board,
    team: row.team,
    location: row.location,
    workType: row.work_type,
    // 본문에서 읽은 연차("5년 이상")가 ATS가 준 분류("경력")보다 구체적이다.
    // 둘 다 있으면 연차를 쓴다 — "5년 이상"이면 경력직인 것도 함께 말한다.
    experienceLabel: row.experience_note ?? row.experience_label,
    family: row.job_family,
    technologies: technologies(requirements, match),
    expiresAt: row.expires_at ? iso(row.expires_at) : null,
    daysLeft: row.days_left === null ? null : Number(row.days_left),
    deadlineNote: row.deadline_note,
    match,
    interest: row.interest_id
      ? {
          id: row.interest_id,
          stage: row.interest_stage!,
          deadlineAt: row.interest_deadline_at ? iso(row.interest_deadline_at) : null,
          memo: row.interest_memo,
          updatedAt: iso(row.interest_updated_at!),
        }
      : null,
    brew: brew
      ? {
          id: brew.id,
          status: brew.status,
          answered: Number(brew.answered),
          questionCount: Number(brew.question_count),
          portfolioId: brew.portfolio_id,
        }
      : null,
    createdAt: iso(row.created_at),
  };
}

export class JobBoardService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
    this.#sql = sql;
  }

  /**
   * 검색어 · 기술 · 관심으로만 좁힌 자리. 06 카테고리 칩의 건수는 여기서
   * 센다 — 칩을 눌러도 나머지 칩의 숫자가 흔들리면 안 되기 때문이다.
   */
  #baseScope(userId: string, query: ListJobPostingsQuery) {
    const sql = this.#sql;
    const like = query.q ? `%${query.q.replace(/[%_\\]/g, "\\$&")}%` : null;
    return sql`
      from job_posting
      join company on company.id = job_posting.company_id
      left join match_score
        on match_score.job_posting_id = job_posting.id
        and match_score.user_id = ${userId}
      left join interest
        on interest.job_posting_id = job_posting.id
        and interest.user_id = ${userId}
      where true
        ${like
          ? sql`and (
              job_posting.title ilike ${like}
              or company.name ilike ${like}
              or job_posting.description_raw ilike ${like}
            )`
          : sql``}
        ${query.technology
          ? sql`and exists (
              select 1 from jsonb_array_elements_text(
                coalesce(job_posting.requirements -> 'technologies', '[]'::jsonb)
              ) as technology
              where lower(technology) = lower(${query.technology})
            )`
          : sql``}
        ${query.interested === true ? sql`and interest.id is not null` : sql``}
        ${query.interested === false ? sql`and interest.id is null` : sql``}
        ${query.stage ? sql`and interest.stage = ${query.stage}` : sql``}
    `;
  }

  /**
   * 목록 · 개수 · 집계가 공유하는 `from … where`. 세 질의의 필터가 갈리면
   * "44건 중 8건"의 44가 거짓말이 되므로 한 곳에서만 만든다.
   */
  #scope(userId: string, query: ListJobPostingsQuery) {
    const sql = this.#sql;
    return sql`
      ${this.#baseScope(userId, query)}
      ${this.#filters(query, null)}
    `;
  }

  /**
   * 필터 절 전부. `skip`을 주면 그 축 하나만 뺀다.
   *
   * **칩은 자기 차원만 빼고 센다.** 한국을 보는 중에 직군 칩이 `백엔드 56`이라
   * 적혀 있으면 그 56은 한국의 56이어야 하고, 나라 칩이 `인도 31`이라 적혀
   * 있으면 그 31은 지금 고른 직군 안의 31이어야 한다. 규칙이 한 곳에 있어야
   * 축을 더할 때 새로 어긋나지 않는다.
   */
  #filters(query: ListJobPostingsQuery, skip: FilterAxis | null) {
    const sql = this.#sql;
    return sql`
      ${skip === "category" ? sql`` : this.#categoryClauses(query)}
      ${skip === "country" ? sql`` : this.#countryClause(query)}
      ${skip === "experience" ? sql`` : this.#experienceClause(query)}
      ${skip === "workType" ? sql`` : this.#workTypeClause(query)}
      ${skip === "company" ? sql`` : this.#companyClause(query)}
    `;
  }

  /**
   * 위쪽 카테고리 탭이 거는 것 — 직군 · 리모트 · 마감.
   *
   * 나라와 따로 두는 이유는 **칩이 자기 차원만 빼고 세야** 하기 때문이다.
   * 직군 칩은 지금 고른 직군을 빼고 세지만 나라는 걸어야 한다 — 한국을 보는
   * 중에 `백엔드 56`이라고 적혀 있으면 그 56은 한국의 56이어야 한다.
   */
  #categoryClauses(query: ListJobPostingsQuery) {
    const sql = this.#sql;
    return sql`
        ${query.family ? sql`and job_posting.job_family = ${query.family}` : sql``}
        ${query.remote === true ? sql`and job_posting.work_type ilike '%리모트%'` : sql``}
        ${query.remote === false
          ? sql`and (job_posting.work_type is null or job_posting.work_type not ilike '%리모트%')`
          : sql``}
        ${query.deadline === "urgent"
          ? sql`and job_posting.expires_at >= now()
                and job_posting.expires_at < now() + interval '7 days'`
          : sql``}
        ${query.deadline === "open"
          ? sql`and (job_posting.expires_at is null or job_posting.expires_at >= now())`
          : sql``}
        ${query.deadline === "always" ? sql`and job_posting.expires_at is null` : sql``}
    `;
  }

  /** 근무지 나라. DB는 지역까지만 알아서, 나라에 속한 지역들로 편다. */
  #countryClause(query: ListJobPostingsQuery) {
    const sql = this.#sql;
    return query.country
      ? sql`and job_posting.location_region = any(${regionsOf(query.country)})`
      : sql``;
  }

  /**
   * 내 연차로 지원할 수 있는가.
   *
   * **연차를 못 읽은 공고는 남긴다.** 158건 중 23건이 그런데, 그걸 빼면 우리가
   * 못 읽은 것을 "당신은 자격이 안 된다"로 바꿔 말하는 셈이 된다.
   */
  #experienceClause(query: ListJobPostingsQuery) {
    const sql = this.#sql;
    return query.experience === undefined
      ? sql``
      : sql`and (job_posting.experience_min_years is null
                 or job_posting.experience_min_years <= ${query.experience})`;
  }

  /**
   * 근무 형태. `재택 · 출근 · 하이브리드`처럼 여럿이 한 칸에 적혀 있어
   * 포함으로 건다.
   */
  #workTypeClause(query: ListJobPostingsQuery) {
    const sql = this.#sql;
    return query.workType
      ? sql`and job_posting.work_type like ${`%${query.workType}%`}`
      : sql``;
  }

  #companyClause(query: ListJobPostingsQuery) {
    const sql = this.#sql;
    return query.company ? sql`and job_posting.company_id = ${query.company}` : sql``;
  }

  /** 목록과 상세가 함께 쓰는 공고 열. */
  #postingColumns() {
    return this.#sql`
      job_posting.id,
      job_posting.title,
      job_posting.source,
      job_posting.source_url,
      job_posting.source_board,
      job_posting.team,
      job_posting.requirements,
      job_posting.location,
      job_posting.work_type,
      job_posting.experience_label,
      job_posting.experience_note,
      job_posting.job_family,
      job_posting.expires_at,
      job_posting.deadline_note,
      job_posting.created_at,
      (job_posting.expires_at::date - now()::date) as days_left,
      company.id as company_id,
      company.name as company_name,
      company.domain as company_domain,
      company.industry as company_industry,
      company.tone_summary as company_tone_summary,
      company.initial as company_initial,
      company.avatar_background as company_avatar_background,
      company.avatar_color as company_avatar_color,
      company.logo_checksum as company_logo_checksum,
      match_score.total as match_total,
      match_score.axes as match_axes,
      match_score.reason_text as match_reason,
      match_score.next_action as match_next_action,
      match_score.computed_at as match_computed_at,
      interest.id as interest_id,
      interest.stage as interest_stage,
      interest.deadline_at as interest_deadline_at,
      interest.memo as interest_memo,
      interest.updated_at as interest_updated_at
    `;
  }

  /**
   * 이 공고들로 시작한 제작. 목록 질의에 붙이지 않고 따로 읽는다 —
   * 개수 · 집계 질의까지 이 조인을 지고 갈 이유가 없다.
   */
  async #brewsFor(userId: string, jobPostingIds: string[]) {
    if (jobPostingIds.length === 0) return new Map<string, BrewRow>();
    const rows = await this.#sql<BrewRow[]>`
      select distinct on (job_analysis.job_posting_id)
        job_analysis.job_posting_id,
        brew.id,
        brew.status,
        (
          select coalesce(sum(interview_session.answered_count), 0)
          from interview_session
          where interview_session.user_id = brew.user_id
            and interview_session.brew_id = brew.id
        ) as answered,
        (
          select coalesce(sum(interview_session.question_count), 0)
          from interview_session
          where interview_session.user_id = brew.user_id
            and interview_session.brew_id = brew.id
        ) as question_count,
        (
          select portfolio.id from portfolio
          where portfolio.user_id = brew.user_id and portfolio.brew_id = brew.id
          order by portfolio.created_at desc, portfolio.id desc
          limit 1
        ) as portfolio_id
      from brew
      join job_analysis
        on job_analysis.user_id = brew.user_id and job_analysis.id = brew.job_analysis_id
      where brew.user_id = ${userId}
        and job_analysis.job_posting_id = any(${jobPostingIds}[])
      order by job_analysis.job_posting_id, brew.updated_at desc, brew.id desc
    `;
    return new Map(rows.map((row) => [row.job_posting_id, row]));
  }

  /** 00b 검색 결과 · 06 공고 탐색. */
  async list(userId: string, query: ListJobPostingsQuery) {
    const sql = this.#sql;
    const scope = this.#scope(userId, query);
    const base = this.#baseScope(userId, query);
    const without = (axis: FilterAxis) => sql`${base} ${this.#filters(query, axis)}`;

    // 정렬 키는 null을 만들지 않는다 — 그래야 어느 쪽 끝에 설지가 정해진다.
    // 마감은 가까운 순(오름차순), 나머지는 큰 순(내림차순)이다.
    //
    // `job_posting.id`를 뒤에 붙여 순서를 완전히 정한다. 점수가 같은 공고가
    // 수백 건이라 이게 없으면 같은 쪽을 두 번 열 때 순서가 달라진다.
    const sortKey =
      query.sort === "match"
        ? sql`coalesce(match_score.total, -1)`
        : query.sort === "deadline"
          ? sql`coalesce(job_posting.expires_at, 'infinity'::timestamptz)`
          : sql`job_posting.created_at`;
    const order = query.sort === "deadline" ? sql`asc` : sql`desc`;
    const offset = (query.page - 1) * query.limit;

    const [rows, chipCounts, families, regions, filtered, levels, workTypes, companies] =
      await Promise.all([
      sql<PostingRow[]>`
        select ${this.#postingColumns()}
        ${scope}
        order by ${sortKey} ${order}, job_posting.id ${order}
        limit ${query.limit} offset ${offset}
      `,
      sql<CategoryCountRow[]>`
        select
          count(*) as total,
          count(case when job_posting.work_type ilike '%리모트%' then 1 end) as remote,
          count(case when job_posting.expires_at >= now( then 1 end)
              and job_posting.expires_at < now() + interval 7 day
          ) as urgent
        ${without("category")}
      `,
      sql<FacetRow[]>`
        select job_posting.job_family as label, count(*) as count
        ${without("category")}
          and job_posting.job_family is not null
        group by job_posting.job_family
        order by count(*) desc, job_posting.job_family
      `,
      // 나라 칩은 **나라만 빼고** 나머지 조건을 건 채로 센다 — 지금 본 나라를
      // 빼야 "다른 나라에는 몇 건 있나"를 말할 수 있다. 직군 칩과 같은 규칙이다.
      //
      // 지역으로 세고 나라로 묶는 것은 DB가 나라를 모르기 때문이다. 지역→나라
      // 표는 지역을 만드는 곳(`classify.ts`)에 있고, 그 한 표만 본다.
      sql<FacetRow[]>`
        select job_posting.location_region as label, count(*) as count
        ${without("country")}
          and job_posting.location_region is not null
        group by job_posting.location_region
        order by count(*) desc, job_posting.location_region
      `,
      sql<{ total: number }[]>`select count(*) as total ${scope}`,
      // 연차 칸막이는 **상한**이라 서로 겹친다. 한 번에 세고 뒤에서 편다.
      sql<Record<string, number>[]>`
        select ${sql.unsafe(EXPERIENCE_LEVELS
          .map((years) => `count(*) filter (
             where job_posting.experience_min_years is null
                or job_posting.experience_min_years <= ${years}
           )::integer as "y${years}"`)
          .join(", "))}
        ${without("experience")}
      `,
      sql<Record<string, number>[]>`
        select ${sql.unsafe(WORK_TYPES
          .map((label, index) => `count(*) filter (
             where job_posting.work_type like '%${label}%'
           )::integer as "w${index}"`)
          .join(", "))}
        ${without("workType")}
      `,
      sql<{ key: string; label: string; count: number }[]>`
        select company.id as key, company.name as label, count(*) as count
        ${without("company")}
        group by company.id, company.name
        order by count(*) desc, company.name
      `,
    ]);

    const chips = chipCounts[0];
    const total = Number(filtered[0]?.total ?? 0);
    // 지역별로 센 것을 나라로 접는다. 서울 88 · 경기 3이면 한국 91이다.
    const byCountry = new Map<string, number>();
    for (const row of regions) {
      const country = countryOf(row.label);
      byCountry.set(country, (byCountry.get(country) ?? 0) + Number(row.count));
    }
    const countries = [...byCountry]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

    // 집계는 결과가 있을 때만 — 빈 목록에 "0건이 공통으로 찾는 것"은 없다.
    const [common, missing] = total === 0
      ? [[] as FacetRow[], [] as FacetRow[]]
      : await Promise.all([
          sql<FacetRow[]>`
            select technology as label, count(*) as count
            from (select job_posting.requirements ${scope}) as scoped
            cross join lateral jsonb_array_elements_text(
              coalesce(scoped.requirements -> '$.technologies', '[]')
            ) as technology
            group by technology
            order by count(*) desc, technology
            limit 8
          `,
          sql<FacetRow[]>`
            select technology as label, count(*) as count
            from (select match_score.axes ${scope}) as scoped
            cross join lateral jsonb_array_elements_text(
              coalesce(scoped.axes -> '$.technology' -> '$.missing', '[]')
            ) as technology
            group by technology
            order by count(*) desc, technology
            limit 5
          `,
        ]);

    // 몇 쪽까지인지는 걸린 수에서 나온다. 이미 세고 있는 값이라 공짜다.
    const totalPages = Math.ceil(total / query.limit);
    const brews = await this.#brewsFor(userId, rows.map((row) => row.id));

    const categories: JobPostingCategory[] = [
      { key: "all", label: "전체", count: Number(chips?.total ?? 0) },
      ...families.map((family) => ({
        key: `family:${family.label}`,
        label: family.label,
        count: Number(family.count),
      })),
      { key: "remote", label: "리모트", count: Number(chips?.remote ?? 0) },
      { key: "urgent", label: "마감 임박", count: Number(chips?.urgent ?? 0) },
    ];

    return JobPostingListResponseSchema.parse({
      data: rows.map((row) => mapSummary(row, brews.get(row.id))),
      summary: {
        total,
        categories,
        commonTechnologies: facets(common, total),
        missingTechnologies: facets(missing, total),
        // 나라 칩은 **나라 조건을 뺀** 모집단에서 셌다. 그러니 비율도 그
        // 모집단으로 나눠야 한다 — 걸러진 수(`total`)로 나누면 1을 넘는다.
        countries: ratioOf(countries).map(({ row, ratio }) => ({ label: row.label, count: Number(row.count), ratio })),
        // 연차·근무 형태는 **겹치는 칸막이**라 합이 전체와 다르다. 비율의
        // 기준은 그 축을 빼고 센 모집단이다.
        experienceLevels: overlapping(
          EXPERIENCE_LEVELS.map((years) => ({
            label: experienceLabel(years),
            count: Number(levels[0]?.[`y${years}`] ?? 0),
          })),
        ),
        workTypes: overlapping(
          WORK_TYPES.map((label, index) => ({
            label,
            count: Number(workTypes[0]?.[`w${index}`] ?? 0),
          })),
        ),
        // 회사 칩도 **회사 조건을 뺀** 모집단에서 셌다. 나라 칩과 같은 이유로
        // 같은 모집단으로 나눈다 — 걸러진 수(`total`)로 나누면 1을 넘고,
        // 계약이 `ratio <= 1`이라 응답이 통째로 거절된다. 회사 하나로 좁힌
        // 화면이 500으로 죽던 자리다.
        companies: ratioOf(companies).map(({ row, ratio }) => ({
          key: row.key,
          label: row.label,
          count: Number(row.count),
          ratio,
        })),
      },
      page: {
        page: query.page,
        pageSize: query.limit,
        totalPages,
        hasPrevPage: query.page > 1,
        hasNextPage: query.page < totalPages,
      },
    });
  }

  /** 06b 공고 상세. 원문과 요구사항 근거 구간까지 내려보낸다. */
  async get(userId: string, jobPostingId: string) {
    const sql = this.#sql;

    const rows = await sql<DetailRow[]>`
      select
        ${this.#postingColumns()},
        job_posting.description_raw,
        job_posting.employment_type,
        job_posting.salary_note,
        job_posting.duties,
        job_posting.preferred,
        job_posting.hiring_process,
        job_posting.process_note,
        job_posting.notice,
        company.brand_colors as company_brand_colors,
        company.tone_palette as company_tone_palette,
        company.tone_impression as company_tone_impression
      from job_posting
      join company on company.id = job_posting.company_id
      left join match_score
        on match_score.job_posting_id = job_posting.id
        and match_score.user_id = ${userId}
      left join interest
        on interest.job_posting_id = job_posting.id
        and interest.user_id = ${userId}
      where job_posting.id = ${jobPostingId}
    `;
    const posting = rows[0];
    if (!posting) throw new JobMarketError(404, "job posting not found");

    // 같은 공고를 여러 번 해석했을 수 있다. 가장 최근 것만 보여준다.
    const analyses = await sql<AnalysisRow[]>`
      select id, status, progress_stage, analyzed_at
      from job_analysis
      where user_id = ${userId} and job_posting_id = ${jobPostingId}
      order by analyzed_at desc nulls last, id desc
      limit 1
    `;
    const analysis = analyses[0];

    const [requirements, ranks, topRecords, brews] = await Promise.all([
      // 요건은 공고에 붙는다 — 내가 해석한 적이 없어도 보인다. 커버리지만
      // 사용자별이라 left join이고, 대조 전이면 null이다.
      sql<RequirementRow[]>`
        select
          job_posting_requirement.id,
          job_posting_requirement.order_no,
          job_posting_requirement.label,
          job_posting_requirement.kind,
          job_posting_requirement.source_span,
          requirement_coverage.coverage,
          requirement_coverage.covered_by
        from job_posting_requirement
        left join requirement_coverage
          on requirement_coverage.requirement_id = job_posting_requirement.id
          and requirement_coverage.user_id = ${userId}
        where job_posting_requirement.job_posting_id = ${jobPostingId}
        -- 원문에 나온 순서가 화면의 순서다. 이름순으로 섞으면 공고를
        -- 읽는 사람의 눈이 따라가지 못한다.
        order by
          case job_posting_requirement.kind
            when 'must' then 0 when 'nice' then 1 else 2 end,
          job_posting_requirement.order_no,
          job_posting_requirement.id
      `,
      posting.match_total === null
        ? Promise.resolve([] as { position: number; total: number }[])
        : sql<{ position: number; total: number }[]>`
            select
              count(*) filter (where total > ${posting.match_total}) + 1 as position,
              count(*) as total
            from match_score
            where user_id = ${userId}
          `,
      // 요건을 가장 많이 덮는 기록이 지면에서도 먼저 올라간다.
      sql<RecordRow[]>`
        select record.id, record.title
        from requirement_coverage
        join job_posting_requirement
          on job_posting_requirement.id = requirement_coverage.requirement_id
        cross join lateral unnest(requirement_coverage.covered_by) as covered_record_id
        join record on record.id = covered_record_id
          and record.user_id = requirement_coverage.user_id
        where requirement_coverage.user_id = ${userId}
          and job_posting_requirement.job_posting_id = ${jobPostingId}
          and record.deleted_at is null
        group by record.id, record.title
        order by count(*) desc, record.title
        limit 3
      `,
      this.#brewsFor(userId, [jobPostingId]),
    ]);

    const coveredIds = [...new Set(requirements.flatMap((row) => row.covered_by ?? []))];
    const coveredTitles = coveredIds.length === 0
      ? new Map<string, string>()
      : new Map(
          (await sql<RecordRow[]>`
            select id, title from record
            where user_id = ${userId} and id = any(${coveredIds}[])
          `).map((record) => [record.id, record.title]),
        );

    // 우대 사항은 추출된 `nice` 요건과 이름으로 맞춘다. 대조한 적이 없으면
    // "없음"이 아니라 null이다.
    const niceCoverage = new Map(
      requirements
        .filter((row) => row.kind === "nice")
        .map((row) => [row.label, row.coverage]),
    );

    const rank = ranks[0];

    return JobPostingDetailSchema.parse({
      ...mapSummary(posting, brews.get(jobPostingId)),
      company: {
        id: posting.company_id,
        name: posting.company_name,
        domain: posting.company_domain,
        industry: posting.company_industry,
        toneSummary: posting.company_tone_summary,
        initial: posting.company_initial,
        avatarBackground: posting.company_avatar_background,
        avatarColor: posting.company_avatar_color,
        logoUrl: logoUrl(posting.company_id, posting.company_logo_checksum),
        brandColors: posting.company_brand_colors,
        tonePalette: posting.company_tone_palette,
        toneImpression: posting.company_tone_impression,
      },
      descriptionRaw: posting.description_raw,
      employmentType: posting.employment_type,
      salaryNote: posting.salary_note,
      duties: posting.duties,
      preferred: posting.preferred.map((label) => ({
        label,
        coverage: niceCoverage.get(label) ?? null,
      })),
      hiringProcess: posting.hiring_process.map((label) => ({ label })),
      processNote: posting.process_note,
      notice: posting.notice,
      requirements: JobRequirementsSchema.parse(posting.requirements),
      criteria: requirements.map((requirement) => ({
        id: requirement.id,
        orderNo: requirement.order_no,
        label: requirement.label,
        kind: requirement.kind,
        coverage: requirement.coverage,
        coveredBy: (requirement.covered_by ?? []).flatMap((id) => {
          const title = coveredTitles.get(id);
          return title ? [{ id, title }] : [];
        }),
        sourceSpan: requirement.source_span,
      })),
      analysis: analysis
        ? {
            id: analysis.id,
            status: analysis.status,
            progressStage: analysis.progress_stage,
            analyzedAt: analysis.analyzed_at ? iso(analysis.analyzed_at) : null,
          }
        : null,
      rank: rank ? { position: Number(rank.position), total: Number(rank.total) } : null,
      topRecords: topRecords.map((record) => ({ id: record.id, title: record.title })),
    });
  }

  /** 00b 우측 레일의 최근 검색. 저장은 `POST /v1/jobs/search/interpret`이 한다. */
  async recentSearches(userId: string, limit: number) {
    const rows = await this.#sql<RecentSearchRow[]>`
      select id, query_text, conditions, result_count, created_at
      from recent_search
      where user_id = ${userId}
      order by created_at desc, id desc
      limit ${limit}
    `;
    return RecentJobSearchListResponseSchema.parse({
      data: rows.map((row) => ({
        id: row.id,
        query: row.query_text,
        conditions: row.conditions,
        resultCount: Number(row.result_count),
        createdAt: iso(row.created_at),
      })),
    });
  }

  /**
   * 회사 마크의 바이트.
   *
   * **인증이 없다.** 아바타는 `<img>`로 뜨는 그림이고, 브라우저는 거기에
   * 우리 쿠키를 붙이지 않는다. 담긴 것도 회사가 자기 사이트에 공개해 둔
   * 아이콘이라 가릴 것이 없다(`media/:id`가 같은 이유로 열려 있다).
   */
  async logo(companyId: string): Promise<{ bytes: Buffer; mediaType: string } | null> {
    const row = (await this.#sql<{ logo_data: Buffer; logo_media_type: string }[]>`
      select logo_data, logo_media_type from company
      where id = ${companyId} and logo_data is not null
    `)[0];
    return row ? { bytes: row.logo_data, mediaType: row.logo_media_type } : null;
  }
}
