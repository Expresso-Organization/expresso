import Link from "next/link";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

import { Skel, SkelRegion, skelKeys } from "./Skeleton";
import { SidebarNav } from "./SidebarNav";
import styles from "./Sidebar.module.css";

/**
 * 사이드바가 도착하기 전의 자리.
 *
 * 로고 · 1차 메뉴 · 설정 링크는 세 응답을 기다릴 이유가 없다 — 주소만 알면
 * 그려지고, 기다리는 동안에도 눌러서 다른 데로 갈 수 있어야 한다. 그래서
 * 여기서 뼈대로 두는 것은 **정말 응답에서 오는 것**뿐이다.
 *
 * 포트폴리오·관심 공고 묶음은 0건이면 화면에서 통째로 사라진다. 몇 개가 올지
 * 모르는 자리에 뼈대를 세워 두면 0건일 때 그만큼 접히므로, 그 두 묶음은 비워
 * 두고 언제나 있는 것 — 커리어 트리와 바닥 — 만 그린다.
 */
export function SidebarSkeleton() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.scroll}>
        <div className={styles.brand}>
          <LogoMark size={22} />
          <span className={styles.brandName}>
            <Wordmark />
          </span>
          <Icon name="caret-up-down" size={13} color="var(--ex-slate-500)" />
        </div>

        <SidebarNav />

        <div className={styles.groupHead}>
          <span className={styles.groupLabel}>내 커리어</span>
        </div>
        <SkelRegion label="사이드바를 불러오는 중" className={styles.categories}>
          {/* 기본 분류 7개 — `0002_seed.sql` */}
          {skelKeys(7).map((row) => (
            <div key={row} className={styles.categoryItem}>
              <Skel w={14} h={14} radius={4} />
              <Skel w={`${74 - (row % 4) * 11}%`} h={11} />
            </div>
          ))}
        </SkelRegion>
      </div>

      <div className={styles.footer}>
        <div className={styles.quotaCard}>
          <div className={styles.quotaHead}>
            <span className={styles.quotaLabel}>이번 달 추출</span>
            <Skel w={44} h={10} />
          </div>
          <div className={styles.quotaTrack} />
          <Link href="/account" className={styles.upgradeLink}>
            Double Shot 추가
          </Link>
        </div>
        <div className={styles.user}>
          <Skel w={24} circle />
          <Skel w={92} h={12} />
          <Link href="/account" className={styles.userAction} aria-label="설정">
            <Icon name="gear-six" size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
