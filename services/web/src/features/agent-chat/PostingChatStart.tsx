"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { AGENT_CHAT_OPEN, putAgentHandoff } from "./agent-handoff";

/** 공고로 포트폴리오를 시작하는 말. 에이전트는 대화에 붙은 공고로 제작을 시작한다. */
const START_TEXT = "이 공고로 포트폴리오를 만들어 줘.";

/**
 * 「이 공고로 만들기」. 그 공고를 붙인 새 대화로 넘어가 시작하는 말을 보낸다 — 홈의 입력창과 같은 넘기기(`agent-handoff`)다.
 * 보낼 수 없으면(동의 · 크레딧) 대화 화면이 말을 입력창에 둔다.
 */
export function PostingChatStart({ jobPostingId, className, label, children }: { jobPostingId: string; className?: string | undefined; label?: string | undefined; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => {
        putAgentHandoff({ text: START_TEXT, contexts: [{ kind: "job", id: jobPostingId }] });
        startTransition(() => router.push("/home?compose=1", { transitionTypes: [AGENT_CHAT_OPEN] }));
      }}
    >
      {children}
    </button>
  );
}
