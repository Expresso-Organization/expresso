import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../../platform/mysql.js";

import type { JobFactsAiOutput } from "@expresso/contracts";
import type { SqlTag } from "../../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AiCallSpec, AiClient, AiResult } from "../../../platform/ai/client.js";
import type { JobSourceAdapter, RawPosting } from "./adapter.js";
import { AiFactsReader } from "./facts.js";
import { JobIngestService } from "./service.js";

import { MongoJobIngestService } from "./mongo-service.js";
import type { JobIngestApi } from "./index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../../test/support/mongodb.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

class FakeAdapter implements JobSourceAdapter {
  readonly provider = "greenhouse" as const;
  postings: RawPosting[] = [];
  async fetch(): Promise<RawPosting[]> {
    return this.postings;
  }
}

class CountingAi implements AiClient {
  calls = 0;
  failUntil = 0;
  answer: JobFactsAiOutput = {
    salary: null,
    experience: { value: "3년 이상", quote: "경력 3년 이상" },
    workType: null,
  };

  async complete<T>(_spec: AiCallSpec): Promise<AiResult<T>> {
    this.calls += 1;
    if (this.calls <= this.failUntil) throw new Error("model is down");
    return {
      data: this.answer as T,
      usage: {
        model: "fake", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, costUsd: 0, durationMs: 0,
      },
    };
  }
}

function posting(marker: string, index: number): RawPosting {
  return {
    externalId: `${marker}-${index}`,
    title: `Backend Engineer ${index}`,
    companyName: `Facts ${marker}`,
    descriptionRaw: `${marker}-${index}\n경력 3년 이상. ${"충분히 긴 공고 본문. ".repeat(20)}`,
    sourceUrl: `https://example.com/${marker}/${index}`,
    location: "서울",
    employmentType: "정규직",
    experienceLabel: null,
    team: "플랫폼",
    expiresAt: null,
  };
}

for (const engine of ["mysql", "mongodb"] as const) {
describe.skipIf(engine === "mysql" ? !databaseUrl : !process.env.TEST_MONGODB_URL)(`수집과 본문 읽기의 분리 (${engine})`, () => {
  let sql: SqlTag;
  let fixture: Awaited<ReturnType<typeof createMongoFixture>> | undefined;
  const marker = randomUUID().slice(0, 8);
  const adapter = new FakeAdapter();
  const model = new CountingAi();
  let service: JobIngestApi;
  /** 읽기 담당이 아예 없는 경우(AI 꺼짐). */
  let readerless: JobIngestApi;
  let sourceId = "";

  const pendingCount = async () => {
    if (fixture) return mongoCollections(fixture.resource.db).jobPostings.countDocuments({ factsReadAt: null });
    const [row] = await sql<{ count: string }[]>`
      select count(*) as count from job_posting
      where facts_read_at is null and external_id like ${`%${marker}%`}
    `;
    return Number(row?.count ?? 0);
  };

  beforeAll(async () => {
    if (engine === "mongodb") {
      fixture = await createMongoFixture("posting-facts");
      service = new MongoJobIngestService(fixture.resource, [adapter], new AiFactsReader(model));
      readerless = new MongoJobIngestService(fixture.resource, [adapter]);
    } else {
      sql = createMysqlResource(databaseUrl!).sql;
      service = new JobIngestService(sql, [adapter], new AiFactsReader(model));
      readerless = new JobIngestService(sql, [adapter]);
    }
    const source = await service.addSource({
      provider: "greenhouse",
      token: `facts-${marker}`,
      displayName: `Facts ${marker}`,
    });
    sourceId = source.id;
    adapter.postings = [1, 2, 3].map((index) => posting(marker, index));
  }, 60_000);

  afterAll(async () => {
    if (fixture) { await fixture.dispose(); return; }
    await sql`delete from job_posting where external_id like ${`%${marker}%`}`;
    await sql`delete from company where name = ${`Facts ${marker}`}`;
    await sql`delete from job_source where id = ${sourceId}`;
    await sql.end({ timeout: 5 });
  });

  it("수집은 모델을 한 번도 부르지 않는다", async () => {
    const run = await service.run(new Date(), [sourceId]);

    expect(run.totals.added).toBe(3);
    // 요점이다. 모델이 죽어 있어도 공고 목록은 최신이 된다.
    expect(model.calls).toBe(0);
    expect(await pendingCount()).toBe(3);
    // 수집 결과에는 이제 본문 읽기 수가 없다.
    expect(run.totals).not.toHaveProperty("factsRead");

    /*
     * `readPendingFacts`는 **전역으로** 안 읽힌 공고를 오래된 순으로 집어간다.
     * 같은 DB를 쓰는 다른 시험 파일의 공고가 섞이면 배치 크기 시험이 순서에
     * 휘둘린다. 내 것을 확실히 맨 앞에 세워 둔다.
     */
    if (fixture) await mongoCollections(fixture.resource.db).jobPostings.updateMany({}, { $set: { createdAt: new Date("2000-01-01T00:00:00Z") } });
    else await sql`
      update job_posting set created_at = '2000-01-01 00:00:00'
      where external_id like ${`%${marker}%`}
    `;
  });

  it("본문 읽기는 따로 돌고, 밀린 수를 함께 알려 준다", async () => {
    const first = await service.readPendingFacts(2);

    expect(first.read).toBe(2);
    expect(first.failed).toBe(0);
    expect(first.skipped).toBeNull();
    // 한 번에 집어가는 양을 넘기지 않는다. 남은 것은 다음 실행이 본다.
    expect(first.pending).toBeGreaterThanOrEqual(1);
    expect(await pendingCount()).toBe(1);

    /*
     * 두 번째 배치에는 남은 내 것 하나에 더해 다른 시험 파일의 공고가 섞일 수
     * 있다(전역 대기열이다). 세는 것은 내 것이 다 읽혔는가다.
     */
    const second = await service.readPendingFacts(2);
    expect(second.read).toBeGreaterThanOrEqual(1);
    expect(await pendingCount()).toBe(0);

    const [row] = fixture ? [{ experience_note: (await mongoCollections(fixture.resource.db).jobPostings.findOne({ externalId: `greenhouse:facts-${marker}:${marker}-1` }))?.experienceNote }] : await sql<{ experience_note: string | null }[]>`
      select experience_note from job_posting
      where external_id = ${`greenhouse:facts-${marker}:${marker}-1`}
    `;
    expect(row?.experience_note).toBe("3년 이상");
  });

  it("이미 읽은 공고는 다시 집어가지 않는다", async () => {
    expect(await pendingCount()).toBe(0);
    await service.readPendingFacts();
    // 다른 시험 파일의 공고가 섞여 들 수 있으므로 내 것만 본다.
    expect(await pendingCount()).toBe(0);
  });

  it("모델이 죽으면 실패로 세고 그 공고를 다음에 다시 본다", async () => {
    if (fixture) await mongoCollections(fixture.resource.db).jobPostings.updateOne({ externalId: `greenhouse:facts-${marker}:${marker}-1` }, { $set: { factsReadAt: null, experienceNote: null } });
    else await sql`
      update job_posting set facts_read_at = null, experience_note = null
      where external_id = ${`greenhouse:facts-${marker}:${marker}-1`}
    `;
    model.failUntil = model.calls + 1;

    const failedRun = await service.readPendingFacts(1);
    expect(failedRun.read).toBe(0);
    expect(failedRun.failed).toBe(1);
    // 찍지 않았으므로 다음 실행이 다시 집어간다.
    expect(await pendingCount()).toBe(1);

    const retry = await service.readPendingFacts(1);
    expect(retry.read).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it("읽기 담당이 없으면 0건을 읽었다고 하지 않고 그렇다고 적는다", async () => {
    const run = await readerless.readPendingFacts();
    expect(run.read).toBe(0);
    expect(run.skipped).toBe("reader is not configured");
  });
});

}
