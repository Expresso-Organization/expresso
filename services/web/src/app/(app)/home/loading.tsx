import { AppBody } from "@/components/shell/AppShell";

import { HomeHeader, HomeSearch } from "./HomeChrome";
import { MidRowSkeleton, PortfolioGridSkeleton } from "./HomeSkeleton";
import styles from "./page.module.css";

/**
 * 00 홈이 세션과 목표 직군을 기다리는 동안.
 *
 * 헤더와 검색 바는 진짜로 그린다 — 기다리지 않아도 그릴 수 있고, 덮어 두면
 * 응답이 온 순간 화면이 한 번 튄다. 예시 질문은 목표 직군을 알아야 만들 수 있어
 * 비워 둔다. 기다리는 두 구획만 뼈대로 남긴다.
 */
export default function Loading() {
  return (
    <>
      <HomeHeader />
      <AppBody>
        <div className={styles.content}>
          <HomeSearch examples={[]} />
          <MidRowSkeleton />
          <PortfolioGridSkeleton />
        </div>
      </AppBody>
    </>
  );
}
