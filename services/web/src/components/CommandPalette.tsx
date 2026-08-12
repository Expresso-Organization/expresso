"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { NOTIFICATIONS, PALETTE } from "@/lib/sample/site";

import styles from "./CommandPalette.module.css";

/**
 * 00c 통합 검색 · 알림.
 * ⌘K로 열고 Esc로 닫는다 (§12 단축키). 라우트가 아니라 오버레이라서
 * 앱 셸에 한 번만 얹는다.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        setNotificationsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 헤더의 검색·알림 버튼이 이 오버레이를 연다.
  useEffect(() => {
    function onOpenSearch() {
      setOpen(true);
    }
    function onOpenNotifications() {
      setNotificationsOpen((current) => !current);
    }
    window.addEventListener("ex:open-search", onOpenSearch);
    window.addEventListener("ex:open-notifications", onOpenNotifications);
    return () => {
      window.removeEventListener("ex:open-search", onOpenSearch);
      window.removeEventListener("ex:open-notifications", onOpenNotifications);
    };
  }, []);

  return (
    <>
      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className={styles.palette} role="dialog" aria-label="통합 검색">
            <div className={styles.queryRow}>
              <Icon name="magnifying-glass" size={17} color="var(--ex-slate-500)" />
              <span className={styles.crumb}>홈</span>
              <span className={styles.crumb}>오늘 할 일</span>
              <input
                autoFocus
                defaultValue={PALETTE.query}
                className={styles.input}
                aria-label="검색어"
              />
              <span className={styles.escape}>ESC</span>
            </div>

            <div className={styles.results}>
              {PALETTE.groups.map((group) => (
                <div key={group.label}>
                  <div className={styles.groupHead}>
                    <span className={styles.groupLabel}>{group.label}</span>
                    <span className={styles.groupCount}>{group.count}</span>
                  </div>
                  {group.items.map((item, index) => (
                    <button
                      key={item.title}
                      type="button"
                      className={`${styles.item} ${
                        group.label === "기록" && index === 0 ? styles.itemActive : ""
                      }`}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className={styles.itemTitle} style={{ display: "block" }}>
                          {item.title}
                        </span>
                        {item.meta ? (
                          <span className={styles.itemMeta} style={{ display: "block" }}>
                            {item.meta}
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.kind}>{item.kind}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className={styles.foot}>
              {PALETTE.shortcuts.map((shortcut) => (
                <span key={shortcut} className={styles.shortcut}>
                  {shortcut}
                </span>
              ))}
              <span className={styles.recent}>{PALETTE.recentCount}</span>
            </div>
          </div>
        </div>
      ) : null}

      {notificationsOpen ? (
        <div className={styles.notifications} role="dialog" aria-label="알림">
          <div className={styles.notificationHead}>
            <span className={styles.notificationTitle}>알림</span>
            <span className={styles.unreadBadge}>{NOTIFICATIONS.unread}</span>
            <button type="button" className={styles.readAll}>
              모두 읽음
            </button>
          </div>
          <div className={styles.notificationFilters}>
            {NOTIFICATIONS.filters.map((filter, index) => (
              <button
                key={filter}
                type="button"
                className={`${styles.notificationFilter} ${
                  index === 0 ? styles.notificationFilterActive : ""
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className={styles.notificationList}>
            {NOTIFICATIONS.items.map((item) => (
              <button key={item.title} type="button" className={styles.notification}>
                {item.unread ? (
                  <span className={styles.unreadDot} />
                ) : (
                  <span className={styles.unreadDotPlaceholder} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className={styles.notificationItemTitle} style={{ display: "block" }}>
                    {item.title}
                  </span>
                  <span className={styles.notificationBody} style={{ display: "block" }}>
                    {item.body}
                  </span>
                  <span className={styles.notificationAt} style={{ display: "block" }}>
                    {item.at}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 헤더 아이콘이 오버레이를 열도록 이벤트만 던진다. */
export function openSearch() {
  window.dispatchEvent(new Event("ex:open-search"));
}

export function openNotifications() {
  window.dispatchEvent(new Event("ex:open-notifications"));
}
