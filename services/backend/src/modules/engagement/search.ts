import type { UnifiedSearchItem, UnifiedSearchQuery, UnifiedSearchResponse } from "@expresso/contracts";

/*
 * 통합 검색이 부르는 세 출처. 각 모듈의 서비스를 그대로 받는다 — 검색 규칙
 * (무엇을 맞추고 어떤 순서로 줄지)은 그 화면을 가진 모듈이 정하고, 여기서는
 * 다른 모듈의 컬렉션을 직접 읽지 않는다.
 */
export interface UnifiedSearchSources {
  /** 커리어 기록 목록의 제목 검색. */
  records: {
    listRecords(userId: string, query: { q: string; sort: "title_asc"; limit: number }): Promise<{ data: { id: string; title: string; status: string }[] }>;
  };
  /** 공고 탐색과 같은 필터 · 정렬. */
  jobs: {
    search(userId: string, input: { q: string; country?: string | undefined; limit: number }): Promise<{ id: string; title: string; company: string }[]>;
  };
  /** 포트폴리오 목록의 제목 검색. */
  portfolios: {
    list(userId: string, query: { q: string; limit: number }): Promise<{ data: { id: string; title: string; status: string }[] }>;
  };
}

/** 00c 통합 검색. 종류마다 `limit`건까지 찾아 기록 · 공고 · 포트폴리오 순으로 잇는다. */
export class UnifiedSearchService {
  constructor(private readonly sources: UnifiedSearchSources) {}

  async search(userId: string, input: UnifiedSearchQuery): Promise<UnifiedSearchResponse> {
    const { q, country, limit } = input;
    const [records, jobs, portfolios] = await Promise.all([
      this.sources.records.listRecords(userId, { q, sort: "title_asc", limit }),
      this.sources.jobs.search(userId, { q, country, limit }),
      this.sources.portfolios.list(userId, { q, limit }),
    ]);
    const data: UnifiedSearchItem[] = [
      ...records.data.map((row) => ({ id: row.id, type: "record" as const, title: row.title, subtitle: row.status })),
      ...jobs.map((row) => ({ id: row.id, type: "job" as const, title: row.title, subtitle: row.company })),
      ...portfolios.data.map((row) => ({ id: row.id, type: "portfolio" as const, title: row.title, subtitle: row.status })),
    ];
    return { data };
  }
}

export type UnifiedSearchApi = Pick<UnifiedSearchService, "search">;
