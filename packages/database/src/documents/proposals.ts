import type { ActivityKind, Proposal, ProposalRun } from "@expresso/contracts";

/** 저장하는 제안. 계약의 `Proposal`에서 시각만 Date다. */
export type StoredProposal = Omit<Proposal, "createdAt"> & { createdAt: Date };

/** 저장하는 실행 상태. 계약의 `ProposalRun`에서 시각만 Date다. */
export type StoredProposalRun = Omit<ProposalRun, "startedAt" | "finishedAt"> & { startedAt: Date | null; finishedAt: Date | null };

/**
 * 사용자 한 명의 능동 제안. 사용자당 한 문서다.
 *
 * - `enabled`가 참인 사용자만 자동 실행의 대상이다.
 * - `dismissed`는 다시 제안하지 않는 대상(`job:<id>` · `activity:<id>` · `record:<id>`)이다.
 * - `autoRuns`는 종류별 마지막 자동 실행 날짜(서울 날짜)다. 같은 날 두 번 돌지 않게 한다.
 * - `seenThrough`는 마지막 실행이 읽은 곳까지의 시각이다. 다음 실행은 그 뒤에 수집된 것을 새 소식으로 본다.
 */
export interface ProposalFeedDoc {
  _id: string;
  userId: string;
  enabled: boolean;
  proposals: StoredProposal[];
  dismissed: string[];
  run: StoredProposalRun;
  autoRuns: { daily: string | null; news: string | null };
  seenThrough: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 수집한 활동 한 건. `_id`는 `<출처>:<출처 안의 번호>`다. 사용자 것이 아니라 모두가 함께 본다. */
export interface ActivityDoc {
  _id: string;
  source: "wevity";
  kind: ActivityKind;
  title: string;
  host: string;
  fields: string[];
  url: string;
  /** 접수 마감일(서울 날짜, `YYYY-MM-DD`). 출처가 남은 날로 적어 주므로 수집한 날에 더해 구한다. */
  deadlineOn: string;
  status: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}
