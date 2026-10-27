"use client";

import type { Notification, NotificationKind } from "@expresso/contracts";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./CommandPalette.module.css";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  notificationsAction,
  searchAction,
} from "./palette-actions";

type SearchItem = Awaited<ReturnType<typeof searchAction>>[number];

const SEARCH_GROUPS: ReadonlyArray<{ type: SearchItem["type"]; label: string; kind: string }> = [
  { type: "record", label: "기록", kind: "RECORD" },
  { type: "job", label: "공고", kind: "JOB" },
  { type: "portfolio", label: "포트폴리오", kind: "PORTFOLIO" },
];

function searchHref(item: SearchItem): Route {
  if (item.type === "record") return `/career/records/${item.id}` as Route;
  if (item.type === "job") return `/jobs/${item.id}` as Route;
  return `/edit/${item.id}` as Route;
}

/** 검색은 기록 · 포트폴리오의 상태 코드를 보조 문구로 보낸다. 공고는 회사 이름이다. */
const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  organized: "정리됨",
  verified: "검증됨",
  published: "공개",
  unlisted: "비공개",
};

function searchSubtitle(item: SearchItem): string {
  if (item.type === "job") return item.subtitle;
  return STATUS_LABEL[item.subtitle] ?? "";
}

/** 백엔드는 종류와 대상 이름만 보낸다. 문장은 여기서 만든다. */
const NOTIFICATION_COPY: Record<NotificationKind, { fallback: string; body: string }> = {
  deadline: { fallback: "관심 공고", body: "마감이 3일 안으로 다가왔습니다" },
  generation: { fallback: "포트폴리오", body: "생성이 끝났습니다. 눌러서 편집으로 갑니다" },
  saved_search: { fallback: "저장한 검색", body: "조건에 맞는 새 공고가 있습니다" },
  traffic: { fallback: "배포한 포트폴리오", body: "새 방문이 있습니다" },
};

/** 지금 만들어지는 알림 종류만 거른다(마감 · 생성). */
const NOTIFICATION_FILTERS: ReadonlyArray<{ key: "all" | NotificationKind; label: string }> = [
  { key: "all", label: "전체" },
  { key: "deadline", label: "마감" },
  { key: "generation", label: "생성" },
];

function relativeTime(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}일 전`;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(iso));
}

/*
 * 안 읽은 알림 수. 헤더의 알림 버튼과 이 오버레이가 따로 그려지므로 모듈에 하나만
 * 두고 둘이 함께 읽는다. 알림 목록을 읽는 곳은 이 오버레이 한 곳이다.
 */
let unreadCount = 0;
const unreadListeners = new Set<() => void>();
function publishUnread(notifications: readonly Notification[]) {
  unreadCount = notifications.filter((item) => item.readAt === null).length;
  for (const listener of unreadListeners) listener();
}
function subscribeUnread(listener: () => void) {
  unreadListeners.add(listener);
  return () => unreadListeners.delete(listener);
}

export function useUnreadNotificationCount(): number {
  return useSyncExternalStore(subscribeUnread, () => unreadCount, () => 0);
}

/**
 * 00c 통합 검색 · 알림.
 * ⌘K로 열고 Esc로 닫는다 (§12 단축키). 라우트가 아니라 오버레이라서
 * 앱 셸에 한 번만 얹는다.
 */
export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRun = useRef(0);

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [notificationsFailed, setNotificationsFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [filter, setFilter] = useState<"all" | NotificationKind>("all");

  const openPalette = useCallback(() => {
    setQuery("");
    setResults(null);
    setSearchFailed(false);
    setActiveIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) setOpen(false);
        else openPalette();
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        setNotificationsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openPalette]);

  // 헤더의 검색·알림 버튼이 이 오버레이를 연다.
  useEffect(() => {
    function onOpenNotifications() {
      setNotificationsOpen((current) => !current);
    }
    window.addEventListener("ex:open-search", openPalette);
    window.addEventListener("ex:open-notifications", onOpenNotifications);
    return () => {
      window.removeEventListener("ex:open-search", openPalette);
      window.removeEventListener("ex:open-notifications", onOpenNotifications);
    };
  }, [openPalette]);

  const loadNotifications = useCallback(async () => {
    try {
      const rows = await notificationsAction();
      setNotifications(rows);
      setNotificationsFailed(false);
      setLoadedAt(Date.now());
      publishUnread(rows);
    } catch {
      setNotificationsFailed(true);
    }
  }, []);

  // 화면을 옮길 때와 패널을 열 때 다시 읽는다. 안 읽은 수가 헤더에 함께 그려진다.
  useEffect(() => {
    void loadNotifications();
  }, [pathname, loadNotifications]);
  useEffect(() => {
    if (notificationsOpen) void loadNotifications();
  }, [notificationsOpen, loadNotifications]);

  // 입력이 멈추면 찾는다. 늦게 온 이전 응답은 버린다.
  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    const run = ++searchRun.current;
    if (!text) {
      setResults(null);
      setSearchFailed(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchAction(text);
        if (run !== searchRun.current) return;
        setResults(rows);
        setSearchFailed(false);
        setActiveIndex(0);
      } catch {
        if (run === searchRun.current) setSearchFailed(true);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const grouped = useMemo(
    () =>
      SEARCH_GROUPS.map((group) => ({
        ...group,
        items: (results ?? []).filter((item) => item.type === group.type),
      })).filter((group) => group.items.length > 0),
    [results],
  );
  const flat = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);

  function openResult(item: SearchItem) {
    setOpen(false);
    router.push(searchHref(item));
  }

  function onQueryKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const item = flat[activeIndex];
      if (item) openResult(item);
    }
  }

  async function openNotification(item: Notification) {
    setNotificationsOpen(false);
    if (item.readAt === null) {
      const readAt = new Date().toISOString();
      setNotifications((rows) => {
        const next = (rows ?? []).map((row) => (row.id === item.id ? { ...row, readAt } : row));
        publishUnread(next);
        return next;
      });
      void markNotificationReadAction(item.id).catch(() => undefined);
    }
    router.push(item.targetUrl as Route);
  }

  async function readAll() {
    const readAt = new Date().toISOString();
    const previous = notifications;
    setNotifications((rows) => {
      const next = (rows ?? []).map((row) => (row.readAt === null ? { ...row, readAt } : row));
      publishUnread(next);
      return next;
    });
    try {
      await markAllNotificationsReadAction();
    } catch {
      // 서버가 받지 못했으면 화면도 되돌린다.
      if (previous) {
        setNotifications(previous);
        publishUnread(previous);
      }
    }
  }

  const unread = (notifications ?? []).filter((item) => item.readAt === null).length;
  const visibleNotifications = (notifications ?? []).filter((item) => filter === "all" || item.kind === filter);

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
              <Icon name="magnifying-glass" size={17} color="var(--ex-fg-muted)" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onQueryKeyDown}
                placeholder="기록 · 공고 · 포트폴리오 제목으로 찾기"
                className={styles.input}
                aria-label="검색어"
              />
              <span className={styles.escape}>ESC</span>
            </div>

            {query.trim() ? (
              <div className={styles.results}>
                {searchFailed ? (
                  <p className={styles.status}>검색하지 못했습니다. 잠시 뒤 다시 입력해 주세요.</p>
                ) : results === null ? null : grouped.length === 0 ? (
                  <p className={styles.status}>「{query.trim()}」와 맞는 기록 · 공고 · 포트폴리오가 없습니다.</p>
                ) : (
                  grouped.map((group) => (
                    <div key={group.type}>
                      <div className={styles.groupHead}>
                        <span className={styles.groupLabel}>{group.label}</span>
                        <span className={styles.groupCount}>{group.items.length}</span>
                      </div>
                      {group.items.map((item) => {
                        const index = flat.indexOf(item);
                        return (
                          <button
                            key={`${item.type}-${item.id}`}
                            type="button"
                            className={`${styles.item} ${index === activeIndex ? styles.itemActive : ""}`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => openResult(item)}
                          >
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span className={styles.itemTitle} style={{ display: "block" }}>
                                {item.title}
                              </span>
                              {searchSubtitle(item) ? (
                                <span className={styles.itemMeta} style={{ display: "block" }}>
                                  {searchSubtitle(item)}
                                </span>
                              ) : null}
                            </span>
                            <span className={styles.kind}>{group.kind}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {notificationsOpen ? (
        <div className={styles.notifications} role="dialog" aria-label="알림">
          <div className={styles.notificationHead}>
            <span className={styles.notificationTitle}>알림</span>
            {unread > 0 ? <span className={styles.unreadBadge}>{unread}</span> : null}
            {unread > 0 ? (
              <button type="button" className={styles.readAll} onClick={() => void readAll()}>
                모두 읽음
              </button>
            ) : null}
          </div>
          <div className={styles.notificationFilters}>
            {NOTIFICATION_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                className={`${styles.notificationFilter} ${
                  filter === item.key ? styles.notificationFilterActive : ""
                }`}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={styles.notificationList}>
            {notificationsFailed && notifications === null ? (
              <p className={styles.status}>알림을 불러오지 못했습니다.</p>
            ) : notifications !== null && visibleNotifications.length === 0 ? (
              <p className={styles.status}>{filter === "all" ? "받은 알림이 없습니다." : "이 종류의 알림이 없습니다."}</p>
            ) : (
              visibleNotifications.map((item) => {
                const copy = NOTIFICATION_COPY[item.kind];
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.notification}
                    onClick={() => void openNotification(item)}
                  >
                    {item.readAt === null ? (
                      <span className={styles.unreadDot} aria-label="안 읽음" />
                    ) : (
                      <span className={styles.unreadDotPlaceholder} />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className={styles.notificationItemTitle} style={{ display: "block" }}>
                        {item.subject ?? copy.fallback}
                      </span>
                      <span className={styles.notificationBody} style={{ display: "block" }}>
                        {copy.body}
                      </span>
                      <span className={styles.notificationAt} style={{ display: "block" }}>
                        {relativeTime(item.createdAt, loadedAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
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
