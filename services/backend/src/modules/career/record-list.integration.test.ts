import { randomUUID } from "node:crypto";
import {
  ApiErrorResponseSchema,
  CareerRecordListResponseSchema,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { createMysqlResource } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { CareerService } from "./service.js";

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
  queuePrefix: "expresso-career-list-test",
};

interface IdRow {
  id: string;
}

interface CategoryKeyRow {
  id: string;
  key: string;
}

describeWithDatabase("career record list HTTP integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identityService = new IdentityService(sql);
  const app = buildApi({ config, identityService, careerService: new CareerService(sql) });

  let userId: string;
  let otherUserId: string;
  let authorization: string;
  let experienceId: string;
  let projectId: string;

  beforeAll(async () => {
    const plans = await sql<IdRow[]>`select id from plan where code = 'free'`;
    const planId = plans[0]?.id;
    if (!planId) throw new Error("test plan was not available");

    const users: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, ${`career-list-${crypto.randomUUID()}@example.com`}, '목록 사용자', ${planId}),
        (${users[1]!.id}, ${`career-other-${crypto.randomUUID()}@example.com`}, '다른 사용자', ${planId})
    `;
    const [owner, other] = users;
    if (!owner || !other) throw new Error("test users were not persisted");
    userId = owner.id;
    otherUserId = other.id;

    const categories = await sql<CategoryKeyRow[]>`
      select id, \`key\` from category
      where user_id is null and \`key\` in ('experience', 'project')
    `;
    experienceId = categories.find((row) => row.key === "experience")!.id;
    projectId = categories.find((row) => row.key === "project")!.id;

    // 정렬·페이지네이션 경계를 보려면 updated_at이 동률인 행이 필요하다.
    const sharedUpdatedAt = "2026-03-01T00:00:00Z";
    await sql`
      insert into record (user_id, category_id, title, status, origin, properties, body_md, period_start, period_end, updated_at)
      values
        (${userId}, ${experienceId}, '적재 파이프라인 구축', 'organized', 'manual', '{"role":"백엔드"}', '3천만 건을 매일 적재했습니다.', '2024-01-01', '2024-12-31', ${sharedUpdatedAt}),
        (${userId}, ${experienceId}, '정산 스케줄러 안정화', 'draft', 'interview', '{}', '', '2023-01-01', '2023-06-30', ${sharedUpdatedAt}),
        (${userId}, ${experienceId}, '장애 대응 3일', 'organized', 'ai', '{}', '로그 없이 원인을 좁혔습니다.', null, '2026-04-01 00:00:00'),
        (${userId}, ${projectId}, '데이터 품질 모니터링', 'verified', 'manual', '{}', '자동화했습니다.', '2025-01-01', '2025-08-31', '2026-05-01 00:00:00'),
        (${otherUserId}, ${experienceId}, '남의 기록', 'organized', 'manual', '{}', '보이면 안 됩니다.', null, '2026-06-01 00:00:00')
    `;

    const owned = await sql<{ id: string; title: string }[]>`
      select id, title from record where user_id = ${userId}
    `;
    experienceId = experienceId;
    projectId = projectId;
    const pipeline = owned.find((row) => row.title === "적재 파이프라인 구축");
    const monitoring = owned.find((row) => row.title === "데이터 품질 모니터링");
    if (!pipeline || !monitoring) throw new Error("test records were not persisted");

    await sql`
      insert into record_link (user_id, from_record_id, to_record_id, relation, created_by)
      values (${userId}, ${pipeline.id}, ${monitoring.id}, 'related', 'user')
    `;

    const session = await identityService.issueSession({ userId });
    authorization = `Bearer ${session.accessToken}`;
    await app.ready();
  });

  afterAll(async () => {
    if (userId && otherUserId) {
      await sql`delete from \`user\` where id in (${userId}, ${otherUserId})`;
    }
    await app.close();
    await sql.end({ timeout: 5 });
  });

  async function list(query: string) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/career/records${query}`,
      headers: { authorization },
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  it("returns only the caller's records with the aggregate bar counts", async () => {
    const { statusCode, body } = await list("");
    expect(statusCode).toBe(200);

    const result = CareerRecordListResponseSchema.parse(body);
    expect(result.data).toHaveLength(4);
    expect(result.data.map((record) => record.title)).not.toContain("남의 기록");
    expect(result.summary).toEqual({
      total: 4,
      draft: 1,
      organized: 2,
      verified: 1,
      empty: 1,
    });

    const emptyRecord = result.data.find((record) => record.title === "정산 스케줄러 안정화");
    expect(emptyRecord?.isEmpty).toBe(true);
    const written = result.data.find((record) => record.title === "장애 대응 3일");
    expect(written?.isEmpty).toBe(false);
  });

  it("filters by category, status and title, narrowing the summary with the list", async () => {
    const byCategory = CareerRecordListResponseSchema.parse(
      (await list(`?categoryId=${projectId}`)).body,
    );
    expect(byCategory.data).toHaveLength(1);
    expect(byCategory.summary.total).toBe(1);
    expect(byCategory.data[0]?.categoryKey).toBe("project");

    const byStatus = CareerRecordListResponseSchema.parse(
      (await list("?status=organized")).body,
    );
    expect(byStatus.data.map((record) => record.status)).toEqual([
      "organized",
      "organized",
    ]);

    const byTitle = CareerRecordListResponseSchema.parse(
      (await list("?q=파이프라인")).body,
    );
    expect(byTitle.data).toHaveLength(1);
    expect(byTitle.data[0]?.title).toBe("적재 파이프라인 구축");
  });

  it("exposes period bounds and relationship counts the four views need", async () => {
    const result = CareerRecordListResponseSchema.parse(
      (await list("?sort=period_desc")).body,
    );

    // 05c 타임라인 뷰 — 기간이 없는 기록은 마지막으로 밀린다.
    expect(result.data.at(-1)?.title).toBe("장애 대응 3일");
    expect(result.data.at(-1)?.periodFrom).toBeNull();

    const pipeline = result.data.find((record) => record.title === "적재 파이프라인 구축");
    expect(pipeline?.periodFrom).toBe("2024-01-01");
    // daterange의 상한은 배타적이다 — 화면에서 종료일을 보일 때 하루를 빼야 한다.
    expect(pipeline?.periodTo).toBe("2024-12-31");
    expect(pipeline?.linkCount).toBe(1);
    expect(pipeline?.usedInCount).toBe(0);

    const ascending = CareerRecordListResponseSchema.parse(
      (await list("?sort=period_asc")).body,
    );
    expect(ascending.data[0]?.title).toBe("정산 스케줄러 안정화");
    expect(ascending.data.at(-1)?.periodFrom).toBeNull();
  });

  it("pages through updated_at ties without dropping or repeating a record", async () => {
    const firstPage = CareerRecordListResponseSchema.parse(
      (await list("?limit=2")).body,
    );
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.page.hasNextPage).toBe(true);
    expect(firstPage.page.nextCursor).not.toBeNull();
    // 집계 바는 페이지가 아니라 전체 기준이다.
    expect(firstPage.summary.total).toBe(4);

    const secondPage = CareerRecordListResponseSchema.parse(
      (await list(`?limit=2&cursor=${encodeURIComponent(firstPage.page.nextCursor!)}`)).body,
    );
    expect(secondPage.data).toHaveLength(2);
    expect(secondPage.page.hasNextPage).toBe(false);
    expect(secondPage.page.nextCursor).toBeNull();

    const seen = [...firstPage.data, ...secondPage.data].map((record) => record.id);
    expect(new Set(seen).size).toBe(4);

    const all = CareerRecordListResponseSchema.parse((await list("")).body);
    expect(seen).toEqual(all.data.map((record) => record.id));
  });

  it("refuses a cursor issued for a different sort order", async () => {
    const firstPage = CareerRecordListResponseSchema.parse(
      (await list("?limit=2")).body,
    );
    const mismatched = await list(
      `?limit=2&sort=title_asc&cursor=${encodeURIComponent(firstPage.page.nextCursor!)}`,
    );
    expect(mismatched.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(mismatched.body).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("requires authentication", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/v1/career/records" });
    expect(anonymous.statusCode).toBe(401);
  });
});
