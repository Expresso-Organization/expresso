import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "../BrewSkeleton";
import styles from "./page.module.css";

/**
 * 03b 디자인 선택 — 템플릿 지면과 322px 고른 것 패널. 지면은 surface-50이다.
 *
 * 템플릿은 세 벌이다(`0002_seed.sql` — clarity · signal · editorial). 격자도
 * 3열이라 한 줄에 다 선다. 미리보기는 카드 안에서 높이를 다 쓰므로 뼈대도
 * 캔버스가 자라게 두고 이름 줄만 아래에 붙인다.
 *
 * 오른쪽 고른 것 패널의 다섯 줄 — 팔레트 · 서체 · 밀도 · 구성 문법 ·
 * 글자 대비 — 은 템플릿과 무관하게 늘 같은 순서로 선다.
 */
export default function Loading() {
  return (
    <BrewSkeleton step="design" tinted label="템플릿을 불러오는 중">
      <div className={styles.body}>
        <div className={styles.left}>
          <div className={`${styles.card} ${styles.pickerCard}`}>
            <div className={styles.pickerHead}>
              <Skel w={132} h={15} />
              <Skel w={168} h={11} />
            </div>

            <div className={styles.recipeBar}>
              <Skel w={14} h={14} radius={4} />
              <Skel w={188} h={12} />
              <Skel w={72} h={11} />
              <Skel w={62} h={11} style={{ marginLeft: "auto" }} />
            </div>

            <div className={styles.templates}>
              {skelKeys(3).map((template) => (
                <div key={template} className={styles.template}>
                  <Skel
                    className={styles.templateCanvas}
                    h="auto"
                    radius={0}
                    style={{ flex: "1 1 0%", minHeight: 0 }}
                  />
                  <span className={styles.templateFoot}>
                    <span className={styles.templateNameRow}>
                      <Skel w={84} h={12} />
                    </span>
                    <Skel w="82%" h={10} style={{ marginTop: 6 }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className={styles.right}>
          <div className={`${styles.card} ${styles.chosenCard}`}>
            <div className={styles.chosenHead}>
              <Skel w={96} h={14} />
              <Skel w={48} h={18} radius={6} style={{ marginLeft: "auto" }} />
            </div>
            <div className={styles.chosenList}>
              {skelKeys(5).map((row) => (
                <div key={row} className={styles.chosenRow}>
                  <Skel w={64} h={11} />
                  <Skel w={104} h={22} radius={7} style={{ marginLeft: "auto" }} />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.brewWrap}>
            <Skel h={42} radius={11} />
            <Skel w="72%" h={11} style={{ marginTop: 11 }} />
          </div>
        </aside>
      </div>
    </BrewSkeleton>
  );
}
