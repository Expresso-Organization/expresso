import { type ConsentScope } from "@expresso/contracts";
import type { AiContract } from "../../platform/ai/client.js";

/**
 * 동의.
 *
 * 계약을 부르기 전에 여기를 지난다. 통과하지 못하면 **계약을 아예 부르지
 * 않는다** — 물어보지도 않고 보낸 뒤 사과하는 것보다 낫다.
 */

/**
 * 계약마다 어느 동의가 필요한가.
 *
 * **이 표가 규칙의 전부다.** 새 계약을 추가하면 여기 한 줄을 적어야 하고,
 * 적지 않으면 타입이 통과하지 않는다. 어느 계약이 무엇을 내보내는지 한눈에
 * 보이게 하려고 한곳에 모았다.
 *
 * `career_records`에는 지면 · 해설 계약도 들어간다. 기록 본문이 직접 나가지는
 * 않지만 섹션 제목과 문장 통계가 나가고, 그것들은 사용자의 기록에서 왔다.
 * 애매하면 더 좁은 쪽을 고른다.
 *
 * **null은 사용자 데이터가 나가지 않는 계약이다.** 지금은 `job_facts` 하나다 —
 * 우리가 공개 채용 사이트에서 모아 온 공고 본문을 읽고, 사용자도 사용자의 글도
 * 관여하지 않는다(수집은 스케줄로 돌아서 부르는 사람 자체가 없다). 여기에
 * 억지로 범위를 적으면 이 표가 거짓말을 한다 — 아무도 검사하지 않을 동의를
 * 요구하는 것처럼 보이기 때문이다. 대신 **null도 한 줄을 적어야 한다.**
 */
export const CONTRACT_CONSENT: Record<AiContract, ConsentScope | null> = {
  job_analysis: "job_posting_analysis",
  search_interpret: "job_posting_analysis",
  // 우리가 모아 온 공개 공고를 읽는다. 사용자 데이터가 나가지 않는다.
  job_facts: null,
  question_draft: "career_records",
  record_cleanup: "career_records",
  recipe_draft: "career_records",
  generation: "career_records",
  layout_draft: "career_records",
  // 지면 계약 중 유일하게 **기록 본문이 통째로 나간다.** 문장을 이쪽이 직접
  // 쓰기 때문이다. 나가는 양으로 보면 generation과 같은 자리다.
  page_generation: "career_records",
  partial_edit: "career_records",
  style_remix: "career_records",
  insight_note: "career_records",
};



export const SCOPE_LABEL: Record<ConsentScope, string> = {
  job_posting_analysis: "공고 분석",
  career_records: "커리어 기록 사용",
};

export class ConsentError extends Error {
  readonly statusCode = 403;
  readonly scope: ConsentScope;
  constructor(scope: ConsentScope) {
    super(`${SCOPE_LABEL[scope]}에 대한 동의가 필요합니다`);
    this.name = "ConsentError";
    this.scope = scope;
  }
}

export class ConsentPolicyMismatch extends Error {
  readonly statusCode = 409;
  constructor(given: number, expected: number) {
    super(`동의 문구가 바뀌었습니다 (읽은 판 ${given}, 지금 판 ${expected})`);
    this.name = "ConsentPolicyMismatch";
  }
}
