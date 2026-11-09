import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";
import { WizardSteps } from "@/components/shell/WizardShell";

import styles from "./page.module.css";

/**
 * 01 새 포트폴리오가 세션을 기다리는 동안.
 *
 * 머리말과 제목은 어느 갈래로 들어와도 같은 자리에 같은 글자로 선다. 아래는
 * 갈래에 따라 첫 화면이거나 입력 화면인데 `loading.tsx`는 `mode`를 알 수
 * 없으므로, 가장 흔히 들어오는 첫 화면(검색 칸 · 공고 줄 | 갈래)의 뼈대를 세운다.
 */
export default function Loading() {
  return (
    <>
      <AppHeader title="새 포트폴리오" />
      {/* 이 자리는 언제나 01 공고 분석의 입구다 — 본 화면과 같은 줄을 세운다 */}
      <WizardSteps current="analyze" situation="예상 3분" />
      <AppBody>
        <SkelRegion label="불러오는 중" className={styles.page}>
          <div className={styles.head}>
            <h1 className={styles.title}>어디에 지원하나요</h1>
          </div>
          <div className={styles.entrySearch}>
            <Skel w="40%" h={14} />
          </div>
          <div className={styles.split}>
            <div className={styles.panel}>
              {skelKeys(4).map((row) => (
                <div key={row} className={styles.jobRow}>
                  <Skel w={26} h={26} radius={7} />
                  <Skel w="54%" h={12} />
                </div>
              ))}
            </div>
            <div className={styles.routes}>
              {skelKeys(3).map((row) => (
                <div key={row} className={styles.route}>
                  <Skel w={30} h={30} radius={8} />
                  <Skel w="60%" h={12} />
                </div>
              ))}
            </div>
          </div>
        </SkelRegion>
      </AppBody>
    </>
  );
}
