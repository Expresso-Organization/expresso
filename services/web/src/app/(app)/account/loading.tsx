import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import { AccountNav } from "./AccountNav";
import styles from "./page.module.css";

/** 라벨과 줄 모양은 화면과 같다 — 알림 · 데이터 · 동의는 테두리 있는 줄이다. */
const ROW_SECTIONS = [
  { label: "알림", style: "consentRow", rows: 2 },
  { label: "데이터 관리", style: "dataRow", rows: 2 },
  { label: "AI 사용 동의", style: "consentRow", rows: 2 },
] as const;

/**
 * 09 설정이 사용량 · 알림 설정 · 동의 상태를 기다리는 동안.
 *
 * 좌측 목록 · 제목 · 구획 이름은 응답과 무관하다. 덮어 두면 어느 설정을 열었는지도
 * 잠깐 사라지므로 그대로 그린다.
 */
export default function Loading() {
  return (
    <>
      <DocumentHeader crumbs={["설정"]} />
      <AppBody>
        <div className={styles.body}>
          <AccountNav />
          <SkelRegion label="설정을 불러오는 중" className={styles.main}>
            <h1 className={styles.title}>설정</h1>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>프로필</div>
              {skelKeys(2).map((row) => (
                <div key={row} className={styles.dataRow} style={{ marginBottom: 9 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Skel w={row === 0 ? 112 : 196} h={13} />
                    <Skel w={64} h={11} style={{ marginTop: 7 }} />
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>사용량</div>
              <div className={styles.usageGrid}>
                <div className={styles.usageCard}>
                  <Skel w={96} h={12} />
                  <Skel h={6} radius={999} style={{ marginTop: 14 }} />
                  <Skel w={104} h={10} style={{ marginTop: 12 }} />
                </div>
              </div>
            </div>

            {ROW_SECTIONS.map((section) => (
              <div key={section.label} className={styles.section}>
                <div className={styles.sectionLabel}>{section.label}</div>
                {skelKeys(section.rows).map((row) => (
                  <div key={row} className={styles[section.style]} style={{ marginBottom: 9 }}>
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
