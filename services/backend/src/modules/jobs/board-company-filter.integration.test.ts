import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import { JobPostingListResponseSchema } from "@expresso/contracts";
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
  queuePrefix: "expresso-company-filter-test",
};

interface IdRow {
  id: string;
}

/**
 * 회사 하나로 좁혔을 때 응답이 계약을 지키는가.
 *
 * 2026-08-13에 `/jobs?company=<uuid>`가 500으로 죽던 자리다. 회사 칩의 건수는
 * **회사 조건을 뺀** 모집단에서 센다(그래야 다른 회사로 갈아탈 수 있다).
 * 그런데 비율을 걸러진 총계로 나누고 있었다 — 작은 회사로 좁히면 큰 회사의
 * 비율이 1을 넘고, 계약이 `ratio <= 1`이라 응답이 통째로 거절된다.
 *
 * 나라 칩에는 이미 같은 고침이 있었고 회사만 빠져 있었다. 기존 시험이 못 잡은
 * 이유는 하나다 — **회사가 하나뿐이었다.** 그러면 비율이 늘 1이다.
 */
describeWithDatabase("회사 필터", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identity = new IdentityService(sql);
  const app = buildApi({
    config,
    identityService: identity,
    jobBoardService: new JobBoardService(sql),
  });

  const marker = randomUUID().slice(0, 8);
  const body = `회사 필터 시험 본문 ${marker}. ${"충분히 긴 설명. ".repeat(10)}`;
  let userId = "";
  let token = "";
  let smallCompanyId = "";
  let bigCompanyId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan missing");
    userId = (await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id)
      values (${`company-filter-${marker}@example.com`}, '회사 필터', ${planId})
      returning id
    `)[0]!.id;
    token = (await identity.issueSession({ userId })).accessToken;

    const company = async (name: string) =>
      (await sql<IdRow[]>`
        insert into company (name, dedupe_key)
        values (${`${name} ${marker}`}, ${`cf-${name}-${marker}`})
        returning id
      `)[0]!.id;
    smallCompanyId = await company("작은회사");
    bigCompanyId = await company("큰회사");

    const seed = async (companyId: string, count: number, prefix: string) => {
      for (let index = 1; index <= count; index += 1) {
        await sql`
          insert into job_posting (
            company_id, source, title, description_raw, requirements,
            dedupe_hash, created_at, location, job_family
          )
          values (
            ${companyId}, 'user_input', ${`${prefix} 엔지니어 ${index}`},
            ${body}, '{}',
            ${`cf-${prefix}-${marker}-${index}`}, now(6) - interval 1 minute,
            '서울', '백엔드 · 데이터'
          )
        `;
      }
    };
    // 큰 쪽이 작은 쪽보다 많아야 비율이 1을 넘는다.
    await seed(smallCompanyId, 2, "small");
    await seed(bigCompanyId, 9, "big");
    await app.ready();
  });

  afterAll(async () => {
    await sql`delete from job_posting where company_id in (${smallCompanyId}, ${bigCompanyId})`;
    await sql`delete from company where id in (${smallCompanyId}, ${bigCompanyId})`;
    await sql`delete from \`user\` where id = ${userId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  const list = (extra = "") =>
    app.inject({
      method: "GET",
      url: `/v1/jobs/postings?q=${marker}${extra}`,
      headers: { authorization: `Bearer ${token}` },
    });

  it("작은 회사로 좁혀도 응답이 계약을 지킨다", async () => {
    const response = await list(`&company=${smallCompanyId}`);

    expect(response.statusCode).toBe(200);
    const payload = JobPostingListResponseSchema.parse(response.json());
    expect(payload.data).toHaveLength(2);
    expect(payload.data.every((posting) => posting.company.id === smallCompanyId)).toBe(true);
  });

  it("좁힌 뒤에도 다른 회사 칩이 남는다 — 갈아탈 수 있어야 한다", async () => {
    const payload = JobPostingListResponseSchema.parse((await list(`&company=${smallCompanyId}`)).json());
    const big = payload.summary.companies.find((chip) => chip.key === bigCompanyId);

    // 좁힌 총계(2)보다 큰 건수(9)가 그대로 보인다. 여기가 비율을 망가뜨리던 값이다.
    expect(big?.count).toBe(9);
    expect(big?.ratio).toBeLessThanOrEqual(1);
    for (const chip of payload.summary.companies) {
      expect(chip.ratio).toBeGreaterThanOrEqual(0);
      expect(chip.ratio).toBeLessThanOrEqual(1);
    }
  });
});
