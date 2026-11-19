import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import { AccountLink } from "./AccountLink";
import { SidebarConversations } from "./SidebarConversations";
import { SidebarFrame } from "./SidebarFrame";
import { SidebarNav, type SidebarSection } from "./SidebarNav";
import styles from "./Sidebar.module.css";

export type { SidebarSection };

export interface SidebarProps {
  displayName: string;
  /** 세션 주인이 관리자일 때만 관리 화면으로 가는 줄이 선다. */
  admin?: boolean;
  quotaUsed: number;
  /** 무제한 요금제는 상한이 없다. 없는 상한을 999로 적으면 그것도 거짓말이다. */
  quotaLimit: number | null;
}

export function Sidebar({
  displayName,
  admin = false,
  quotaUsed,
  quotaLimit,
}: SidebarProps) {
  const quotaRatio = !quotaLimit ? 0 : Math.min(1, quotaUsed / quotaLimit);

  return (
    <SidebarFrame
      footer={
        <>
          <div className={styles.quotaSlot}>
            {/* 카드 전체가 설정 화면의 사용량 구획으로 가는 링크다 */}
            <Link
              href="/account#usage"
              className={`${styles.copy} ${styles.quotaCard}`}
              title="사용량 보기"
            >
              <div className={styles.quotaHead}>
                <span className={styles.quotaLabel}>이번 달 크레딧</span>
                <span className={styles.quotaValue}>
                  {quotaUsed.toLocaleString("ko-KR")} / {quotaLimit?.toLocaleString("ko-KR") ?? "무제한"}
                </span>
              </div>
              <div
                className={styles.quotaTrack}
                role="meter"
                aria-valuenow={quotaUsed}
                aria-valuemin={0}
                aria-valuemax={quotaLimit ?? undefined}
                aria-label={quotaLimit === null
                  ? `이번 달 크레딧 ${quotaUsed} 사용 · 상한 없음`
                  : `이번 달 크레딧 ${quotaLimit} 중 ${quotaUsed} 사용`}
              >
                <div
                  className={styles.quotaFill}
                  style={{ width: `${quotaRatio * 100}%` }}
                />
              </div>
            </Link>
          </div>
          {admin ? (
            <Link href="/admin" className={`${styles.row} ${styles.userLink}`} title="관리">
              <span className={styles.adminIcon}><Icon name="user-switch" size={15} /></span>
              <span className={`${styles.copy} ${styles.userName}`}>관리</span>
            </Link>
          ) : null}
          <AccountLink title={`${displayName} · 설정`}>
            <span className={styles.avatar}>{displayName.slice(0, 1)}</span>
            <span className={`${styles.copy} ${styles.userName}`}>{displayName}</span>
            <span className={`${styles.copy} ${styles.userAction}`}>
              <Icon name="gear-six" size={14} />
            </span>
          </AccountLink>
        </>
      }
    >
      <SidebarNav />
      <SidebarConversations />
    </SidebarFrame>
  );
}
