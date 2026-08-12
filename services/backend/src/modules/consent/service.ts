import {
  CONSENT_POLICY_VERSION,
  ConsentListResponseSchema,
  ConsentScopeSchema,
  type ConsentScope,
} from "@expresso/contracts";
import type postgres from "postgres";

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

const SCOPE_LABEL: Record<ConsentScope, string> = {
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

interface ConsentRow {
  scope: ConsentScope;
  policy_version: number;
  granted_at: Date;
  revoked_at: Date | null;
}

export class ConsentService {
  readonly #sql: postgres.Sql;
  /** 지금 묻고 있는 문구의 판. 문구를 고치면 올린다. */
  readonly #policyVersion: number;

  constructor(sql: postgres.Sql, options: { policyVersion?: number } = {}) {
    this.#sql = sql;
    this.#policyVersion = options.policyVersion ?? CONSENT_POLICY_VERSION;
  }

  /** 10d 온보딩과 09 설정이 읽는다. 범위마다 지금 상태 하나씩. */
  async list(userId: string) {
    const rows = await this.#sql<ConsentRow[]>`
      select distinct on (scope) scope, policy_version, granted_at, revoked_at
      from consent where user_id = ${userId}
      order by scope, granted_at desc
    `;
    const byScope = new Map(rows.map((row) => [row.scope, row]));

    return ConsentListResponseSchema.parse({
      data: {
        policyVersion: this.#policyVersion,
        consents: ConsentScopeSchema.options.map((scope) => {
          const row = byScope.get(scope);
          const live = row !== undefined && row.revoked_at === null;
          return {
            scope,
            granted: live && row.policy_version >= this.#policyVersion,
            policyVersion: row?.policy_version ?? null,
            grantedAt: row ? row.granted_at.toISOString() : null,
            revokedAt: row?.revoked_at ? row.revoked_at.toISOString() : null,
            // 끈 것이 아니라 우리가 문구를 바꾼 경우.
            needsRenewal: live && row.policy_version < this.#policyVersion,
          };
        }),
      },
    });
  }

  async grant(userId: string, scopes: ConsentScope[], policyVersion: number) {
    // 사용자가 읽은 문구가 지금 문구여야 한다. 옛 화면에서 온 승낙은 받지 않는다.
    if (policyVersion !== this.#policyVersion) {
      throw new ConsentPolicyMismatch(policyVersion, this.#policyVersion);
    }
    await this.#sql.begin(async (transaction) => {
      for (const scope of scopes) {
        // 살아 있는 옛 판이 있으면 끄고 새로 적는다 — 어느 판에 승낙했는지가 남는다.
        await transaction`
          update consent set revoked_at = now()
          where user_id = ${userId} and scope = ${scope} and revoked_at is null
            and policy_version <> ${policyVersion}
        `;
        await transaction`
          insert into consent (user_id, scope, policy_version)
          values (${userId}, ${scope}, ${policyVersion})
          on conflict (user_id, scope) where revoked_at is null do nothing
        `;
      }
    });
    return this.list(userId);
  }

  async revoke(userId: string, scope: ConsentScope) {
    await this.#sql`
      update consent set revoked_at = now()
      where user_id = ${userId} and scope = ${scope} and revoked_at is null
    `;
    return this.list(userId);
  }

  /**
   * 이 계약을 부를 수 있는가. 없으면 던진다.
   *
   * 계약을 부르는 쪽이 **부르기 전에** 이걸 지난다. 규칙 기반 폴백은 이 문을
   * 지나지 않는다 — 아무것도 밖으로 나가지 않기 때문이다.
   */
  async require(userId: string, contract: AiContract): Promise<void> {
    const scope = CONTRACT_CONSENT[contract];
    // 사용자 데이터가 나가지 않는 계약은 물어볼 것이 없다.
    if (scope === null) return;
    const rows = await this.#sql<{ id: string }[]>`
      select id from consent
      where user_id = ${userId} and scope = ${scope} and revoked_at is null
        and policy_version >= ${this.#policyVersion}
    `;
    if (!rows[0]) throw new ConsentError(scope);
  }
}

export class ConsentPolicyMismatch extends Error {
  readonly statusCode = 409;
  constructor(given: number, expected: number) {
    super(`동의 문구가 바뀌었습니다 (읽은 판 ${given}, 지금 판 ${expected})`);
    this.name = "ConsentPolicyMismatch";
  }
}
