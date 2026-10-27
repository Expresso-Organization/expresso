import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { HashScroll } from "@/components/shell/HashScroll";
import { AgentKeySettings } from "@/features/agent-chat/AgentKeySettings";
import { ThemePicker } from "@/components/ThemePicker";
import { Icon } from "@/components/ui/Icon";
import type { EntitlementCapability, NotificationKind, PlanSummary } from "@expresso/contracts";
import { consents, notificationSettings, usage as usageApi } from "@/lib/api/endpoints";
import { CONSENT_COPY } from "@/lib/consent-copy";
import { requireSession } from "@/lib/require-session";
import { CAPABILITY_LABEL } from "@/lib/usage-copy";

import { setNotificationPreferenceAction } from "../../account-actions";
import { grantConsentAction, revokeConsentAction } from "../../consent-actions";

import { AccountNav } from "./AccountNav";
import { DataSection } from "./DataSection";
import { ResendVerificationForm } from "./ResendVerificationForm";
import { UsageCharts } from "./UsageCharts";
import styles from "./page.module.css";

/** 지금 만들어지는 알림만 켜고 끈다. 나머지 종류는 보내는 코드가 없다. */
const NOTIFICATION_COPY: Partial<Record<NotificationKind, { title: string; what: string }>> = {
  deadline: { title: "관심 공고 마감", what: "담아 둔 공고의 마감이 3일 안으로 다가오면 한 번 알립니다" },
  generation: { title: "포트폴리오 생성 완료", what: "생성이 끝나면 알리고, 누르면 편집 화면으로 갑니다" },
};

/** ISO 시각에서 날짜만. 결제 내역 줄과 같은 `2026.07.12` 형식이다. */
function formatDay(timestamp: string): string {
  return timestamp.slice(0, 10).replace(/-/g, ".");
}

/** 다음 초기화 날짜. 「3월 12일」처럼 적는다. 기간이 한국 시각이라 날짜도 한국 시각으로 읽는다. */
function formatReset(at: string): string {
  return new Date(at).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
}

function formatPrice(plan: PlanSummary): string {
  return plan.monthlyPriceKrw === 0 ? "무료" : `₩${plan.monthlyPriceKrw.toLocaleString("ko-KR")} / 월`;
}

/**
 * 결제 내역 줄.
 *
 * 결제는 아직 붙어 있지 않다. 지금 플랜의 월 구독을 이번 달과 지난달 두 줄로
 * 세운다. 무료 플랜은 낸 돈이 없으므로 줄이 없다.
 */
function billingRows(plan: PlanSummary | undefined, periodStart: string) {
  if (!plan || plan.monthlyPriceKrw === 0) return [];
  const [year, month] = periodStart.split("-").map(Number) as [number, number];
  return [0, 1].map((back) => {
    const at = new Date(Date.UTC(year, month - 1 - back, 1));
    return {
      date: `${at.getUTCFullYear()}.${String(at.getUTCMonth() + 1).padStart(2, "0")}.01`,
      item: `${plan.displayName} 월 구독`,
      amount: `₩${plan.monthlyPriceKrw.toLocaleString("ko-KR")}`,
    };
  });
}

export default async function AccountPage() {
  const session = await requireSession();
  const [consent, usage, plans, preferences] = await Promise.all([
    consents.list(session.accessToken).then(({ data }) => data),
    usageApi.monthly(session.accessToken).then(({ data }) => data),
    usageApi.plans(session.accessToken).then(({ data }) => data),
    notificationSettings.list(session.accessToken).then(({ data }) => data),
  ]);
  const currentPlan = plans.find((plan) => plan.code === usage.planCode);
  // 모든 플랜이 여는 기능은 카드를 가르지 않는다. 다른 것만 적는다.
  const shared = new Set<EntitlementCapability>(
    (Object.keys(CAPABILITY_LABEL) as EntitlementCapability[]).filter((capability) =>
      plans.every((plan) => plan.capabilities.includes(capability)),
    ),
  );
  const billing = billingRows(currentPlan, usage.periodStart);
  const notifications = preferences.filter((item) => NOTIFICATION_COPY[item.kind]);
  const verifiedAt = session.user.emailVerifiedAt;

  return (
    <>
      <DocumentHeader crumbs={["설정"]} />
      <AppBody>
        <div className={styles.body}>
          <AccountNav />

          <div className={styles.main}>
            <h1 className={styles.title}>설정</h1>

            {/* 계정에 붙어 있는 사실. 확인된 주소는 날짜만 남고, 아직이면 보낼 것이 선다. */}
            <section id="profile" className={styles.section}>
              <HashScroll id="profile" />
              <div className={styles.sectionLabel}>프로필</div>
              <div className={styles.dataRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.dataTitle}>{session.user.displayName}</div>
                  <div className={styles.dataNote}>표시 이름</div>
                </div>
              </div>
              <div className={`${styles.dataRow} ${styles.verifyRow}`}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.dataTitle}>{session.user.email}</div>
                  {verifiedAt ? (
                    <div className={styles.dataNote}>{formatDay(verifiedAt)} 확인됨</div>
                  ) : (
                    <div className={styles.consentRenew}>
                      인증 전에는 포트폴리오를 공개 주소에 올릴 수 없습니다
                    </div>
                  )}
                </div>
                {verifiedAt ? null : <ResendVerificationForm />}
              </div>
            </section>

            <section id="usage" className={styles.section}>
              <HashScroll id="usage" />
              <div className={styles.sectionLabel}>사용량</div>
              <div className={styles.creditCard}>
                <div className={styles.creditHead}>
                  <span className={styles.usageLabel}>이번 달 크레딧</span>
                  <span className={styles.usageResets}>{formatReset(usage.resetsAt)} 초기화</span>
                </div>
                <div className={styles.creditFigure}>
                  <span className={styles.creditUsed}>{usage.creditsUsed.toLocaleString("ko-KR")}</span>
                  <span className={styles.creditLimit}>
                    / {usage.creditLimit === null ? "무제한" : usage.creditLimit.toLocaleString("ko-KR")}
                  </span>
                </div>
                {usage.creditLimit === null ? null : (
                  <div
                    className={styles.creditTrack}
                    role="meter"
                    aria-valuenow={usage.creditsUsed}
                    aria-valuemin={0}
                    aria-valuemax={usage.creditLimit}
                    aria-label={`이번 달 크레딧 ${usage.creditLimit} 중 ${usage.creditsUsed} 사용`}
                  >
                    <div
                      className={styles.creditFill}
                      style={{ width: `${Math.min(1, usage.creditsUsed / Math.max(usage.creditLimit, 1)) * 100}%` }}
                    />
                  </div>
                )}
              </div>
              {usage.calls === 0 ? (
                <div className={styles.usageEmpty}>이번 달 사용 없음</div>
              ) : (
                <UsageCharts usage={usage} />
              )}
            </section>

            {/* 지금 쓰는 플랜만 테두리가 선다. 바꾸는 버튼은 없다 — 결제가 붙어 있지 않다. */}
            <section id="plans" className={styles.section}>
              <HashScroll id="plans" />
              <div className={styles.sectionLabel}>요금제</div>
              <div className={styles.plans}>
                {plans.map((plan) => (
                  <div
                    key={plan.code}
                    className={`${styles.plan} ${plan.code === usage.planCode ? styles.planCurrent : ""}`}
                  >
                    <div className={styles.planHead}>
                      <span className={styles.planName}>{plan.displayName}</span>
                      {plan.code === usage.planCode ? <span className={styles.planBadge}>사용 중</span> : null}
                    </div>
                    <div className={styles.planPrice}>{formatPrice(plan)}</div>
                    <div className={styles.planFeature}>
                      <Icon name="coffee" size={12} color="var(--ex-fg-subtle)" />
                      월 {plan.monthlyCredits.toLocaleString("ko-KR")} 크레딧
                    </div>
                    {plan.capabilities
                      .filter((capability) => CAPABILITY_LABEL[capability] && !shared.has(capability))
                      .map((capability) => (
                        <div key={capability} className={styles.planFeature}>
                          <Icon name="check" size={12} color="var(--ex-fg-subtle)" />
                          {CAPABILITY_LABEL[capability]}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </section>

            <section id="billing" className={styles.section}>
              <HashScroll id="billing" />
              <div className={styles.sectionLabel}>결제</div>
              {billing.length === 0 ? (
                <div className={styles.usageEmpty}>결제 내역 없음</div>
              ) : (
                billing.map((entry) => (
                  <div key={entry.date} className={styles.billingRow}>
                    <span className={styles.billingDate}>{entry.date}</span>
                    <span className={styles.billingItem}>{entry.item}</span>
                    <span className={styles.billingAmount}>{entry.amount}</span>
                    <span className={styles.billingState}>결제 완료</span>
                  </div>
                ))
              )}
            </section>

            <section id="notifications" className={styles.section}>
              <HashScroll id="notifications" />
              <div className={styles.sectionLabel}>알림</div>
              <div className={styles.consentRows}>
                {notifications.map((item) => {
                  const copy = NOTIFICATION_COPY[item.kind]!;
                  return (
                    <div key={item.kind} className={styles.consentRow}>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.consentName}>{copy.title}</div>
                        <div className={styles.consentWhat}>{copy.what}</div>
                      </div>
                      <form action={setNotificationPreferenceAction}>
                        <input type="hidden" name="kind" value={item.kind} />
                        <input type="hidden" name="enabled" value={item.enabled ? "false" : "true"} />
                        <button
                          type="submit"
                          className={item.enabled ? styles.consentOff : styles.consentOn}
                          aria-label={`${copy.title} 알림 ${item.enabled ? "끄기" : "켜기"}`}
                        >
                          {item.enabled ? "끄기" : "켜기"}
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
              <div className={styles.consentNote}>알림은 오른쪽 위 종 모양 버튼에서 봅니다.</div>
            </section>

            {/* 지면을 밝게 볼지 어둡게 볼지 — 이 기기에만 남는다 */}
            <section id="surface" className={styles.section}>
              <HashScroll id="surface" />
              <div className={styles.sectionLabel}>지면</div>
              <div className={styles.themeRow}>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.themeName}>지면 밝기</div>
                  <div className={styles.themeNote}>
                    시스템을 고르면 기기 설정을 따라갑니다. 이 선택은 계정이 아니라
                    지금 쓰는 브라우저에 남습니다.
                  </div>
                </div>
                <ThemePicker />
              </div>
            </section>

            <section id="data" className={styles.section}>
              <HashScroll id="data" />
              <div className={styles.sectionLabel}>데이터 관리</div>
              <DataSection />
            </section>

            <section id="ai-chat-settings" className={styles.section}><HashScroll id="ai-chat-settings" /><div className={styles.sectionLabel}>AI 채팅</div><AgentKeySettings /></section>

            {/* 무엇이 나가는지 · 언제든 끌 수 있다. 제작 화면의 동의 실패 안내가 이 id로 온다. */}
            <div id="ai-consent" className={styles.section}>
              <HashScroll id="ai-consent" />
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

          </div>
        </div>
      </AppBody>
    </>
  );
}
