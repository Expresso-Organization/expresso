"use client";

import { openNotifications, openSearch } from "@/components/CommandPalette";
import { Icon } from "@/components/ui/Icon";

import { appShellStyles as styles } from "./AppShell";

/** 00 헤더의 검색 · 알림 버튼. 00c 오버레이를 연다. */
export function SearchAndNotifications({ unread = true }: { unread?: boolean }) {
  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="검색"
        onClick={openSearch}
      >
        <Icon name="magnifying-glass" size={17} />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="알림"
        onClick={openNotifications}
      >
        <Icon name="bell" size={17} />
        {unread ? <span className={styles.notificationDot} /> : null}
      </button>
    </>
  );
}
