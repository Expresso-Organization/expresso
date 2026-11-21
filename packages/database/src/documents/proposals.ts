import type { Binary } from "mongodb";
import type { ActivityKind, ActivitySource, Proposal, ProposalRun } from "@expresso/contracts";

/**
 * 저장하는 제안. 남은 날과 대화 요청문은 저장하지 않는다 — 날이 지나면 달라지는 값이라 읽을 때 만든다.
 *
 * - `deadlineOn`은 대상의 마감일(서울 날짜)이다. 마감이 없으면 null. 지나면 그 제안은 보이지 않는다.
 * - `origin`은 요청문을 다시 만들 때 쓰는 것 — 대상의 제목 · 주최와 근거로 든 기록이다.
 */
export type StoredProposal = Omit<Proposal, "createdAt" | "start"> & {
  createdAt: Date;
  deadlineOn: string | null;
  origin: { title: string; host: string | null; recordIds: string[] };
};

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

/**
 * 수집한 활동 한 건. `_id`는 `<출처>:<출처 안의 번호>`다. 사용자 것이 아니라 모두가 함께 본다.
 *
 * 0035 이전에 저장한 문서에는 `applyStartOn` 이하 칸이 없다 — 읽는 쪽은 없으면 null로 본다.
 */
export interface ActivityDoc {
  _id: string;
  source: ActivitySource;
  kind: ActivityKind;
  title: string;
  host: string;
  fields: string[];
  url: string;
  /** 접수 마감일(서울 날짜, `YYYY-MM-DD`). */
  deadlineOn: string;
  /** 출처가 적은 접수 상태. 화면은 날짜로 다시 계산한다. */
  status: string;
  firstSeenAt: Date;
  /** 이 활동을 마지막으로 본 수집 시각. 출처의 마지막 성공 실행보다 이르면 출처에서 내려간 것이다. */
  lastSeenAt: Date;
  applyStartOn?: string | null;
  /** `month`면 출처가 마감을 달로만 적었다(`deadlineOn`은 그달 말일). */
  deadlinePrecision?: "day" | "month";
  startsOn?: string | null;
  eligibility?: string | null;
  prize?: string | null;
  homepageUrl?: string | null;
  tuition?: number | null;
  nbcardRequired?: boolean | null;
  /** 다른 출처(또는 같은 출처의 다른 글)에 있는 같은 활동의 대표 `_id`. 대표면 null. */
  duplicateOf?: string | null;
  /** 보관한 포스터의 크기와 체크섬(`activity_posters`). 받은 적이 없으면 없다. */
  poster?: { width: number; height: number; checksum: string } | null;
}

/** 활동 포스터 한 장. `_id`는 활동 `_id`다. 출처 그림을 폭 480px webp로 줄여 둔다. */
export interface ActivityPosterDoc {
  _id: string;
  /** 받아 온 출처 그림 주소. 같은 주소면 다시 받지 않는다. */
  sourceUrl: string;
  data: Binary;
  mediaType: string;
  width: number;
  height: number;
  /** 줄인 그림의 sha256(hex). 내보내는 주소의 `v`다. */
  checksum: string;
  readAt: Date;
}

/** 활동 출처 하나의 수집 상태. `_id`는 출처 이름이다. */
export interface ActivitySourceDoc {
  _id: ActivitySource;
  lastRunAt: Date;
  /** 마지막으로 성공한 수집 시각. 아직 성공한 적이 없으면 null. */
  lastSucceededAt: Date | null;
  /** 마지막 실행의 실패 사유. 성공했으면 null. */
  lastError: string | null;
  /** 마지막 실행에서 읽은 활동 수. */
  lastRead: number;
}
