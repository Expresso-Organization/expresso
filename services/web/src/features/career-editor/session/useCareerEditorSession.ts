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

function getSession(recordId: string) {
  let entry = pool.get(recordId);
  if (!entry) { entry = { session: new CareerEditorSession(recordId), users: 0 }; pool.set(recordId, entry); }
  return entry.session;
}
function release(recordId: string, session: CareerEditorSession) {
  const entry = pool.get(recordId);
  if (!entry || entry.session !== session) return;
  entry.users -= 1;
  if (entry.users > 0) return;
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
  return { session, snapshot, document: session.getDocument(), updateDocument: session.updateDocument };
}

export { CareerEditorSession };
export type { CareerEditorSnapshot } from "./CareerEditorSession";
