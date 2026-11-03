"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { CareerEditorSession } from "./CareerEditorSession";

interface PoolEntry {
  session: CareerEditorSession;
  users: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  idleUnsubscribe?: () => void;
}

const pool = new Map<string, PoolEntry>();

// 저장되지 않은 본문이 남아 있으면 탭을 닫거나 다른 사이트로 갈 때 브라우저가 묻게 합니다.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if ([...pool.values()].some((entry) => entry.session.hasPendingUpdates())) event.preventDefault();
  });
}

function getSession(recordId: string) {
  let entry = pool.get(recordId);
  if (!entry) {
    entry = { session: new CareerEditorSession(recordId), users: 0 };
    pool.set(recordId, entry);
    // 렌더 중에 만든 세션입니다. 그 렌더가 커밋되지 않으면 아무도 acquire하지 않으므로, 쓰는 곳이 없을 때 정리를 예약합니다.
    scheduleCleanup(recordId, entry.session);
  }
  return entry.session;
}
function release(recordId: string, session: CareerEditorSession) {
  const entry = pool.get(recordId);
  if (!entry || entry.session !== session) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  scheduleCleanup(recordId, session);
}
function scheduleCleanup(recordId: string, session: CareerEditorSession) {
  const entry = pool.get(recordId);
  if (!entry || entry.session !== session || entry.users > 0) return;
  if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  // React 개발 모드의 effect 재실행에서는 같은 tick에 다시 acquire됩니다.
  entry.cleanupTimer = setTimeout(() => {
    const latest = pool.get(recordId);
    if (!latest || latest.session !== session || latest.users > 0) return;
    if (!session.hasPendingUpdates()) { session.dispose(); pool.delete(recordId); return; }
    latest.idleUnsubscribe ??= session.subscribe(() => {
      const current = pool.get(recordId);
      if (current?.users === 0 && !session.hasPendingUpdates()) {
        current.idleUnsubscribe?.();
        session.dispose();
        pool.delete(recordId);
      }
    });
  }, 30_000);
}

export function useCareerEditorSession(recordId: string) {
  const session = useMemo(() => getSession(recordId), [recordId]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    const entry = pool.get(recordId);
    if (entry?.session === session) {
      if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
      delete entry.cleanupTimer;
      entry.users += 1;
    }
    return () => release(recordId, session);
  }, [recordId, session]);
  return { session, snapshot, document: session.getDocument(), yDocument: session.getYDocument(), publishDocument: session.publishDocument };
}

export { CareerEditorSession };
export type { CareerEditorSnapshot } from "./CareerEditorSession";
