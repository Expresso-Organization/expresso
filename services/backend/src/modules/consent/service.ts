import { CONTRACT_CONSENT, ConsentError, ConsentPolicyMismatch } from "./public.js";
export { CONTRACT_CONSENT, ConsentError, ConsentPolicyMismatch } from "./public.js";
import {
  CONSENT_POLICY_VERSION,
  ConsentListResponseSchema,
  ConsentScopeSchema,
  type ConsentScope,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import type { AiContract } from "../../platform/ai/client.js";

interface ConsentRow {
  scope: ConsentScope;
  policy_version: number;
  granted_at: Date;
  revoked_at: Date | null;
}

export class ConsentService {
  readonly #sql: SqlTag;
  /** 지금 묻고 있는 문구의 판. 문구를 고치면 올린다. */
  readonly #policyVersion: number;

  constructor(sql: SqlTag, options: { policyVersion?: number } = {}) {
    this.#sql = sql;
    this.#policyVersion = options.policyVersion ?? CONSENT_POLICY_VERSION;
  }

  /** 10d 온보딩과 09 설정이 읽는다. 범위마다 지금 상태 하나씩. */
  async list(userId: string) {
    const rows = await this.#sql<ConsentRow[]>`
      select scope, policy_version, granted_at, revoked_at
      from (
        select scope, policy_version, granted_at, revoked_at,
               row_number() over (partition by scope order by granted_at desc) as rn
        from consent where user_id = ${userId}
      ) latest
      where rn = 1
      order by scope
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
          update consent set revoked_at = now(6)
          where user_id = ${userId} and scope = ${scope} and revoked_at is null
            and policy_version <> ${policyVersion}
        `;
        await transaction`
          insert ignore into consent (user_id, scope, policy_version)
          values (${userId}, ${scope}, ${policyVersion})
          `;
      }
    });
    return this.list(userId);
  }

  async revoke(userId: string, scope: ConsentScope) {
    await this.#sql`
      update consent set revoked_at = now(6)
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
