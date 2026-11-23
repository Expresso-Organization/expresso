import type { ConsultantStage } from "@expresso/contracts";

/**
 * 컨설턴트가 한 사용자에 대해 이어 가는 기억. 사용자당 한 문서이고 `_id`가 사용자 id다.
 *
 * - `stage`는 구직 단계다. 아직 모르면 null. `stageSource`는 마지막으로 정한 쪽이다.
 * - `preferences`는 사용자가 원하거나 피하는 조건이다. 30개까지.
 *
 * 처음 고칠 때 만든다. 문서가 없는 사용자의 기억은 비어 있다.
 */
export interface ConsultantProfileDoc {
  _id: string;
  userId: string;
  stage: ConsultantStage | null;
  stageSource: "agent" | "user" | null;
  stageUpdatedAt: Date | null;
  preferences: { id: string; kind: "prefer" | "avoid"; text: string; source: "chat" | "user"; createdAt: Date }[];
  /**
   * 먼저 연락하기. `enabled`가 참인 사용자에게만 컨설턴트가 먼저 묻는다. 아직 정하지 않은 사용자에게는 칸이 없다.
   * `lastNotifiedOn`은 마지막으로 알림을 만든 서울 날짜(하루 한 건), `lastQuietOn`은 대화가 없어 연락한 마지막 날짜다.
   * `quiet`는 그 연락을 사용자가 아직 보지 않았다는 뜻이다.
   */
  outreach?: { enabled: boolean; decidedAt: Date; lastNotifiedOn: string | null; lastQuietOn: string | null; quiet: boolean };
  /** 컨설턴트가 포트폴리오 제작을 먼저 제안한 마지막 서울 날짜. 제안한 적이 없는 사용자에게는 칸이 없다(0040). */
  portfolioSuggestion?: { lastSuggestedOn: string };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 약속 — 사용자가 하겠다고 한 일과 날짜.
 *
 * - `dueOn`은 서울 날짜(`YYYY-MM-DD`)다.
 * - `nextCheckOn`은 컨설턴트가 다음에 물을 날이다. 두 번 묻고도 답이 없으면 null이 되어 더 묻지 않는다.
 * - `awaiting`은 물었고 답을 기다린다는 뜻이다. 홈의 확인 카드가 이 약속을 보인다.
 * - `checks`는 물은 날의 기록이다.
 */
export interface ConsultantCommitmentDoc {
  _id: string;
  userId: string;
  title: string;
  detail: string;
  dueOn: string;
  status: "open" | "done" | "dropped";
  awaiting: boolean;
  nextCheckOn: string | null;
  checks: { on: string; at: Date }[];
  conversationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 진단 — 구직 목표가 요구하는 것과 내 기록의 대조. 사용자마다 하나이고 `_id`는 사용자 id다.
 *
 * - 표본(`family` · `sampleSize` · `companyCount`)과 항목의 건수는 집계할 때(`demandAt`)의 것이다.
 * - 항목의 상태와 근거는 컨설턴트가 기록과 대조해 채운다(`assessedAt`). 대조하기 전에는 모두 `unconfirmed`다.
 * - 다시 진단이 필요한지는 저장하지 않는다. 읽을 때 지금의 목표와 기록에 견주어 판단한다.
 */
export interface ConsultantDiagnosisDoc {
  _id: string;
  userId: string;
  work: string;
  family: string | null;
  basis: "family" | "keyword";
  focus: string | null;
  level: "entry" | null;
  sampleSize: number;
  companyCount: number;
  interestedCount: number;
  small: boolean;
  summary: string;
  items: { id: string; kind: "technology" | "experience" | "career" | "qualification"; label: string; count: number; status: "confirmed" | "partial" | "unconfirmed" | "gap"; evidence: { recordId: string; quote: string; recordTitle: string }[]; note: string }[];
  demandAt: Date;
  assessedAt: Date | null;
  updatedAt: Date;
}
