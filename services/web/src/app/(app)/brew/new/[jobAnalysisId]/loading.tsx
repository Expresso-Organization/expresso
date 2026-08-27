import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion } from "@/components/shell/Skeleton";

import styles from "../page.module.css";

/**
 * 01b 공고 분석 대기 화면이 분석 상태를 기다리는 동안.
 *
 * 이 화면은 어느 상태든 가운데 420px 카드 하나다 — 읽는 중이든, 다 읽었든,
 * 실패했든. 그래서 뼈대도 그 카드 하나면 된다. 무엇이 적힐지는 응답이 정하므로
 * 글줄만 비운다.
 */
export default function Loading() {
  return (
    <>
      <AppHeader title="새 포트폴리오" />
      <AppBody>
        <SkelRegion label="공고 분석 상태를 불러오는 중" className={styles.wait}>
          <div className={styles.waitCard}>
            <Skel w={34} circle style={{ marginBottom: 4 }} />
            <Skel w={148} h={17} />
            <Skel w={296} h={12} />
            <Skel w={244} h={12} />
            <Skel w={132} h={34} radius={9} style={{ marginTop: 6 }} />
          </div>
        </SkelRegion>
      </AppBody>
    </>
  );
}
