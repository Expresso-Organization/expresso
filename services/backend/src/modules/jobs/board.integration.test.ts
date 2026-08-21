import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import {
  ApiErrorResponseSchema,
  JobPostingDetailResponseSchema,
  JobPostingListResponseSchema,
  RecentJobSearchListResponseSchema,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { JobBoardService } from "./board-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-job-board-test",
};

interface IdRow {
  id: string;
}

/** 공고 원문은 불변이고 근거 구간은 글자 위치로 검증된다 — 인용을 원문에서 딴다. */
const QUOTE = "하루 3,000만 건 규모의 적재 파이프라인을 운영합니다";
const DESCRIPTION = [
  "데이터 플랫폼팀에서 함께할 엔지니어를 찾습니다.",
  `${QUOTE}.`,
  "Airflow와 Spark로 배치를 운영하고, 지연과 유실을 줄이는 구조 개선을 맡습니다.",
  "이상 감지와 알림 기준을 세우고 재적재 절차를 문서로 남기는 일도 포함됩니다.",
].join("\n");
const QUOTE_START = DESCRIPTION.indexOf(QUOTE);

/** 축은 요구 건수와 충족 건수만 담는다 — 배점은 없다 (§8.1). */
function axes(technology: { matched: string[]; missing: string[] }) {
  return {
    technology: {
      required: technology.matched.length + technology.missing.length,
      covered: technology.matched.length,
      ...technology,
    },
    impact: { required: 1, covered: 1, matched: ["일 3천만 건"], missing: [] },
    role: { required: 1, covered: 1, matched: ["데이터 엔지니어"], missing: [] },
    conditions: { required: 1, covered: 1, matched: ["리모트"], missing: [] },
  };
}

/** 시드가 적어 둔 축에서 총점을 낸다. 손으로 적은 숫자와 어긋나지 않게. */
function totalOf(seeded: ReturnType<typeof axes>): number {
  const all = Object.values(seeded);
  const required = all.reduce((sum, axis) => sum + axis.required, 0);
  const covered = all.reduce((sum, axis) => sum + axis.covered, 0);
  return Math.round((100 * covered) / required);
}

describeWithDatabase("job board read HTTP integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identity = new IdentityService(sql);
  const app = buildApi({
    config,
    identityService: identity,
    jobBoardService: new JobBoardService(sql),
  });

  const marker = randomUUID();
  let userId = "";
  let otherUserId = "";
  let token = "";
  let otherToken = "";
  let companyId = "";
  let urgentId = "";
  let laterId = "";
  let alwaysId = "";
  let analysisId = "";

  const auth = (value = token) => ({ authorization: `Bearer ${value}` });
  /** 공고는 전역이라 다른 테스트가 심은 것과 섞인다. 마커로 이 판만 본다. */
  const scoped = (extra = "") => `q=${marker}${extra}`;

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan missing");

    const users: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, ${`board-a-${marker}@example.com`}, 'Board A', ${planId}),
        (${users[1]!.id}, ${`board-b-${marker}@example.com`}, 'Board B', ${planId})
    `;
    userId = users[0]!.id;
    otherUserId = users[1]!.id;
    token = (await identity.issueSession({ userId })).accessToken;
    otherToken = (await identity.issueSession({ userId: otherUserId })).accessToken;

    companyId = (await sql<IdRow[]>`
      insert into company (
        name, domain, industry, tone_summary, tone_palette, dedupe_key,
        avatar_background, avatar_color, brand_colors, tone_impression
      )
      values (
        ${`보드컴퍼니 ${marker}`}, 'board.example', '핀테크',
        '담백 · 사실 위주',
        ${sql.json({ accent: "#FF6F0F", ink: "#16223A" })},
        ${`board-${marker}`},
        '#EEF2FC', '#2A48B8', ${sql.array(["#1B2A4A", "#2E7CF6", "#EFF2F6"])},
        '정확 · 신뢰'
      )
      returning id
    `)[0]!.id;

    const postings = await sql<IdRow[]>`
      insert into job_posting (
        company_id, source, title, description_raw,
        requirements, expires_at, dedupe_hash, created_at,
        location, work_type, experience_label, job_family,
        employment_type, salary_note, duties, preferred,
        hiring_process, process_note, notice
      )
      values
        (
          ${companyId}, 'user_input', '데이터 플랫폼 엔지니어',
          ${DESCRIPTION},
          ${sql.json({ technologies: ["Airflow", "Spark"], impacts: [], roles: [], conditions: [] })},
          now(6) + interval 3 day, ${`board-urgent-${marker}`}, now() - interval '3 minutes',
          '서울 강남', '리모트 주 2일', '3년 이상', '백엔드 · 데이터',
          '정규직 · 수습 3개월', '8,000만 – 1억 1,000만',
          ${sql.json([{ group: "적재 파이프라인", items: ["하루 3,000만 건 적재"] }])},
          ${sql.json(["금융권 데이터 프로젝트 수행 경험", "MLOps 파이프라인 구축"])},
          ${sql.json(["서류 전형", "직무 · 기술 인터뷰"])}, '평균 3주',
          '수습 3개월 후 정규직 전환 평가가 있습니다'
        ),
        (
          ${companyId}, 'user_input', '백엔드 엔지니어',
          ${DESCRIPTION},
          ${sql.json({ technologies: ["Airflow", "Kafka"], impacts: [], roles: [], conditions: [] })},
          now() + interval '30 days', ${`board-later-${marker}`}, now() - interval '2 minutes',
          '서울', '출근', '5년 이상', '백엔드 · 데이터',
          '정규직', '면접 후 협의',
          '[]', '[]', '[]', null, null
        ),
        (
          ${companyId}, 'user_input', '플랫폼 엔지니어',
          ${DESCRIPTION},
          ${sql.json({ technologies: ["Go"], impacts: [], roles: [], conditions: [] })},
          null, ${`board-always-${marker}`}, now() - interval '1 minute',
          null, '리모트', '경력', '플랫폼 · 인프라',
          null, null, '[]', '[]', '[]', null, null
        )
      returning id
    `;
    urgentId = postings[0]!.id;
    laterId = postings[1]!.id;
    alwaysId = postings[2]!.id;

    const urgentAxes = axes({ matched: ["Airflow", "Spark"], missing: [] });
    const laterAxes = axes({ matched: ["Airflow"], missing: ["Kafka"] });
    await sql`
      insert into match_score (
        user_id, job_posting_id, total, axes, reason_text, next_action
      )
      values
        (
          ${userId}, ${urgentId}, ${totalOf(urgentAxes)}, ${sql.json(urgentAxes)},
          '요건 5개의 근거가 모두 기록에서 확인됩니다.', '가장 관련 있는 기록을 검토하세요.'
        ),
        (
          ${userId}, ${laterId}, ${totalOf(laterAxes)}, ${sql.json(laterAxes)},
          '기술 스택에서 Kafka 근거가 비어 있습니다.', 'Kafka를 사용한 기록을 추가하세요.'
        )
    `;

    await sql`
      insert into interest (user_id, job_posting_id, stage, deadline_at, memo)
      values (${userId}, ${urgentId}, 'applied', now(6) + interval 3 day, '지원 완료')
    `;

    analysisId = (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type, status, progress_stage, analyzed_at)
      values (${userId}, ${urgentId}, 'paste', 'done', 'done', now(6))
      returning id
    `)[0]!.id;

    // 요건은 공고에 붙고, 커버리지만 사용자별로 붙는다.
    const criteria: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into job_posting_requirement (
        id, job_posting_id, order_no, label, kind, source_span
      )
      values
        (
          ${criteria[0]!.id}, ${urgentId}, 0, '대용량 처리 경험', 'must',
          ${sql.json({ start: QUOTE_START, end: QUOTE_START + QUOTE.length, quote: QUOTE })}
        ),
        (
          ${criteria[1]!.id}, ${urgentId}, 1, '금융권 데이터 프로젝트 수행 경험', 'nice',
          ${sql.json({ start: QUOTE_START, end: QUOTE_START + QUOTE.length, quote: QUOTE })}
        )
    `;
    await sql`
      insert into requirement_coverage (user_id, requirement_id, coverage)
      values
        (${userId}, ${criteria[0]!.id}, 'covered'),
        (${userId}, ${criteria[1]!.id}, 'partial')
    `;

    await sql`
      insert into recent_search (user_id, query_text, conditions, result_count, created_at)
      values
        (${userId}, '배치 위주로 운영하는 팀', '[]', 9, now(6) - interval 2 hour),
        (${userId}, '연봉 협상 가능 · 리모트', '[]', 14, now(6) - interval 1 hour),
        (${otherUserId}, '다른 사람 검색', '[]', 3, now(6))
    `;

    await app.ready();
  });

  afterAll(async () => {
    if (userId) await sql`delete from \`user\` where id in (${userId}, ${otherUserId})`;
    if (urgentId) {
      await sql`delete from job_posting where id in (${urgentId}, ${laterId}, ${alwaysId})`;
    }
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("일치도 순으로 내려주고 점수 없는 공고는 뒤로 보낸다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings?${scoped()}`,
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);
    const body = JobPostingListResponseSchema.parse(response.json());

    expect(body.data.map((posting) => posting.id)).toEqual([
      urgentId,
      laterId,
      alwaysId,
    ]);
    // 요건 5개 전부 충족 → 100. 축의 합에서만 나온다.
    expect(body.data[0]?.match?.total).toBe(100);
    expect(body.data[0]?.match?.required).toBe(5);
    expect(body.data[2]?.match).toBeNull();
    expect(body.summary.total).toBe(3);
    expect(body.page.hasNextPage).toBe(false);
  });

  it("기술은 일치도가 있을 때만 있고 없음을 가른다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings?${scoped()}`,
      headers: auth(),
    });
    const body = JobPostingListResponseSchema.parse(response.json());

    expect(body.data[1]?.technologies).toEqual([
      { name: "Airflow", matched: true },
      { name: "Kafka", matched: false },
    ]);
    // 점수를 아직 내지 않았으면 있음/없음을 단정하지 않는다.
    expect(body.data[2]?.technologies).toEqual([{ name: "Go", matched: null }]);
  });

  it("공통 요구 기술을 필터 전체에서 센다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings?${scoped()}&limit=1`,
      headers: auth(),
    });
    const body = JobPostingListResponseSchema.parse(response.json());

    expect(body.data).toHaveLength(1);
    // 집계는 페이지가 아니라 3건 전체에서 나온다.
    expect(body.summary.commonTechnologies[0]).toEqual({
      label: "Airflow",
      count: 2,
      ratio: 2 / 3,
    });
  });

  it("마감 임박 · 관심 · 기술 필터가 각각 걸린다", async () => {
    const [urgent, interested, technology] = await Promise.all([
      app.inject({ method: "GET", url: `/v1/jobs/postings?${scoped("&deadline=urgent")}`, headers: auth() }),
      app.inject({ method: "GET", url: `/v1/jobs/postings?${scoped("&interested=true")}`, headers: auth() }),
      app.inject({ method: "GET", url: `/v1/jobs/postings?${scoped("&technology=kafka")}`, headers: auth() }),
    ]);

    expect(JobPostingListResponseSchema.parse(urgent.json()).data.map((p) => p.id))
      .toEqual([urgentId]);
    const saved = JobPostingListResponseSchema.parse(interested.json());
    expect(saved.data.map((p) => p.id)).toEqual([urgentId]);
    expect(saved.data[0]?.interest?.stage).toBe("applied");
    // 기술 이름은 대소문자를 가리지 않는다.
    expect(JobPostingListResponseSchema.parse(technology.json()).data.map((p) => p.id))
      .toEqual([laterId]);
  });

  it("마감 순과 최신 순은 정렬 기준이 다르다", async () => {
    const [deadline, recent] = await Promise.all([
      app.inject({ method: "GET", url: `/v1/jobs/postings?${scoped("&sort=deadline")}`, headers: auth() }),
      app.inject({ method: "GET", url: `/v1/jobs/postings?${scoped("&sort=recent")}`, headers: auth() }),
    ]);

    // 상시 모집은 맨 뒤다.
    expect(JobPostingListResponseSchema.parse(deadline.json()).data.map((p) => p.id))
      .toEqual([urgentId, laterId, alwaysId]);
    expect(JobPostingListResponseSchema.parse(recent.json()).data.map((p) => p.id))
      .toEqual([alwaysId, laterId, urgentId]);
  });

  it("쪽을 넘겨 읽으면 겹치지 않고, 몇 쪽까지인지 말한다", async () => {
    const first = JobPostingListResponseSchema.parse(
      (await app.inject({
        method: "GET",
        url: `/v1/jobs/postings?${scoped("&sort=deadline&limit=2")}`,
        headers: auth(),
      })).json(),
    );
    expect(first.page).toMatchObject({
      page: 1, pageSize: 2, totalPages: 2, hasPrevPage: false, hasNextPage: true,
    });

    const second = JobPostingListResponseSchema.parse(
      (await app.inject({
        method: "GET",
        url: `/v1/jobs/postings?${scoped("&sort=deadline&limit=2&page=2")}`,
        headers: auth(),
      })).json(),
    );

    expect(first.data.map((p) => p.id)).toEqual([urgentId, laterId]);
    expect(second.data.map((p) => p.id)).toEqual([alwaysId]);
    expect(second.page).toMatchObject({
      page: 2, totalPages: 2, hasPrevPage: true, hasNextPage: false,
    });
  });

  it("없는 쪽은 빈 목록이고, 0쪽은 거절한다", async () => {
    // 마지막 쪽 너머는 오류가 아니다 — 그 사이에 공고가 빠졌을 수도 있고,
    // 사용자가 주소창의 숫자를 고쳤을 수도 있다. 비어 있다고 말하면 된다.
    const beyond = JobPostingListResponseSchema.parse(
      (await app.inject({
        method: "GET",
        url: `/v1/jobs/postings?${scoped("&sort=deadline&limit=2&page=99")}`,
        headers: auth(),
      })).json(),
    );
    expect(beyond.data).toHaveLength(0);
    expect(beyond.page).toMatchObject({ page: 99, totalPages: 2, hasNextPage: false });
    // 걸린 수는 쪽과 무관하다 — 헤더의 "N건"이 쪽마다 달라지면 안 된다.
    expect(beyond.summary.total).toBe(3);

    const zero = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings?${scoped("&page=0")}`,
      headers: auth(),
    });
    expect(zero.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(zero.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("상세는 원문과 근거 구간, 톤, 순위를 함께 준다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings/${urgentId}`,
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);
    const { data } = JobPostingDetailResponseSchema.parse(response.json());

    expect(data.descriptionRaw).toBe(DESCRIPTION);
    expect(data.company.tonePalette).toEqual({ accent: "#FF6F0F", ink: "#16223A" });
    expect(data.analysis?.id).toBe(analysisId);
    const requirement = data.criteria[0]!;
    expect(requirement.coverage).toBe("covered");
    // 근거 구간이 원문의 그 자리를 정확히 가리킨다.
    expect(
      data.descriptionRaw.slice(requirement.sourceSpan.start, requirement.sourceSpan.end),
    ).toBe(requirement.sourceSpan.quote);
    expect(data.rank).toEqual({ position: 1, total: 2 });
    expect(data.daysLeft).toBe(3);
  });

  it("같은 공고라도 다른 사람에게는 점수도 해석도 없다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings/${urgentId}`,
      headers: auth(otherToken),
    });
    const { data } = JobPostingDetailResponseSchema.parse(response.json());

    expect(data.match).toBeNull();
    expect(data.interest).toBeNull();
    expect(data.analysis).toBeNull();
    expect(data.rank).toBeNull();
    expect(data.technologies.every((technology) => technology.matched === null)).toBe(true);
    // 요건은 공고에 붙어 있으니 그대로 보인다. 다만 대조한 적이 없어
    // 커버리지는 "없음"이 아니라 null이다.
    expect(data.criteria).toHaveLength(2);
    expect(data.criteria.every((item) => item.coverage === null)).toBe(true);
  });

  it("없는 공고는 404, 토큰이 없으면 401", async () => {
    const [missing, anonymous] = await Promise.all([
      app.inject({ method: "GET", url: `/v1/jobs/postings/${randomUUID()}`, headers: auth() }),
      app.inject({ method: "GET", url: "/v1/jobs/postings" }),
    ]);

    expect(missing.statusCode).toBe(404);
    expect(ApiErrorResponseSchema.parse(missing.json()).error.code).toBe("NOT_FOUND");
    expect(anonymous.statusCode).toBe(401);
  });

  it("카테고리 칩은 그 칩을 눌러도 흔들리지 않는다", async () => {
    const [all, urgentOnly] = await Promise.all([
      app.inject({ method: "GET", url: `/v1/jobs/postings?${scoped()}`, headers: auth() }),
      app.inject({
        method: "GET",
        url: `/v1/jobs/postings?${scoped("&deadline=urgent")}`,
        headers: auth(),
      }),
    ]);

    const chips = JobPostingListResponseSchema.parse(all.json()).summary.categories;
    expect(chips).toEqual([
      { key: "all", label: "전체", count: 3 },
      { key: "family:백엔드 · 데이터", label: "백엔드 · 데이터", count: 2 },
      { key: "family:플랫폼 · 인프라", label: "플랫폼 · 인프라", count: 1 },
      { key: "remote", label: "리모트", count: 2 },
      { key: "urgent", label: "마감 임박", count: 1 },
    ]);

    // 칩을 누르면 결과 수만 줄고, 칩의 숫자는 그대로여야 한다.
    const narrowed = JobPostingListResponseSchema.parse(urgentOnly.json());
    expect(narrowed.summary.total).toBe(1);
    expect(narrowed.summary.categories).toEqual(chips);
  });

  it("직군 · 리모트 필터가 칩 그대로 걸린다", async () => {
    const [family, remote] = await Promise.all([
      app.inject({
        method: "GET",
        url: `/v1/jobs/postings?${scoped("&family=" + encodeURIComponent("플랫폼 · 인프라"))}`,
        headers: auth(),
      }),
      app.inject({
        method: "GET",
        url: `/v1/jobs/postings?${scoped("&remote=true&sort=deadline")}`,
        headers: auth(),
      }),
    ]);

    expect(JobPostingListResponseSchema.parse(family.json()).data.map((p) => p.id))
      .toEqual([alwaysId]);
    expect(JobPostingListResponseSchema.parse(remote.json()).data.map((p) => p.id))
      .toEqual([urgentId, alwaysId]);
  });

  it("비어 있는 재료는 내 일치도가 못 채운 기술만 센다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings?${scoped()}`,
      headers: auth(),
    });
    const body = JobPostingListResponseSchema.parse(response.json());

    // Kafka만 missing으로 남았다. Go는 점수를 낸 적이 없어 세지 않는다.
    expect(body.summary.missingTechnologies).toEqual([
      { label: "Kafka", count: 1, ratio: 1 / 3 },
    ]);
  });

  it("상세는 사실 표 · 업무 · 전형까지 원문 그대로 준다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings/${urgentId}`,
      headers: auth(),
    });
    const { data } = JobPostingDetailResponseSchema.parse(response.json());

    expect(data.location).toBe("서울 강남");
    expect(data.workType).toBe("리모트 주 2일");
    expect(data.experienceLabel).toBe("3년 이상");
    expect(data.employmentType).toBe("정규직 · 수습 3개월");
    expect(data.salaryNote).toBe("8,000만 – 1억 1,000만");
    expect(data.duties).toEqual([
      { group: "적재 파이프라인", items: ["하루 3,000만 건 적재"] },
    ]);
    expect(data.hiringProcess).toEqual([{ label: "서류 전형" }, { label: "직무 · 기술 인터뷰" }]);
    expect(data.processNote).toBe("평균 3주");
    expect(data.company.brandColors).toEqual(["#1B2A4A", "#2E7CF6", "#EFF2F6"]);
    expect(data.company.avatarBackground).toBe("#EEF2FC");
    expect(data.company.toneImpression).toBe("정확 · 신뢰");

    // 추출된 nice 요건과 이름이 같은 우대 사항만 충족 표시가 붙는다.
    // 요건으로 뽑힌 적조차 없는 항목은 "없음"이 아니라 null이다 — 대조를
    // 안 한 것과 대조해서 없는 것은 다르다.
    expect(data.preferred).toEqual([
      { label: "금융권 데이터 프로젝트 수행 경험", coverage: "partial" },
      { label: "MLOps 파이프라인 구축", coverage: null },
    ]);
  });

  it("대조한 적 없으면 우대 사항 충족 여부는 '없음'이 아니라 null이다", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/postings/${urgentId}`,
      headers: auth(otherToken),
    });
    const { data } = JobPostingDetailResponseSchema.parse(response.json());

    expect(data.preferred.every((item) => item.coverage === null)).toBe(true);
    expect(data.topRecords).toEqual([]);
  });

  it("최근 검색은 내 것만, 최신 순으로 온다", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/jobs/recent-searches",
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);
    const body = RecentJobSearchListResponseSchema.parse(response.json());

    expect(body.data.map((search) => search.query)).toEqual([
      "연봉 협상 가능 · 리모트",
      "배치 위주로 운영하는 팀",
    ]);
    expect(body.data[0]?.resultCount).toBe(14);
  });
});
