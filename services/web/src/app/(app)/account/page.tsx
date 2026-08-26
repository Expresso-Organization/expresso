import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ACCOUNT } from "@/lib/sample/site";
import { consents } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { grantConsentAction, revokeConsentAction } from "../../consent-actions";

import styles from "./page.module.css";

const TAB_ICONS = ["user", "receipt", "credit-card", "bell", "database"];

/** 무엇이 나가는지를 먼저 쓴다. 켜고 끄는 스위치보다 그 문장이 중요하다. */
const CONSENT_COPY = {
  job_posting_analysis: {
    title: "공고 분석",
    what: "붙여 넣은 채용 공고의 원문이 AI 모델로 갑니다.",
  },
  career_records: {
    title: "커리어 기록 사용",
    what: "내가 쓴 기록과 대화 답변이 AI 모델로 갑니다. 끄면 제작이 돌지 않습니다.",
  },
} as const;

export default async function AccountPage() {
  const session = await requireSession();
  const consent = (await consents.list(session.accessToken)).data;

  return (
    <>
      <DocumentHeader crumbs={["설정", "요금제"]} />
      <AppBody>
        <div className={styles.body}>
          <nav className={styles.nav} aria-label="설정">
            {ACCOUNT.tabs.map((tab, index) => (
              <button
                key={tab}
                type="button"
                className={`${styles.navItem} ${index === 1 ? styles.navItemActive : ""}`}
              >
                <Icon
                  name={TAB_ICONS[index] ?? "gear-six"}
                  size={14}
                  color={index === 1 ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
                />
                {tab}
              </button>
            ))}
          </nav>

          <div className={styles.main}>
            <h1 className={styles.title}>요금제 · 사용량</h1>
            <p className={styles.intro}>{ACCOUNT.intro}</p>

            <div className={styles.section}>
              <div className={styles.usageGrid}>
                {ACCOUNT.usage.map((usage) => (
                  <div key={usage.label} className={styles.usageCard}>
                    <div className={styles.usageHead}>
                      <span className={styles.usageLabel}>{usage.label}</span>
                      <span className={styles.usageValue}>
                        {usage.used} / {usage.limit}
                      </span>
                    </div>
                    <div
                      className={styles.usageSlots}
                      role="meter"
                      aria-valuenow={usage.used}
                      aria-valuemin={0}
                      aria-valuemax={usage.limit}
                      aria-label={`${usage.label} ${usage.limit}회 중 ${usage.used}회 사용`}
                    >
                      {Array.from({ length: usage.limit }, (_, index) => (
                        <span
                          key={index}
                          className={`${styles.usageSlot} ${
                            index < usage.used ? styles.usageSlotUsed : ""
                          }`}
                        />
                      ))}
                    </div>
                    <div className={styles.usageResets}>{usage.resets}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>PLANS</div>
              <div className={styles.plans}>
                {ACCOUNT.plans.map((plan) => (
                  <div
                    key={plan.name}
                    className={`${styles.plan} ${plan.current ? styles.planCurrent : ""}`}
                  >
                    <div className={styles.planHead}>
                      <span className={styles.planName}>{plan.name}</span>
                      {plan.current ? (
                        <span className={styles.planBadge}>사용 중</span>
                      ) : null}
                    </div>
                    <div className={styles.planPrice}>{plan.price}</div>
                    {plan.features.map((feature) => (
                      <div key={feature} className={styles.planFeature}>
                        <Icon name="check" size={12} color="var(--ex-fg-subtle)" />
                        {feature}
                      </div>
                    ))}
                    <div className={styles.planCta}>
                      <button
                        type="button"
                        className={`${styles.planButton} ${
                          plan.current ? styles.planButtonCurrent : ""
                        }`}
                      >
                        {plan.cta}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>BILLING</div>
              {ACCOUNT.billing.map((entry) => (
                <div key={entry.date} className={styles.billingRow}>
                  <span className={styles.billingDate}>{entry.date}</span>
                  <span className={styles.billingItem}>{entry.item}</span>
                  <span className={styles.billingAmount}>{entry.amount}</span>
                  <span className={styles.billingState}>{entry.state}</span>
                  <button type="button" className={styles.billingReceipt}>
                    영수증
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>DATA</div>
              {ACCOUNT.data.map((item) => (
                <div key={item.title} className={styles.dataRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className={`${styles.dataTitle} ${
                        "danger" in item && item.danger ? styles.dataTitleDanger : ""
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className={styles.dataNote}>{item.note}</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.dataAction} ${
                      "danger" in item && item.danger ? styles.dataActionDanger : ""
                    }`}
                  >
                    {"danger" in item && item.danger ? "삭제 요청" : "내보내기"}
                  </button>
                </div>
              ))}
            </div>

            {/* 무엇이 나가는지 · 언제든 끌 수 있다 */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>AI 사용 동의</div>
              <div className={styles.consentRows}>
                {consent.consents.map((item) => {
                  const copy = CONSENT_COPY[item.scope];
                  return (
                    <div key={item.scope} className={styles.consentRow}>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.consentName}>{copy.title}</div>
                        <div className={styles.consentWhat}>{copy.what}</div>
                        {item.needsRenewal ? (
                          <div className={styles.consentRenew}>
                            문구가 바뀌어 다시 여쭙니다 — 다시 켜 주셔야 합니다
                          </div>
                        ) : null}
                      </div>
                      <form action={item.granted ? revokeConsentAction : grantConsentAction}>
                        <input type="hidden" name="scope" value={item.scope} />
                        <input type="hidden" name={item.scope} value="on" />
                        <input type="hidden" name="policyVersion" value={consent.policyVersion} />
                        <button
                          type="submit"
                          className={item.granted ? styles.consentOff : styles.consentOn}
                        >
                          {item.granted ? "끄기" : "켜기"}
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
              <div className={styles.consentNote}>
                끄면 그때부터 아무것도 보내지 않습니다. 이미 만들어진 포트폴리오는
                그대로 남습니다.
              </div>
            </div>

            {/* 한도는 숨기지 않는다 */}
            <div className={styles.footNote}>
              <Icon name="info" size={13} color="var(--ex-accent-text)" />
              {ACCOUNT.footNote}
            </div>
          </div>
        </div>
      </AppBody>
    </>
  );
}
