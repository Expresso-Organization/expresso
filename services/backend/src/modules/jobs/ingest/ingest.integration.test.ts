import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { JobFactsAiOutput } from "@expresso/contracts";

import type { AiCallSpec, AiClient, AiResult } from "../../../platform/ai/client.js";
import type { JobSourceAdapter, RawPosting } from "./adapter.js";
import { AiFactsReader } from "./facts.js";
import type { CompanyMark, MarkReader } from "./logo.js";
import { JobIngestService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface IdRow { id: string }
interface CountRow { count: number }

/** 바깥을 부르지 않는다. 수집 규칙만 본다 — 남의 서버는 우리가 고칠 수 없다. */
class FakeAdapter implements JobSourceAdapter {
  readonly provider = "greenhouse" as const;
  postings: RawPosting[] = [];
  failure: Error | null = null;
  calls = 0;

  async fetch(): Promise<RawPosting[]> {
    this.calls += 1;
    if (this.failure) throw this.failure;
    return this.postings;
  }
}

/** 무엇을 답할지 시험이 정해 주는 모델. 검증기까지 진짜 코드로 지난다. */
class FakeAi implements AiClient {
  answer: JobFactsAiOutput = { salary: null, experience: null, workType: null };
  calls = 0;

  async complete<T>(_spec: AiCallSpec): Promise<AiResult<T>> {
    this.calls += 1;
    return {
      data: this.answer as T,
      usage: {
        model: "fake", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, costUsd: 0, durationMs: 0,
      },
    };
  }
}

/** 회사 사이트를 부르지 않는다. 우리가 무엇을 저장하는지만 본다. */
class FakeMarks implements MarkReader {
  mark: CompanyMark | null = null;
  asked: string[] = [];
  async read(siteUrl: string): Promise<CompanyMark | null> {
    this.asked.push(siteUrl);
    return this.mark;
  }
}

function posting(marker: string, index: number, body = "충분히 긴 공고 본문. ".repeat(20)): RawPosting {
  return {
    externalId: `${marker}-${index}`,
    title: `Backend Engineer ${index}`,
    companyName: `Ingest ${marker}`,
    descriptionRaw: `${marker}-${index}\n${body}`,
    sourceUrl: `https://example.com/${marker}/${index}`,
    location: "서울",
    employmentType: "정규직",
    experienceLabel: "경력",
    team: "플랫폼",
    expiresAt: null,
  };
}

describeWithDatabase("job ingest integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 4 });
  const marker = randomUUID().slice(0, 8);
  const adapter = new FakeAdapter();
  const model = new FakeAi();
  const marks = new FakeMarks();
  const service = new JobIngestService(sql, [adapter], new AiFactsReader(model), marks);
  let sourceId = "";

  beforeAll(async () => {
    const source = await service.addSource({
      provider: "greenhouse",
      token: `ingest-${marker}`,
      displayName: `수집 ${marker}`,
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    await sql`delete from job_posting where company_id in (
      select id from company where name like ${`Ingest ${marker}%`}
    )`;
    await sql`delete from company where name like ${`Ingest ${marker}%`}`;
    if (sourceId) await sql`delete from job_source where id = ${sourceId}`;
    await sql.end({ timeout: 5 });
  });

  it("모은 것만큼 넣고, 다시 돌려도 늘지 않는다", async () => {
    adapter.postings = [posting(marker, 1), posting(marker, 2), posting(marker, 3)];

    const first = await service.run(new Date(), [sourceId]);
    const firstRow = first.sources.find((one) => one.sourceId === sourceId);
    expect(firstRow).toMatchObject({ seen: 3, added: 3, skipped: 0, error: null });

    // 같은 공고를 다시 봐도 새로 넣지 않는다. 원문은 고칠 수 없으므로(0002)
    // 재수집은 **새 공고를 넣는 일**이지 갱신이 아니다.
    const second = await service.run(new Date(), [sourceId]);
    expect(second.sources.find((one) => one.sourceId === sourceId))
      .toMatchObject({ seen: 3, added: 0, skipped: 3, error: null });

    const stored = await sql<{
      source: string; external_id: string; source_board: string;
      location: string; employment_type: string; team: string;
    }[]>`
      select source, external_id, source_board, location, employment_type, team
      from job_posting where external_id like ${`greenhouse:ingest-${marker}:%`}
      order by external_id
    `;
    expect(stored).toHaveLength(3);
    expect(stored[0]).toMatchObject({
      source: "api",
      external_id: `greenhouse:ingest-${marker}:${marker}-1`,
      source_board: `수집 ${marker}`,
      location: "서울",
      employment_type: "정규직",
      team: "플랫폼",
    });
  });

  it("본문이 짧으면 들이지 않는다 — 뽑을 요건이 없다", async () => {
    adapter.postings = [{ ...posting(marker, 90), descriptionRaw: "짧다" }];
    const run = await service.run(new Date(), [sourceId]);
    expect(run.sources.find((one) => one.sourceId === sourceId))
      .toMatchObject({ seen: 1, added: 0 });
    expect((await sql<CountRow[]>`
      select count(*)::integer as count from job_posting
      where external_id = ${`greenhouse:ingest-${marker}:${marker}-90`}
    `)[0]?.count).toBe(0);
  });

  it("한 출처가 죽어도 나머지는 돌고, 왜 죽었는지 남는다", async () => {
    const otherToken = `ingest-alt-${marker}`;
    const alt = await service.addSource({
      provider: "greenhouse", token: otherToken, displayName: `대체 ${marker}`,
    });
    adapter.failure = new Error("boards-api returned HTTP 500");
    const run = await service.run(new Date(), [sourceId, alt.id]);
    adapter.failure = null;

    expect(run.totals.failedSources).toBe(2);
    for (const row of run.sources) expect(row.error).toContain("HTTP 500");
    expect((await sql<{ last_status: string; last_error: string }[]>`
      select last_status, last_error from job_source where id = ${alt.id}
    `)[0]).toMatchObject({ last_status: "failed", last_error: "boards-api returned HTTP 500" });

    await sql`delete from job_source where id = ${alt.id}`;
  });

  it("어댑터가 없는 프로바이더는 켤 수 없다 — 매일 조용히 실패한다", async () => {
    await expect(service.addSource({
      provider: "work24", token: "R600", displayName: "고용24",
    })).rejects.toMatchObject({ statusCode: 422 });
  });

  it("같은 내용이 다른 출처로 들어오면 한 번만 선다", async () => {
    const duplicateToken = `ingest-dup-${marker}`;
    const duplicate = await service.addSource({
      provider: "greenhouse", token: duplicateToken, displayName: `중복 ${marker}`,
    });
    // 1번과 글자 하나까지 같은 공고. external_id는 다르다.
    adapter.postings = [{ ...posting(marker, 1), externalId: "other-1" }];
    const run = await service.run(new Date(), [duplicate.id]);

    expect(run.sources.find((one) => one.sourceId === duplicate.id))
      .toMatchObject({ seen: 1, added: 0, skipped: 1 });
    expect((await sql<CountRow[]>`
      select count(*)::integer as count from job_posting
      where description_raw like ${`${marker}-1%`}
    `)[0]?.count).toBe(1);

    await sql`delete from job_source where id = ${duplicate.id}`;
    adapter.postings = [];
  });

  it("출처 목록에 마지막 수집 결과가 남는다", async () => {
    const sources = await service.listSources();
    const mine = sources.find((one) => one.id === sourceId);
    expect(mine).toMatchObject({ provider: "greenhouse", displayName: `수집 ${marker}` });
    expect(mine?.lastRunAt).not.toBeNull();
  });

  it("존재하지 않는 출처 id는 만들어지지 않는다", async () => {
    const rows = await sql<IdRow[]>`select id from job_source where id = ${sourceId}`;
    expect(rows).toHaveLength(1);
  });

  it("모델이 읽은 것을 담되, 원문에 없는 값은 버린다", async () => {
    const body = `우리는 이런 분을 찾습니다. ${"자세한 소개 문장. ".repeat(15)}

-   Backend 개발 경력 최소 6년 이상

**Type of work model**

-   Hybrid

The base pay for this position ranges from $174,00/year to $299,000/year.`;
    adapter.postings = [posting(marker, 7, body)];
    // 연봉은 공고가 0을 빠뜨린 자리다. 모델이 "고쳐" 준 값이 들어오면 버려야 한다.
    model.answer = {
      salary: {
        value: "$174,000–$299,000",
        quote: "The base pay for this position ranges from $174,00/year to $299,000/year.",
      },
      experience: { value: "6년 이상", quote: "Backend 개발 경력 최소 6년 이상" },
      workType: { value: "하이브리드", quote: "**Type of work model**\n\n-   Hybrid" },
    };
    await service.run(new Date(), [sourceId]);
    // 읽기는 수집이 하지 않는다. 나눠 둔 두 번째 걸음이 한다.
    await service.readPendingFacts();

    const [row] = await sql<{
      salary_note: string | null; experience_note: string | null;
      work_type: string | null; facts_read_at: Date | null;
    }[]>`
      select salary_note, experience_note, work_type, facts_read_at
      from job_posting where external_id = ${`greenhouse:ingest-${marker}:${marker}-7`}
    `;
    expect(row).toMatchObject({
      salary_note: null,
      experience_note: "6년 이상",
      work_type: "하이브리드",
    });
    // 읽어 보긴 했다. 이 값으로 수집이 다음에 읽을 공고를 고른다.
    expect(row?.facts_read_at).not.toBeNull();
  });

  it("나중에 출처에 사이트를 적어도 이미 들인 회사에 따라 붙는다", async () => {
    /*
     * 2026-08-13에 막혔던 자리다. 씨앗에 `site_url`이 없어 회사의 `domain`이
     * 비었고, 뒤늦게 적어 넣은 뒤 수집을 다시 돌려도 **공고가 전부 중복이라**
     * `#store`가 회사를 건드리기 전에 빠져나갔다. 로고는 `domain`이 있는
     * 회사만 받으러 가므로, 영영 한 번도 시도하지 않았다.
     */
    await sql`update job_source set site_url = null where id = ${sourceId}`;
    await sql`update company set domain = null where name = ${`Ingest ${marker}`}`;
    adapter.postings = [posting(marker, 42)];
    await service.run(new Date(), [sourceId]);

    const before = await sql<{ domain: string | null }[]>`
      select domain from company where name = ${`Ingest ${marker}`}
    `;
    expect(before[0]?.domain).toBeNull();

    // 설정만 바꾸고, 새 공고는 하나도 없이 다시 돌린다.
    await sql`update job_source set site_url = 'https://later.example' where id = ${sourceId}`;
    const rerun = await service.run(new Date(), [sourceId]);
    expect(rerun.totals.added).toBe(0);

    const after = await sql<{ domain: string | null }[]>`
      select domain from company where name = ${`Ingest ${marker}`}
    `;
    expect(after[0]?.domain).toBe("later.example");
  });

  it("출처에 사이트를 적어 두면 회사 로고를 받아 담는다", async () => {
    await sql`update job_source set site_url = 'https://example.test' where id = ${sourceId}`;
    await sql`update company set domain = null, logo_read_at = null
              where name = ${`Ingest ${marker}`}`;
    marks.mark = {
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mediaType: "image/png",
      sourceUrl: "https://example.test/icon-512x512.png",
      checksum: "a".repeat(64),
    };
    adapter.postings = [posting(marker, 8)];
    await service.run(new Date(), [sourceId]);

    const [row] = await sql<{
      domain: string | null; logo_media_type: string | null;
      logo_source_url: string | null; logo_read_at: Date | null;
    }[]>`
      select domain, logo_media_type, logo_source_url, logo_read_at
      from company where name = ${`Ingest ${marker}`}
    `;
    expect(row).toMatchObject({
      // 출처 설정의 호스트가 회사에 적힌다. 로고는 여기서 받는다.
      domain: "example.test",
      logo_media_type: "image/png",
      logo_source_url: "https://example.test/icon-512x512.png",
    });
    expect(row?.logo_read_at).not.toBeNull();
    expect(marks.asked).toContain("https://example.test");
  });

  it("못 받아도 다시 두드리지 않는다 — 시도한 사실을 남긴다", async () => {
    await sql`update company set logo_data = null, logo_media_type = null,
              logo_source_url = null, logo_checksum = null, logo_read_at = null
              where name = ${`Ingest ${marker}`}`;
    marks.mark = null;
    marks.asked = [];
    adapter.postings = [];
    await service.run(new Date(), [sourceId]);

    const [row] = await sql<{ logo_data: Buffer | null; logo_read_at: Date | null }[]>`
      select logo_data, logo_read_at from company where name = ${`Ingest ${marker}`}
    `;
    expect(row?.logo_data).toBeNull();
    // 봇 문을 닫아 둔 사이트는 내일도 닫혀 있다. 매번 남의 서버를 두드리지 않는다.
    expect(row?.logo_read_at).not.toBeNull();

    marks.asked = [];
    await service.run(new Date(), [sourceId]);
    expect(marks.asked).toEqual([]);
  });
});
