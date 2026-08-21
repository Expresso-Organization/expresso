import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { CareerService } from "../career/service.js";
import { IdentityService } from "../identity/service.js";
import { JobMarketService } from "./service.js";

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
  queuePrefix: "expresso-jobs-test",
};

interface IdRow {
  id: string;
}

interface CountRow {
  count: number;
}

describeWithDatabase("job market integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identityService = new IdentityService(sql);
  const careerService = new CareerService(sql);
  const jobMarketService = new JobMarketService(sql);
  const app = buildApi({ config, identityService, jobMarketService });
  const marker = randomUUID();
  let firstUserId: string;
  let secondUserId: string;
  let firstToken: string;
  let secondToken: string;
  let experienceCategoryId: string;
  let primaryPostingId: string;
  let primaryCompanyId: string;
  const postingIds: string[] = [];

  const auth = (token = firstToken) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan missing");
    // 여러 행을 한 번에 넣을 때는 id 를 우리가 만들어 준다 — MySQL 은 returning 이 없다.
    firstUserId = randomUUID();
    secondUserId = randomUUID();
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${firstUserId}, ${`jobs-a-${marker}@example.com`}, 'Jobs A', ${planId}),
        (${secondUserId}, ${`jobs-b-${marker}@example.com`}, 'Jobs B', ${planId})
    `;
    firstToken = (await identityService.issueSession({ userId: firstUserId })).accessToken;
    secondToken = (await identityService.issueSession({ userId: secondUserId })).accessToken;
    experienceCategoryId = (await sql<IdRow[]>`
      select id from category where \`key\` = 'experience' and is_system
    `)[0]?.id ?? "";
    if (!experienceCategoryId) throw new Error("experience category missing");
    await app.ready();
  });

  afterAll(async () => {
    if (firstUserId && secondUserId) {
      await sql`
        delete from platform_outbox
        where topic = 'job.normalize'
          and payload ->> '$.userId' in (${firstUserId}, ${secondUserId})
      `;
      await sql`delete from \`user\` where id in (${firstUserId}, ${secondUserId})`;
    }
    if (postingIds.length > 0) {
      await sql`delete from job_posting where id = any(${postingIds}[])`;
    }
    if (primaryCompanyId) await sql`delete from company where id = ${primaryCompanyId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("preserves and deduplicates a 200+ character source while enqueueing normalization", async () => {
    const descriptionRaw = `Original source ${marker}. ` + "Backend platform responsibilities and evidence. ".repeat(8);
    const short = await app.inject({
      method: "POST",
      url: "/v1/jobs/submissions",
      headers: { ...auth(), "idempotency-key": `job-short-${marker}` },
      payload: { companyName: "Example", title: "Engineer", descriptionRaw: "short" },
    });
    expect(short.statusCode).toBe(400);

    const payload = {
      companyName: `Example ${marker}`,
      companyDomain: `${marker}.example.com`,
      title: "Backend Engineer",
      sourceUrl: `https://${marker}.example.com/jobs/backend`,
      descriptionRaw,
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/jobs/submissions",
      headers: { ...auth(), "idempotency-key": `job-submit-a-${marker}` },
      payload,
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/jobs/submissions",
      headers: { ...auth(), "idempotency-key": `job-submit-b-${marker}` },
      payload,
    });
    expect(first.statusCode).toBe(202);
    expect(duplicate.statusCode).toBe(202);
    primaryPostingId = first.json().data.jobPostingId;
    expect(duplicate.json().data).toMatchObject({
      jobPostingId: primaryPostingId,
      deduplicated: true,
    });
    postingIds.push(primaryPostingId);
    const posting = await sql<{
      description_raw: string;
      source_url: string;
      company_id: string;
    }[]>`
      select description_raw, source_url, company_id
      from job_posting where id = ${primaryPostingId}
    `;
    expect(posting[0]).toMatchObject({ description_raw: descriptionRaw, source_url: payload.sourceUrl });
    primaryCompanyId = posting[0]?.company_id ?? "";
    await expect(
      sql`update job_posting set description_raw = 'tampered' where id = ${primaryPostingId}`,
    ).rejects.toThrow(/immutable/);
    const outbox = await sql<CountRow[]>`
      select count(*) as count from platform_outbox
      where topic = 'job.normalize' and payload ->> '$.jobPostingId' = ${primaryPostingId}
    `;
    expect(outbox[0]?.count).toBe(2);
  });

  it("stores editable search conditions, enforces ten saved searches, and scopes recent/interest state", async () => {
    const query = "서울 3년 TypeScript 백엔드 remote 연봉 6000";
    const interpreted = await app.inject({
      method: "POST",
      url: "/v1/jobs/search/interpret",
      headers: auth(),
      payload: { query, resultCount: 12 },
    });
    expect(interpreted.statusCode).toBe(200);
    expect(interpreted.json()).toMatchObject({
      originalQuery: query,
      needsClarification: false,
    });
    expect(interpreted.json().conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "technology", value: "typescript", enabled: true }),
      expect.objectContaining({ field: "salary", value: 6000, enabled: false }),
    ]));
    const recentId = interpreted.json().recentSearchId as string;
    const crossDelete = await app.inject({
      method: "DELETE",
      url: `/v1/jobs/recent-searches/${recentId}`,
      headers: auth(secondToken),
    });
    expect(crossDelete.statusCode).toBe(404);
    expect((await app.inject({
      method: "DELETE",
      url: `/v1/jobs/recent-searches/${recentId}`,
      headers: auth(),
    })).statusCode).toBe(204);

    for (let index = 0; index < 10; index += 1) {
      await jobMarketService.saveSearch(firstUserId, {
        name: `Saved ${index}`,
        originalQuery: query,
        conditions: interpreted.json().conditions,
        notify: index === 0,
      });
    }
    await expect(jobMarketService.saveSearch(firstUserId, {
      name: "Saved 11",
      originalQuery: query,
      conditions: [],
      notify: false,
    })).rejects.toMatchObject({ statusCode: 409, publicDetails: { limit: 10 } });
    expect(await jobMarketService.listSavedSearches(firstUserId)).toHaveLength(10);

    const interest = await jobMarketService.upsertInterest(firstUserId, primaryPostingId, {
      stage: "saved",
      deadlineAt: "2026-08-20T00:00:00Z",
      memo: "Prepare evidence",
    });
    expect(interest).toMatchObject({ jobPostingId: primaryPostingId, stage: "saved" });
    const secondUserInterests = await sql<CountRow[]>`
      select count(*) as count from interest where user_id = ${secondUserId}
    `;
    expect(secondUserInterests[0]?.count).toBe(0);
  });

  it("requires three records, persists four-axis scores, and hides demand ratios below five jobs", async () => {
    await sql`
      update job_posting
      set requirements = ${sql.json({
        technologies: ["postgresql", "kubernetes"],
        impacts: ["scale"],
        roles: ["backend"],
        conditions: ["remote"],
      })}
      where id = ${primaryPostingId}
    `;
    for (const [index, text] of [
      "Backend engineer used PostgreSQL to scale services.",
      "Operated remote production systems.",
    ].entries()) {
      await careerService.createRecord(firstUserId, `match-${index}-${marker}`, {
        categoryId: experienceCategoryId,
        title: `Evidence ${index}`,
        properties: {},
        bodyMd: text,
      });
    }
    await expect(
      jobMarketService.computeMatch(firstUserId, primaryPostingId),
    ).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { required: 3, actual: 2 },
    });
    await careerService.createRecord(firstUserId, `match-3-${marker}`, {
      categoryId: experienceCategoryId,
      title: "Evidence 3",
      properties: {},
      bodyMd: "Led backend delivery with measurable outcomes.",
    });
    const match = await jobMarketService.computeMatch(
      firstUserId,
      primaryPostingId,
      new Date("2026-08-09T00:00:00Z"),
    );
    expect(Number.isInteger(match.total)).toBe(true);
    expect(Object.values(match.axes).reduce((sum, axis) => sum + axis.covered, 0)).toBe(match.covered);
    expect(match.total).toBe(Math.round((100 * match.covered) / match.required));
    expect(match.reason.length).toBeGreaterThan(0);
    expect(match.nextAction).toContain("기록");
    const persisted = await sql<{ total: string; reason_text: string; next_action: string }[]>`
      select total, reason_text, next_action from match_score
      where user_id = ${firstUserId} and job_posting_id = ${primaryPostingId}
    `;
    expect(Number(persisted[0]?.total)).toBe(match.total);

    for (let index = 0; index < 4; index += 1) {
      const rows = await sql<IdRow[]>`
        insert into job_posting (
          company_id, source, external_id, title,
          description_raw, requirements, dedupe_hash
        ) values (
          ${primaryCompanyId}, 'api', ${`demand-${marker}-${index}`},
          ${`Demand ${index}`}, ${`Demand source ${index}`},
          ${sql.json({
            technologies: index < 3 ? ["postgresql"] : ["kubernetes"],
            impacts: [], roles: [], conditions: [],
          })}, ${`demand-hash-${marker}-${index}`}
        ) returning id
      `;
      if (rows[0]) postingIds.push(rows[0].id);
    }
    expect(await jobMarketService.summarizeDemand(postingIds.slice(0, 4))).toEqual({
      sampleSize: 4,
      demandRatios: null,
    });
    const five = await jobMarketService.summarizeDemand(postingIds.slice(0, 5));
    expect(five.sampleSize).toBe(5);
    expect(five.demandRatios).not.toBeNull();
  });

  it("brings a board posting into a per-user analysis exactly once, without cloning the posting", async () => {
    const before = (await sql<CountRow[]>`
      select count(*) as count from job_posting where id = ${primaryPostingId}
    `)[0]?.count;

    const created = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${primaryPostingId}/analyses`,
      headers: auth(secondToken),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      jobPostingId: primaryPostingId,
      status: "queued",
      reused: false,
    });

    // 두 번 눌러도 분석은 한 벌이다 — 두 벌이면 어느 쪽이 내 커버리지인지 말할 수 없다.
    const again = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${primaryPostingId}/analyses`,
      headers: auth(secondToken),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data).toMatchObject({
      jobAnalysisId: created.json().data.jobAnalysisId,
      reused: true,
    });

    // 공고는 이미 있던 것을 쓴다. 본문 해시로 다시 찾으면 사본이 하나 더 생긴다.
    expect((await sql<CountRow[]>`
      select count(*) as count from job_posting where id = ${primaryPostingId}
    `)[0]?.count).toBe(before);
    expect((await sql<CountRow[]>`
      select count(*) as count from job_analysis
      where user_id = ${secondUserId} and job_posting_id = ${primaryPostingId}
    `)[0]?.count).toBe(1);

    // 요건을 뽑는 것은 워커가 한다. 여기서는 자리만 만들고 큐에 넣는다.
    expect((await sql<CountRow[]>`
      select count(*) as count from platform_outbox
      where topic = 'job.normalize'
        and payload ->> '$.jobAnalysisId' = ${created.json().data.jobAnalysisId}
    `)[0]?.count).toBe(1);

    const missing = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${randomUUID()}/analyses`,
      headers: auth(secondToken),
    });
    expect(missing.statusCode).toBe(404);
  });
});
