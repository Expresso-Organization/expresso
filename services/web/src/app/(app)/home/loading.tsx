import { AppBody } from "@/components/shell/AppShell";

import { HomeHeader, HomeSearch } from "./HomeChrome";
import {
  CareerGridSkeleton,
  MidRowSkeleton,
  PortfolioGridSkeleton,
} from "./HomeSkeleton";
import styles from "./page.module.css";

/**
 * 00 홈이 세션을 기다리는 동안.
 *
 * 헤더와 검색 바는 진짜로 그린다 — 세션이 없어도 그릴 수 있고, 덮어 두면
 * 응답이 온 순간 화면이 한 번 튄다. 기다리는 세 구획만 뼈대로 남긴다.
 */
export default function Loading() {
  return (
    <>
      <HomeHeader />
      <AppBody>
        <div className={styles.content}>
          <HomeSearch />
          <MidRowSkeleton />
          <PortfolioGridSkeleton />
          <CareerGridSkeleton />
        </div>
      </AppBody>
    </>
  );
}
