import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";
import { ACCOUNT } from "@/lib/sample/site";

import { AccountNav } from "./AccountNav";
import styles from "./page.module.css";

/**
 * 라벨과 줄 모양은 화면과 같다 — 사용량 구획만 라벨 없이 시작하고, 요금제는
 * 세 칸 격자, 결제는 줄, 데이터·동의는 테두리 있는 줄이다.
 */
const ROW_SECTIONS = [
  { label: "BILLING", style: "billingRow" },
  { label: "DATA", style: "dataRow" },
  { label: "AI 사용 동의", style: "consentRow" },
] as const;

/**
 * 09 설정이 세션과 동의 상태를 기다리는 동안.
 *
 * 좌측 탭 · 제목 · 안내문 · 구획 이름은 응답과 무관하다. 덮어 두면 어느
 * 설정을 열었는지도 잠깐 사라지므로 그대로 그린다.
 */
export default function Loading() {
  return (
    <>
      <DocumentHeader crumbs={["설정", "요금제"]} />
      <AppBody>
        <div className={styles.body}>
          <AccountNav />
          <SkelRegion label="설정을 불러오는 중" className={styles.main}>
            <h1 className={styles.title}>요금제 · 사용량</h1>
            <p className={styles.intro}>{ACCOUNT.intro}</p>

            <div className={styles.section}>
              <div className={styles.usageGrid}>
                {skelKeys(3).map((card) => (
                  <div key={card} className={styles.usageCard}>
                    <Skel w={96} h={12} />
                    <Skel h={6} radius={999} style={{ marginTop: 14 }} />
                    <Skel w={104} h={10} style={{ marginTop: 12 }} />
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>PLANS</div>
              <div className={styles.plans}>
                {skelKeys(3).map((plan) => (
                  <div key={plan} className={styles.plan}>
                    <Skel w={96} h={13} />
                    <Skel w={72} h={20} style={{ marginTop: 12 }} />
                    {skelKeys(3).map((feature) => (
                      <Skel
                        key={feature}
                        w={`${82 - feature * 11}%`}
                        h={11}
                        style={{ marginTop: 10 }}
                      />
                    ))}
                    <Skel h={32} radius={9} style={{ marginTop: 16 }} />
                  </div>
                ))}
              </div>
            </div>

            {ROW_SECTIONS.map((section) => (
              <div key={section.label} className={styles.section}>
                <div className={styles.sectionLabel}>{section.label}</div>
                {skelKeys(3).map((row) => (
                  <div
                    key={row}
                    className={styles[section.style]}
                    style={section.style === "billingRow" ? undefined : { marginBottom: 9 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Skel w={`${44 - row * 6}%`} h={12} />
                      <Skel w="72%" h={11} style={{ marginTop: 7 }} />
                    </div>
                    <Skel w={62} h={30} radius={8} />
                  </div>
                ))}
              </div>
            ))}
          </SkelRegion>
        </div>
      </AppBody>
    </>
  );
}
