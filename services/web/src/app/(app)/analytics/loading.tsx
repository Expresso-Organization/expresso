import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 07 분석이 대시보드를 기다리는 동안.
 *
 * 12칼럼 격자에 앉는 위젯의 폭은 사람마다 다르지만, 아무도 바꾸지 않았을 때의
 * 기본 지면은 정해져 있다 — 숫자 타일 4개(span 3) · 추세 그래프(8)와 메모(4) ·
 * 아래 네 칸(4·4·4). 백엔드 `analytics/metrics.ts`의 기본 위젯 목록 그대로다.
 *
 * 제목은 포트폴리오 이름이라 비운다. 어느 포트폴리오를 볼지는 응답이 정한다.
 */
const DEFAULT_SPANS = [3, 3, 3, 3, 8, 4, 4, 4, 4];

export default function Loading() {
  return (
    <>
      <AppHeader
        title={<Skel w={148} h={16} />}
        actions={
          <>
            <Skel w={132} h={12} />
            <Skel w={128} h={26} radius={8} />
          </>
        }
      />
      <AppBody>
        <SkelRegion label="대시보드를 불러오는 중" className={styles.content}>
          <div className={styles.viewBar}>
            {skelKeys(2).map((tab) => (
              <Skel key={tab} w={92} h={12} style={{ marginBottom: 10 }} />
            ))}
          </div>

          <div className={styles.grid}>
            {DEFAULT_SPANS.map((span, index) => (
              <div
                key={index}
                className={styles.widget}
                style={{ gridColumn: `span ${span}` }}
              >
                <div className={styles.tileHead}>
                  <Skel w={84} h={11} />
                </div>
                {/* 숫자 타일은 값 한 줄, 나머지는 그래프 자리 */}
                {span === 3 ? <Skel w={72} h={30} /> : <Skel h={130} radius={8} />}
              </div>
            ))}
          </div>
        </SkelRegion>
      </AppBody>
    </>
  );
}
