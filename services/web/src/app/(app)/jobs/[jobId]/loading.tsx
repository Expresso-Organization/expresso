import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 06b 공고 상세가 공고 하나를 기다리는 동안.
 *
 * 이 자리에 목록 뼈대가 서 있으면 안 된다 — 상세는 본문 한 단과 오른쪽 316px
 * 레일로 된 다른 구조다.
 *
 * "목록으로 돌아가기"는 진짜로 그린다. 어느 공고인지 몰라도 돌아갈 곳은 알고,
 * 기다리는 동안 마음이 바뀐 사람이 실제로 누르는 것이 이 링크다. 다만 목록의
 * 필터·쪽 번호까지는 알 수 없어 `/jobs`로 보낸다.
 */
export default function Loading() {
  return (
    <>
      <DocumentHeader crumbs={[{ label: "공고 탐색", href: "/jobs" }, null]} />
      <AppBody>
        <SkelRegion label="공고를 불러오는 중" className={styles.body}>
          <div className={styles.left}>
            <Skel w={124} h={13} style={{ marginBottom: 14 }} />
            <Skel w="54%" h={26} style={{ marginBottom: 11 }} />
            <div className={styles.team}>
              <Skel w={20} h={20} radius={5} />
              <Skel w={188} h={12} />
            </div>

            <dl className={styles.facts}>
              {skelKeys(5).map((fact) => (
                <div key={fact} className={styles.fact}>
                  <Skel w={96} h={11} />
                  <Skel w={`${58 - (fact % 3) * 12}%`} h={11} />
                </div>
              ))}
            </dl>

            {skelKeys(2).map((block) => (
              <div key={block} className={styles.section}>
                <Skel w={72} h={9} style={{ marginBottom: 13 }} />
                {skelKeys(4).map((line) => (
                  <Skel
                    key={line}
                    w={`${94 - (line % 3) * 13}%`}
                    h={12}
                    style={{ marginBottom: 9 }}
                  />
                ))}
              </div>
            ))}
          </div>

          <aside className={styles.rail}>
            {skelKeys(3).map((card) => (
              <div key={card} className={styles.railCard}>
                <Skel w={118} h={12} style={{ marginBottom: 11 }} />
                <Skel h={11} style={{ marginBottom: 7 }} />
                <Skel w="72%" h={11} />
              </div>
            ))}
          </aside>
        </SkelRegion>
      </AppBody>
    </>
  );
}
