import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import panelStyles from "./[categorySlug]/DocumentPanel.module.css";
import styles from "./[categorySlug]/page.module.css";

/**
 * 05 내 커리어가 기록을 기다리는 동안.
 *
 * 어느 카테고리인지는 여기서 알 수 없다 — `loading.tsx`는 params를 받지 않는다
 * (Next 16 `loading.js` 규약). 그래서 이름·설명·뷰 이름은 비우고, 카테고리가
 * 무엇이든 같은 **두 단 구조**만 미리 세운다. 오른쪽 문서 패널은 고른 기록이
 * 없어도 680px로 서 있으므로 여기서도 자리를 지킨다.
 */
export default function Loading() {
  return (
    <>
      <DocumentHeader crumbs={["내 커리어", null]} />
      <AppBody>
        <SkelRegion label="기록을 불러오는 중" className={styles.list}>
          <div className={styles.categoryHead}>
            <Skel w={34} h={34} radius={9} />
            <Skel w={132} h={22} />
          </div>
          <Skel w="62%" h={12} style={{ margin: "0 0 18px" }} />

          <div className={styles.viewBar}>
            {skelKeys(3).map((tab) => (
              <Skel key={tab} w={48} h={12} style={{ marginBottom: 9 }} />
            ))}
            <div className={styles.viewBarRight}>
              <Skel w={132} h={12} />
              <Skel w={168} h={31} radius={8} />
            </div>
          </div>

          <div className={styles.table}>
            <div className={`${styles.row} ${styles.headRow}`}>
              {skelKeys(6).map((cell) => (
                <div key={cell} className={styles.headCell}>
                  <Skel w={cell === 0 ? 68 : 40} h={11} />
                </div>
              ))}
            </div>
            {skelKeys(8).map((row) => (
              <div key={row} className={styles.row}>
                <div className={styles.titleCell}>
                  <Skel w={`${76 - (row % 5) * 9}%`} h={12} />
                </div>
                {skelKeys(5).map((cell) => (
                  <div key={cell} className={styles.cell}>
                    <Skel w="72%" h={10} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SkelRegion>

        <aside className={panelStyles.panel} aria-hidden="true" />
      </AppBody>
    </>
  );
}
