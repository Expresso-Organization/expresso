"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./WizardShell.module.css";

/**
 * 머리말의 저장 자리.
 *
 * 머리말은 서버가 그리고, 저장은 화면 안의 client 컴포넌트가 한다. 둘을 잇는
 * 것이 이 컨텍스트다 — 화면이 상태를 올리면 머리말이 그것을 보인다. 올리는
 * 화면이 없으면(레거시 마법사) 머리말은 지금까지처럼 "자동 저장됨"을 보인다.
 */
export type SaveState = "idle" | "saving" | "saved" | "failed";

const SaveStateContext = createContext<{ state: SaveState; set: (state: SaveState) => void } | null>(null);

export function SaveStateProvider({ children }: { children: ReactNode }) {
  const [state, set] = useState<SaveState>("idle");
  const value = useMemo(() => ({ state, set }), [state]);
  return <SaveStateContext.Provider value={value}>{children}</SaveStateContext.Provider>;
}

/** 저장하는 화면이 부른다. 제공자 밖에서는 아무 일도 하지 않는다. */
export function useSaveState(): (state: SaveState) => void {
  const context = useContext(SaveStateContext);
  return context?.set ?? (() => {});
}

const LABEL: Record<SaveState, { icon: string; text: string }> = {
  idle: { icon: "cloud-check", text: "자동 저장됨" },
  saving: { icon: "cloud-arrow-up", text: "저장 중" },
  saved: { icon: "cloud-check", text: "저장됨" },
  failed: { icon: "cloud-slash", text: "저장 실패" },
};

export function SaveStateIndicator() {
  const context = useContext(SaveStateContext);
  const state = context?.state ?? "idle";
  const { icon, text } = LABEL[state];
  return (
    <span className={styles.saveState} data-state={state} role="status" aria-live="polite">
      <Icon name={icon} size={14} />
      {text}
    </span>
  );
}
