import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 01 새 포트폴리오가 세션을 기다리는 동안.
 *
 * 머리말과 제목은 어느 갈래로 들어와도 같은 자리에 같은 글자로 선다. 아래는
 * 갈래에 따라 카드 넷이거나 공고 목록인데 `loading.tsx`는 `mode`를 알 수
 * 없으므로, 둘이 공유하는 폭(`.cards` 격자)만 세우고 내용은 비운다.
 */
export default function Loading() {
  return (
    <>
      <AppHeader title="새 포트폴리오" />
      <AppBody>
        <SkelRegion label="불러오는 중" className={styles.page}>
          <div className={styles.head}>
            <h1 className={styles.title}>어디에 지원하나요</h1>
          </div>
          <Skel w={420} h={12} style={{ margin: "0 0 20px" }} />

          <div className={styles.cards}>
            {skelKeys(4).map((card) => (
              <div key={card} className={styles.card}>
                <Skel w={26} h={26} radius={8} />
                <Skel w="58%" h={13} style={{ marginTop: 4 }} />
                <Skel w="86%" h={11} />
              </div>
            ))}
          </div>
        </SkelRegion>
      </AppBody>
    </>
  );
}
