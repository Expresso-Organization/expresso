import { createHash } from "node:crypto";

import {
  JobIngestRunSchema,
  JobSourceSchema,
  PostingFactsRunSchema,
  type CreateJobSource,
  type JobSourceProvider,
  type PostingFactsRun,
} from "@expresso/contracts";
import type { SqlTag } from "../../../platform/mysql.js";

import { JobMarketError } from "../errors.js";
import type { JobSourceAdapter, RawPosting } from "./adapter.js";
import type { FactsReader, PostingFacts } from "./facts.js";
import { publicUrl, type CompanyMark, type MarkReader } from "./logo.js";
import {
  classifyFamily,
  isOpening,
  normalizeRegion,
  TARGET_FAMILIES,
  type JobFamily,
} from "./classify.js";

interface SourceRow {
  id: string; provider: JobSourceProvider; token: string; display_name: string;
  site_url: string | null; is_active: boolean; last_run_at: Date | string | null;
  last_status: "succeeded" | "failed" | null; last_error: string | null;
  last_seen_count: number; last_added_count: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 같은 공고인지 가르는 값. 사용자가 붙여넣는 경로와 **같은 계산**이어야 한다. */
function dedupeHash(companyName: string, title: string, descriptionRaw: string): string {
  return sha256([companyName, title, descriptionRaw]
    .map((value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"))
    .join("\n"));
}

/**
 * 요건을 뽑을 수 있는 최소 길이.
 *
 * 어댑터마다 두면 규칙이 출처 수만큼 생긴다. 이건 바깥의 사정이 아니라 **우리
 * 규칙**이다 — 본문이 이보다 짧으면 요건 추출이 할 수 있는 일이 없고, 그런
 * 공고를 목록에 세우면 눌러 본 사람이 빈 분석을 본다. 사용자가 직접 붙여넣는
 * 경로도 같은 200자를 요구한다(`SubmitJobPostingSchema`).
 */
const MINIMUM_BODY_LENGTH = 200;

/** 본문 읽기를 동시에 몇 개까지 겹쳐 돌릴지. */
const FACTS_LANES = 4;

/**
 * 본문 읽기 한 번이 집어가는 공고 수.
 *
 * 실측이 기준이다 — 163건을 4레인으로 돌리면 수십 분이 걸린다(공고당 대략
 * 10초 남짓). 25건이면 한 번에 3~4분이라 **자기 실행 간격(10분) 안에 끝난다.**
 * 겹쳐 돌지 않으면서, 하루치 수집(다섯 곳 기준 백여 건)을 한 시간쯤에 따라잡는
 * 크기다.
 */
const POSTING_FACTS_BATCH = 25;

/** 설정된 사이트 주소에서 호스트만. 공개 https가 아니면 적지 않는다. */
function hostOf(siteUrl: string): string | null {
  return publicUrl(siteUrl)?.hostname ?? null;
}

function sourceDto(row: SourceRow) {
  return JobSourceSchema.parse({
    id: row.id,
    provider: row.provider,
    token: row.token,
    displayName: row.display_name,
    active: row.is_active,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastSeenCount: row.last_seen_count,
    lastAddedCount: row.last_added_count,
    siteUrl: row.site_url,
  });
}

/**
 * 공고 수집.
 *
 * **이미 있는 공고는 건드리지 않는다.** `job_posting`의 원문·식별자·해시는
 * update가 트리거로 막혀 있다(0002) — 요건의 근거 구간이 원문의 문자 위치를
 * 가리키므로, 원문이 바뀌면 이미 뽑아 둔 근거가 딴 곳을 가리킨다. 그래서
 * 수집은 **새 공고를 넣는 일**이고, 공고가 고쳐졌다면 그건 새 공고다.
 *
 * 예외는 `expires_at` 하나다. 마감 시각은 근거가 아니라 사실이고, 이게 갱신돼야
 * `expire_postings` 스케줄이 관심 공고를 닫을 수 있다.
 */
export class JobIngestService {
  readonly #sql: SqlTag;
  readonly #adapters: Map<JobSourceProvider, JobSourceAdapter>;
  readonly #facts: FactsReader | null;
  readonly #marks: MarkReader | null;

  constructor(
    sql: SqlTag,
    adapters: JobSourceAdapter[],
    facts: FactsReader | null = null,
    marks: MarkReader | null = null,
  ) {
    this.#sql = sql;
    this.#adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
    this.#facts = facts;
    this.#marks = marks;
  }

  async listSources() {
    const rows = await this.#sql<SourceRow[]>`
      select * from job_source order by provider, display_name
    `;
    return rows.map(sourceDto);
  }

  async addSource(input: CreateJobSource) {
    if (!this.#adapters.has(input.provider)) {
      // 어댑터가 없는 프로바이더를 켜 두면 수집이 매일 조용히 실패한다.
      throw new JobMarketError(422, `no adapter for ${input.provider}`);
    }
    await this.#sql`
      insert into job_source (provider, token, display_name, site_url)
      values (${input.provider}, ${input.token}, ${input.displayName}, ${input.siteUrl ?? null})
      as new on duplicate key update display_name = new.display_name, is_active = true,
        site_url = coalesce(new.site_url, job_source.site_url)
    `;
    const row = (await this.#sql<SourceRow[]>`
      select * from job_source where provider = ${input.provider} and token = ${input.token}
    `)[0];
    if (!row) throw new Error("job source was not persisted");
    return sourceDto(row);
  }

  /**
   * 켜져 있는 출처를 읽는다. `only`를 주면 그 출처만 읽는다.
   *
   * 한 출처가 죽어도 나머지는 계속 돈다 — 바깥은 우리가 고칠 수 없고, 하나
   * 때문에 전체가 멈추면 그날은 아무것도 안 모인다. 그래서 실패한 곳만 골라
   * 다시 돌릴 수 있어야 한다.
   */
  async run(at = new Date(), only?: string[]) {
    const sources = only && only.length > 0
      ? await this.#sql<SourceRow[]>`
        select * from job_source
        where is_active and id in ${this.#sql(only)}
        order by provider, token
      `
      : await this.#sql<SourceRow[]>`
        select * from job_source where is_active order by provider, token
      `;
    const results: {
      sourceId: string; provider: JobSourceProvider; displayName: string;
      seen: number; added: number; skipped: number; error: string | null;
    }[] = [];

    for (const source of sources) {
      const adapter = this.#adapters.get(source.provider);
      if (!adapter) {
        // 키가 없어 꺼 둔 어댑터가 여기로 온다(고용24). 실패로 적어 둔다.
        await this.#markSource(source.id, at, "failed", "adapter not configured", 0, 0);
        results.push({
          sourceId: source.id, provider: source.provider, displayName: source.display_name,
          seen: 0, added: 0, skipped: 0, error: "adapter not configured",
        });
        continue;
      }
      try {
        const postings = await adapter.fetch(source.token);
        let added = 0;
        for (const posting of postings) {
          if (posting.descriptionRaw.length < MINIMUM_BODY_LENGTH) continue;
          // 지원할 수 있는 자리가 아니면 들이지 않는다(인재풀 · 내부 템플릿).
          if (!isOpening(posting)) continue;
          // 1차 타깃은 소프트웨어 개발이다. 갈래를 못 읽은 공고도 들이지
          // 않는다 — 목록에 세우면 무엇으로 걸러야 할지 말할 수 없다.
          const family = classifyFamily(posting.title, posting.team);
          if (!family || !TARGET_FAMILIES.includes(family)) continue;
          if (await this.#store(source, posting, family)) added += 1;
        }
        // 출처 설정에 사이트가 적혀 있으면 이미 들여 둔 회사에도 따라 붙인다.
        // `#store`는 중복 공고에서 회사를 건드리기 전에 빠져나가므로, 이걸
        // 여기 두지 않으면 **새 공고가 없는 날에는 설정 변경이 영영 닿지 않는다.**
        await this.#syncCompanyDomain(source);
        await this.#markSource(source.id, at, "succeeded", null, postings.length, added);
        results.push({
          sourceId: source.id, provider: source.provider, displayName: source.display_name,
          seen: postings.length, added, skipped: postings.length - added, error: null,
        });
      } catch (error) {
        const reason = (error instanceof Error ? error.message : "unknown").slice(0, 300);
        await this.#markSource(source.id, at, "failed", reason, 0, 0);
        results.push({
          sourceId: source.id, provider: source.provider, displayName: source.display_name,
          seen: 0, added: 0, skipped: 0, error: reason,
        });
      }
    }

    // 로고는 여기 남는다 — 회사 수만큼(다섯)이고 HTTP 한 번이라 수집과 같은
    // 성질이다. 본문 읽기는 공고 수만큼 모델을 부르므로 `posting_facts`로 나갔다.
    const logosRead = await this.#readPendingLogos();

    return JobIngestRunSchema.parse({
      startedAt: at.toISOString(),
      finishedAt: new Date().toISOString(),
      sources: results,
      totals: {
        seen: results.reduce((sum, one) => sum + one.seen, 0),
        added: results.reduce((sum, one) => sum + one.added, 0),
        failedSources: results.filter((one) => one.error !== null).length,
        logosRead,
      },
    });
  }

  /**
   * 출처가 아는 회사 사이트를 회사 행에 적는다.
   *
   * `company.domain`은 출처의 내용이 아니라 **우리 설정**이다(`job_source.site_url`).
   * 그래서 공고가 새로 들어오는 일과 무관하게 따라와야 한다 — 갈래와 지역을
   * 이미 들인 공고에도 다시 적어 주는 것과 같은 이유다.
   *
   * 이미 적혀 있으면 덮지 않는다. 설정을 바꾸는 일보다 수집이 도는 일이 훨씬 잦다.
   */
  async #syncCompanyDomain(source: SourceRow): Promise<void> {
    const host = source.site_url === null ? null : hostOf(source.site_url);
    if (!host) return;
    // `starts_with`를 쓴다 — token에 LIKE 메타문자가 들어와도 그대로 글자로 본다.
    await this.#sql`
      update company set domain = ${host}
      where domain is null
        and id in (
          select company_id from job_posting
          where starts_with(external_id, ${`${source.provider}:${source.token}:`})
        )
    `;
  }

  /**
   * 아직 마크를 받아 보지 않은 회사의 로고를 한 번 받아 온다.
   *
   * 회사 수만큼만 도는 일이라 공고 읽기처럼 겹쳐 돌릴 이유가 없다. 지금
   * 다섯 곳이고, 새 출처가 붙어야 늘어난다.
   *
   * **못 받아도 `logo_read_at`은 찍는다.** 본문 읽기와 반대인데, 이유가
   * 다르다 — 본문은 다음에 다시 부르면 읽힐 수 있지만 봇 문을 닫아 둔
   * 사이트는 내일도 닫혀 있다. 매 수집마다 남의 서버를 다시 두드리는 것은
   * 우리가 할 일이 아니다. 다시 받고 싶으면 그 회사의 `logo_read_at`을
   * 비우면 된다.
   */
  async #readPendingLogos(): Promise<number> {
    if (!this.#marks) return 0;
    const pending = await this.#sql<{ id: string; domain: string }[]>`
      select id, domain from company
      where logo_read_at is null and domain is not null
    `;

    let read = 0;
    for (const row of pending) {
      let mark: CompanyMark | null = null;
      try {
        mark = await this.#marks.read(`https://${row.domain}`);
      } catch {
        // 네트워크가 죽었든 상대가 막았든, 결과는 같다: 로고가 없다.
        mark = null;
      }
      await this.#sql`
        update company set
          logo_data = ${mark ? mark.bytes : null},
          logo_media_type = ${mark ? mark.mediaType : null},
          logo_source_url = ${mark ? mark.sourceUrl : null},
          logo_checksum = ${mark ? mark.checksum : null},
          logo_read_at = now(6)
        where id = ${row.id}
      `;
      if (mark) read += 1;
    }
    return read;
  }

  /**
   * 아직 본문을 읽지 않은 공고를 모델에게 읽힌다.
   *
   * 방금 들인 공고도, 예전에 들어와 있던 공고도 여기서 따라잡는다. 일회성
   * 스크립트를 두지 않는 이유는 그런 스크립트가 **한 번 돌고 잊히기**
   * 때문이다 — 새 어댑터가 생겨도 다음 수집이 메운다.
   *
   * **실패하면 `facts_read_at`을 찍지 않는다.** 그래야 다음 실행이 다시
   * 집어가고, 그때까지 화면은 "아직 뽑지 않았습니다"라고 정직하게 말한다.
   * 읽기 담당이 아예 없으면(AI 꺼짐) 한 건도 건드리지 않는다 — 규칙 기반
   * 폴백을 두면 정확도가 조용히 갈리고, 화면은 그 둘을 구분해 말할 수 없다.
   *
   * 이미 값이 있으면 덮지 않는다. 출처가 직접 알려 준 값이 우리가 본문에서
   * 읽어 낸 것보다 낫다.
   */
  async readPendingFacts(
    limit = POSTING_FACTS_BATCH,
    at = new Date(),
  ): Promise<PostingFactsRun> {
    const finish = (
      extra: { read: number; failed: number; skipped: PostingFactsRun["skipped"] },
    ) => this.#factsRunResult(at, extra);

    if (!this.#facts) {
      // 조용히 0건을 읽었다고 하지 않는다. 담당이 없다는 것과 읽을 게
      // 없다는 것은 다른 상태다.
      return finish({ read: 0, failed: 0, skipped: "reader is not configured" });
    }
    const reader = this.#facts;
    const pending = await this.#sql<{ id: string; description_raw: string }[]>`
      select id, description_raw from job_posting
      where facts_read_at is null
      order by created_at
      limit ${limit}
    `;

    let read = 0;
    let failed = 0;
    // 공고 하나에 모델 호출 한 번이다. 줄 세워 돌리면 163건에 몇十 분이
    // 걸리므로 조금씩 겹쳐 돌린다. 크게 벌리지 않는 것은 레이트 리밋 때문이다.
    const lanes = Array.from({ length: FACTS_LANES }, async () => {
      for (;;) {
        const row = pending.pop();
        if (!row) return;
        let facts: PostingFacts;
        try {
          facts = await reader.read(row.description_raw);
        } catch {
          // 모델이 죽었거나 스키마를 못 맞췄다. 이 공고는 다음 실행에서 다시 본다.
          failed += 1;
          continue;
        }
        await this.#sql`
          update job_posting set
            salary_note = coalesce(salary_note, ${facts.salaryNote}),
            experience_note = coalesce(experience_note, ${facts.experienceNote}),
            work_type = coalesce(work_type, ${facts.workType}),
            facts_read_at = now(6)
          where id = ${row.id}
        `;
        read += 1;
      }
    });
    await Promise.all(lanes);
    return finish({ read, failed, skipped: null });
  }

  /** 남은 일감까지 세어 결과를 만든다 — 밀린 정도가 보여야 다음을 정할 수 있다. */
  async #factsRunResult(
    at: Date,
    extra: { read: number; failed: number; skipped: PostingFactsRun["skipped"] },
  ): Promise<PostingFactsRun> {
    const [remaining] = await this.#sql<{ count: string }[]>`
      select count(*) as count from job_posting where facts_read_at is null
    `;
    return PostingFactsRunSchema.parse({
      startedAt: at.toISOString(),
      finishedAt: new Date().toISOString(),
      read: extra.read,
      failed: extra.failed,
      pending: Number(remaining?.count ?? 0),
      skipped: extra.skipped,
    });
  }

  /** 넣었으면 true. 이미 있으면 false. */
  async #store(source: SourceRow, posting: RawPosting, family: JobFamily): Promise<boolean> {
    const externalId = `${source.provider}:${source.token}:${posting.externalId}`;
    const hash = dedupeHash(posting.companyName, posting.title, posting.descriptionRaw);

    return this.#sql.begin(async (transaction) => {
      const existing = (await transaction<{ id: string }[]>`
        select id from job_posting
        where (source = 'api' and external_id = ${externalId})
           or dedupe_hash = ${hash}
        limit 1
      `)[0];
      if (existing) {
        // 원문은 못 고치고, 고쳐서도 안 된다. 하지만 **분류는 우리 것**이다 —
        // 갈래와 지역은 출처가 적어 준 값이 아니라 우리 규칙이 읽은 값이라,
        // 규칙이 나아지면 이미 들인 공고도 따라와야 한다. 마감도 근거가 아니라
        // 사실이라 같이 따라간다.
        await transaction`
          update job_posting set
            job_family = ${family},
            location_region = ${normalizeRegion(posting.location)}
            ${posting.expiresAt ? transaction`, expires_at = ${posting.expiresAt}` : transaction``}
          where id = ${existing.id}
        `;
        return false;
      }

      const companyKey = sha256(
        `${posting.companyName.normalize("NFKC").toLocaleLowerCase("en-US")}:`,
      );
      // 출처 설정이 이 회사의 자기 사이트를 알고 있으면 회사에 적어 둔다.
      // 로고를 여기서 받는다. 이미 적혀 있으면 덮지 않는다 — 설정을 바꾸는
      // 일보다 공고가 들어오는 일이 훨씬 잦다.
      const site = source.site_url === null ? null : hostOf(source.site_url);
      await transaction`
        insert into company (name, dedupe_key, domain)
        values (${posting.companyName}, ${companyKey}, ${site})
        as new on duplicate key update name = company.name, domain = coalesce(company.domain, new.domain)
      `;
      const company = (await transaction<{ id: string }[]>`
        select id from company where dedupe_key = ${companyKey}
      `)[0];
      if (!company) throw new Error("company was not persisted");

      // 본문 읽기는 여기서 하지 않는다. 모델 호출은 몇 초가 걸리고, 그 사이
      // 트랜잭션이 커넥션을 잡고 있게 된다. 들인 다음 #readFacts()가 집어간다.
      await transaction`
        insert into job_posting (
          company_id, source, external_id, title, description_raw, requirements,
          dedupe_hash, source_url, source_board, location, location_region,
          employment_type, experience_label, team, job_family, expires_at
        ) values (
          ${company.id}, 'api', ${externalId}, ${posting.title}, ${posting.descriptionRaw},
          '{}', ${hash}, ${posting.sourceUrl}, ${source.display_name},
          ${posting.location}, ${normalizeRegion(posting.location)},
          ${posting.employmentType}, ${posting.experienceLabel},
          ${posting.team}, ${family}, ${posting.expiresAt}
        )
      `;
      return true;
    });
  }

  async #markSource(
    id: string,
    at: Date,
    status: "succeeded" | "failed",
    error: string | null,
    seen: number,
    added: number,
  ) {
    await this.#sql`
      update job_source set
        last_run_at = ${at}, last_status = ${status}, last_error = ${error},
        last_seen_count = ${seen}, last_added_count = ${added}
      where id = ${id}
    `;
  }
}
