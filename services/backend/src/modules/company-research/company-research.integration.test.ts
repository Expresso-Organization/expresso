import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CompanyResearchError, CompanyResearchService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface IdRow { id: string }

describeWithDatabase("company research normalization", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused");
  const service = new CompanyResearchService(sql);
  const marker = randomUUID();
  let userId = "";
  let otherUserId = "";
  let companyId = "";
  let postingId = "";
  let brewId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan missing");
    const users = await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id) values
        (${`research-a-${marker}@example.com`}, 'Research A', ${planId}),
        (${`research-b-${marker}@example.com`}, 'Research B', ${planId})
      returning id
    `;
    userId = users[0]?.id ?? "";
    otherUserId = users[1]?.id ?? "";
    companyId = (await sql<IdRow[]>`
      insert into company (name, dedupe_key)
      values (${`Research ${marker}`}, ${`research-${marker}`}) returning id
    `)[0]?.id ?? "";
    postingId = (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId}, 'user_input', 'Designer', 'Portfolio', '{}'::jsonb,
              ${`research-posting-${marker}`}) returning id
    `)[0]?.id ?? "";
    const analysisId = (await sql<IdRow[]>`
      insert into job_analysis (
        user_id, job_posting_id, input_type, status, progress_stage,
        result_version, target_version, analyzed_at
      ) values (${userId}, ${postingId}, 'paste', 'done', 'done', 1, 1, now()) returning id
    `)[0]?.id;
    brewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset, status)
      values (${userId}, ${analysisId!}, 'single', 'draft') returning id
    `)[0]?.id ?? "";
  });

  afterAll(async () => {
    if (userId || otherUserId) {
      await sql`delete from "user" where id in (${userId}, ${otherUserId})`;
    }
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await sql.end({ timeout: 5 });
  });

  it("fact의 출처와 signal의 근거 연결을 함께 저장한다", async () => {
    const items = await service.replace(userId, brewId, {
      items: [
        {
          kind: "fact",
          topic: "product",
          statement: "공식 제품 정보를 확인했다",
          sourceUrl: "https://example.com/product",
          publishedAt: null,
          confidence: "high",
          basisFactIndexes: [],
        },
        {
          kind: "signal",
          topic: "portfolio-priority",
          statement: "사용자 흐름 설명을 앞세울 가치가 있다",
          sourceUrl: null,
          publishedAt: null,
          confidence: "medium",
          basisFactIndexes: [0],
        },
      ],
    });

    const fact = items.find(({ kind }) => kind === "fact")!;
    const signal = items.find(({ kind }) => kind === "signal")!;
    expect(fact.sourceUrl).toBe("https://example.com/product");
    expect(signal.basisFactIds).toEqual([fact.id]);
    await expect(service.list(otherUserId, brewId)).rejects.toBeInstanceOf(CompanyResearchError);
  });

  it("출처 없는 fact와 근거 없는 signal을 거절한다", async () => {
    await expect(service.replace(userId, brewId, {
      items: [{
        kind: "fact",
        topic: "product",
        statement: "출처 없는 주장",
        sourceUrl: null,
        publishedAt: null,
        confidence: "low",
        basisFactIndexes: [],
      }],
    })).rejects.toMatchObject({ statusCode: 422 });
  });
});
