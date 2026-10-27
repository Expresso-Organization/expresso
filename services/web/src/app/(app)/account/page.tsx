import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { HashScroll } from "@/components/shell/HashScroll";
import { AgentKeySettings } from "@/features/agent-chat/AgentKeySettings";
import { ThemePicker } from "@/components/ThemePicker";
import { Icon } from "@/components/ui/Icon";
import type { NotificationKind } from "@expresso/contracts";
import { consents, entitlements, notificationSettings } from "@/lib/api/endpoints";
import { CONSENT_COPY } from "@/lib/consent-copy";
import { requireSession } from "@/lib/require-session";

import { setNotificationPreferenceAction } from "../../account-actions";
import { grantConsentAction, revokeConsentAction } from "../../consent-actions";

import { AccountNav } from "./AccountNav";
import { DataSection } from "./DataSection";
import styles from "./page.module.css";

/** 지금 만들어지는 알림만 켜고 끈다. 나머지 종류는 보내는 코드가 없다. */
const NOTIFICATION_COPY: Partial<Record<NotificationKind, { title: string; what: string }>> = {
  deadline: { title: "관심 공고 마감", what: "담아 둔 공고의 마감이 3일 안으로 다가오면 한 번 알립니다" },
  generation: { title: "포트폴리오 생성 완료", what: "생성이 끝나면 알리고, 누르면 편집 화면으로 갑니다" },
};

/** 다음 초기화 날짜. 「3월 12일」처럼 적는다. */
function formatReset(at: string): string {
  return new Date(at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export default async function AccountPage() {
  const session = await requireSession();
  const [consent, generate, preferences] = await Promise.all([
    consents.list(session.accessToken).then(({ data }) => data),
    entitlements.check(session.accessToken, "portfolio.generate").then(({ data }) => data),
    notificationSettings.list(session.accessToken).then(({ data }) => data),
  ]);
  const usage = generate.usage ?? null;
  const notifications = preferences.filter((item) => NOTIFICATION_COPY[item.kind]);

  return (
    <>
      <DocumentHeader crumbs={["설정"]} />
      <AppBody>
        <div className={styles.body}>
          <AccountNav />

          <div className={styles.main}>
            <h1 className={styles.title}>설정</h1>

            <section id="usage" className={styles.section}>
              <HashScroll id="usage" />
              <div className={styles.sectionLabel}>사용량</div>
              <div className={styles.usageGrid}>
                <div className={styles.usageCard}>
                  <div className={styles.usageHead}>
                    <span className={styles.usageLabel}>포트폴리오 생성</span>
                    <span className={styles.usageValue}>
                      {usage ? `${usage.used} / ${usage.limit ?? "무제한"}` : "기록 없음"}
                    </span>
                  </div>
                  {usage && usage.limit !== null ? (
                    <div
                      className={styles.usageSlots}
                      role="meter"
                      aria-valuenow={usage.used}
                      aria-valuemin={0}
                      aria-valuemax={usage.limit}
                      aria-label={`포트폴리오 생성 ${usage.limit}회 중 ${usage.used}회 사용`}
                    >
                      {Array.from({ length: usage.limit }, (_, index) => (
                        <span
                          key={index}
                          className={`${styles.usageSlot} ${index < usage.used ? styles.usageSlotUsed : ""}`}
                        />
                      ))}
                    </div>
                  ) : null}
                  {usage ? <div className={styles.usageResets}>{formatReset(usage.resetsAt)} 초기화</div> : null}
                </div>
              </div>
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

            {/* 한도는 숨기지 않는다 */}
            {usage && usage.remaining !== null ? (
              <div className={styles.footNote}>
                <Icon name="info" size={13} color="var(--ex-accent-text)" />
                이번 달 생성 {usage.remaining}회가 남았습니다. {formatReset(usage.resetsAt)}에 초기화됩니다.
              </div>
            ) : null}
          </div>
        </div>
      </AppBody>
    </>
  );
}
