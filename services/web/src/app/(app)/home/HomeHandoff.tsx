"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useTransition, type ReactNode } from "react";

import { AGENT_CHAT_OPEN, putAgentHandoff, type AgentHandoff } from "@/features/agent-chat/agent-handoff";

type HomeHandoff = {
  /** 말을 넘기고 대화 화면으로 간다. 이동 중에는 다시 부르지 않는다. */
  open: (handoff: AgentHandoff) => void;
  /** 대화 화면으로 가는 중. 서버 응답을 기다리는 동안 참이다. */
  pending: boolean;
};

const Context = createContext<HomeHandoff | null>(null);

/**
 * 홈에서 대화를 시작하는 모든 자리(입력창 · 제안 카드)가 같은 이동을 쓰게 한다.
 * 이동에 `AGENT_CHAT_OPEN` 타입을 달아 홈 → 대화 전환이 이 이동에서만 돌게 하고,
 * 이동을 직접 transition으로 감싸 서버를 기다리는 동안(`pending`) 홈이 바로 반응하게 한다.
 */
export function HomeHandoffProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const open = useCallback(
    (handoff: AgentHandoff) => {
      if (pending) return;
      putAgentHandoff(handoff);
      startTransition(() => router.push("/home?compose=1" as Route, { transitionTypes: [AGENT_CHAT_OPEN] }));
    },
    [pending, router],
  );
  const value = useMemo(() => ({ open, pending }), [open, pending]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useHomeHandoff(): HomeHandoff {
  const value = useContext(Context);
  if (!value) throw new Error("useHomeHandoff는 HomeHandoffProvider 안에서만 쓴다");
  return value;
}
