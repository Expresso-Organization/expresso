"use client";

import { AnalyticsEventSchema, type AnalyticsEvent } from "@expresso/contracts";
import { useEffect, useRef } from "react";

import { SiteTrackerMessageSchema, type SiteTrackerMessage } from "@/lib/site-tracker-message";

import styles from "./page.module.css";

const SESSION_KEY = "ex_site_session";

/** 탭 하나가 한 세션이다. 저장소가 막힌 브라우저에서는 이 화면이 떠 있는 동안만 쓴다. */
function sessionId(): string {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function send(event: AnalyticsEvent): Promise<void> {
  // keepalive: 탭을 닫는 순간 보낸 체류 기록도 끝까지 간다.
  return fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).then(() => undefined, () => undefined);
}

/**
 * 공개 사이트 문서를 iframe에 띄우고, 안에서 온 알림을 방문 기록으로 바꿔 보낸다.
 *
 * 방문이 먼저 저장되어야 나머지가 받아지므로 요청은 하나씩 차례로 보낸다. 알림은 이
 * iframe에서 온 것만 받는다.
 */
export function SiteFrame({ slug, title, document, outline }: {
  slug: string;
  title: string;
  document: string;
  /** 섹션 목록의 id. 추적 스크립트가 알리는 순번이 이 배열의 자리다. */
  outline: string[];
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // 효과가 두 번 돌아도(개발 모드의 StrictMode) 방문은 한 번이고, 줄은 하나다.
  const queue = useRef(Promise.resolve());
  const visited = useRef<{ session: string; startedAt: number } | null>(null);

  useEffect(() => {
    const build = (event: Record<string, unknown>) => {
      if (!visited.current) return null;
      const parsed = AnalyticsEventSchema.safeParse({ eventId: crypto.randomUUID(), slug, sessionId: visited.current.session, occurredAt: new Date().toISOString(), ...event });
      return parsed.success ? parsed.data : null;
    };
    const record = (event: Record<string, unknown>) => {
      const built = build(event);
      if (built) queue.current = queue.current.then(() => send(built));
    };
    if (!visited.current) {
      visited.current = { session: sessionId(), startedAt: Date.now() };
      record({ type: "visit", ...(window.document.referrer ? { referrer: window.document.referrer } : {}) });
    }
    const startedAt = visited.current.startedAt;

    /*
     * 섹션 체류는 여기서 잰다. iframe은 섹션이 보이기 시작하고 벗어나는 순간만 알린다.
     * 탭이 가려지면 보이던 섹션을 그 자리에서 닫아 바로 보낸다 — 닫히는 중에는 줄을
     * 기다릴 시간이 없고, 방문은 이미 저장되어 있다.
     */
    const open = new Map<number, number>();
    const inView = new Set<number>();
    let depth = 0;
    const closeSection = (index: number, now: boolean) => {
      const since = open.get(index);
      open.delete(index);
      const sectionId = outline[index];
      if (since === undefined || !sectionId) return;
      const event = { type: "section_view", sectionId, dwellMs: Math.round(Date.now() - since), scrollDepth: depth };
      if (!now) return record(event);
      const built = build(event);
      if (built) void send(built);
    };
    const closeAll = () => { for (const index of [...open.keys()]) closeSection(index, true); };
    const onVisibility = () => {
      if (window.document.visibilityState === "hidden") closeAll();
      else for (const index of inView) open.set(index, Date.now());
    };

    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const parsed = SiteTrackerMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message: SiteTrackerMessage = parsed.data;
      switch (message.kind) {
        case "complete":
          return record({ type: "complete", durationMs: Date.now() - startedAt });
        case "section":
          depth = Math.max(depth, message.scrollDepth);
          if (message.visible) {
            inView.add(message.index);
            if (window.document.visibilityState === "visible") open.set(message.index, Date.now());
          } else {
            inView.delete(message.index);
            closeSection(message.index, false);
          }
          return;
        case "contact":
          return record({ type: "contact_click", target: message.target });
        case "download":
          return record({ type: "file_download", target: message.target });
        case "link":
          return record({ type: "link_click", target: message.target });
      }
    };
    window.addEventListener("message", onMessage);
    window.document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", closeAll);
    return () => {
      window.removeEventListener("message", onMessage);
      window.document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", closeAll);
    };
  }, [slug, outline]);

  return (
    <iframe
      ref={frame}
      className={styles.publicDocument!}
      title={title}
      // 스크립트는 문서 안의 CSP가 추적 스크립트 하나로 묶는다. allow-same-origin은 주지 않는다 —
      // 둘을 함께 주면 문서가 sandbox를 풀 수 있다.
      sandbox="allow-scripts allow-popups"
      srcDoc={document}
    />
  );
}
