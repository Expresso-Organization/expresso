"use client";
import { useSyncExternalStore } from "react";
import { Icon } from "./Icon";
import styles from "./toast.module.css";

/**
 * 화면 구석에 잠깐 떴다 사라지는 알림.
 *
 * 화면 어디서든 `showToast()`로 부른다. 받는 자리는 루트 레이아웃의 `<Toaster />` 하나다 — 제공자를 감싸지 않아도 되도록
 * 모듈 하나가 목록을 들고 있다. 이 부품은 무엇에 대한 알림인지 모른다. 글을 정하는 일은 부르는 화면이 한다.
 */

export type ToastTone = "neutral" | "danger";
interface ToastItem { id: number; message: string; tone: ToastTone }

/** 두 줄 남짓한 글을 읽고 닫기를 누를 틈. 그보다 오래 남기면 다음 알림을 가린다. */
const VISIBLE_MS = 6000;
/** 한꺼번에 쌓아 두는 수. 넘치면 가장 오래된 것부터 내린다. */
const MAX_ITEMS = 3;
const EMPTY: ToastItem[] = [];

let items: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function dismissToast(id: number) {
  if (!items.some((item) => item.id === id)) return;
  items = items.filter((item) => item.id !== id);
  emit();
}

export function showToast(message: string, tone: ToastTone = "neutral") {
  // 같은 글이 이미 떠 있으면 쌓지 않는다 — 다시 읽기가 이어서 실패하면 같은 알림이 줄줄이 붙는다.
  if (items.some((item) => item.message === message)) return;
  const item = { id: nextId++, message, tone };
  items = [...items, item].slice(-MAX_ITEMS);
  emit();
  setTimeout(() => dismissToast(item.id), VISIBLE_MS);
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return <div className={styles.region} aria-live="polite">
    {list.map((item) => <div key={item.id} role={item.tone === "danger" ? "alert" : "status"} className={styles.toast} data-tone={item.tone}>
      <Icon name={item.tone === "danger" ? "warning-circle" : "info"} size={14} />
      <span className={styles.message}>{item.message}</span>
      <button type="button" className={styles.close} aria-label="알림 닫기" onClick={() => dismissToast(item.id)}><Icon name="x" size={12} /></button>
    </div>)}
  </div>;
}
