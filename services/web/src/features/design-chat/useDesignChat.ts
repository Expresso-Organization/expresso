"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DesignChatResponseSchema, DesignChatStateResponseSchema, type DesignChat, type SendDesignMessage } from "@expresso/contracts";

import { REFRESH_MS } from "@/app/(app)/brew/[brewId]/use-refresh-while";

/** 견본 · 말 · 카탈로그로 보내는 것. 요청 ID는 훅이 붙인다. */
export type DesignChatInput = SendDesignMessage extends infer Input ? (Input extends unknown ? Omit<Input, "requestId"> : never) : never;

export interface DesignChatState {
  chat: DesignChat | null;
  /** 답을 만드는 중이다. 그동안에는 새로 보낼 수 없다. */
  running: boolean;
  /** 요청을 보내고 응답을 기다리는 짧은 동안. */
  pending: boolean;
  issue: string | null;
  /** 자료를 AI에 보내는 데 동의가 필요하다. 동의한 뒤 `reopen`을 부른다. */
  consentRequired: boolean;
  send(input: DesignChatInput): Promise<boolean>;
  retry(): Promise<void>;
  select(snippetId: string | null): Promise<void>;
  reopen(): void;
}

class ConsentRequired extends Error {}

async function call(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, { ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string; details?: { requiredConsent?: string } } } | null;
  if (!response.ok && payload?.error?.details?.requiredConsent === "career_records") throw new ConsentRequired();
  if (!response.ok) throw new Error(payload?.error?.message ?? "대화를 불러오지 못했습니다.");
  return payload;
}

/**
 * 디자인 대화의 상태.
 *
 * 화면이 뜨면 대화를 읽고, 아직 없으면 연다 — 여는 요청은 서버가 한 번만 받아들이므로 화면이 다시 떠도 대화는 하나다.
 * 답은 서버가 뒤에서 만든다. 만드는 동안 1.5초마다(제작 흐름의 다른 화면과 같은 주기) 지금 가진 판을 `since`로 보내
 * 바뀐 것이 있을 때만 대화를 다시 받는다.
 */
export function useDesignChat(brewId: string): DesignChatState {
  const base = `/api/brews/${brewId}/design-chat`;
  const [chat, setChat] = useState<DesignChat | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /** 늦게 온 옛 판이 새 판을 덮지 않게 한다. */
  const accept = useCallback((next: DesignChat) => {
    if (alive.current) setChat((old) => (old && old.version > next.version ? old : next));
  }, []);
  const fail = useCallback((error: unknown) => {
    if (!alive.current) return;
    if (error instanceof ConsentRequired) setConsentRequired(true);
    else setIssue(error instanceof Error ? error.message : "연결 오류");
  }, []);

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const state = DesignChatStateResponseSchema.parse(await call(base)).data;
        const opened = state.chat ?? DesignChatResponseSchema.parse(await call(`${base}/open`, { requestId: crypto.randomUUID() })).data;
        if (current) accept(opened);
      } catch (error) {
        if (current) fail(error);
      }
    })();
    return () => { current = false; };
  }, [base, attempt, accept, fail]);

  const running = chat?.run?.status === "running";
  const version = chat?.version;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      void call(`${base}?since=${version}`)
        .then((payload) => {
          const state = DesignChatStateResponseSchema.parse(payload).data;
          if (state.chat) accept(state.chat);
        })
        .catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [base, running, version, accept]);

  const post = useCallback(async (path: string, body: unknown): Promise<boolean> => {
    setPending(true);
    setIssue(null);
    try {
      accept(DesignChatResponseSchema.parse(await call(`${base}/${path}`, body)).data);
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      if (alive.current) setPending(false);
    }
  }, [base, accept, fail]);

  return {
    chat,
    running,
    pending,
    issue,
    consentRequired,
    send: (input) => post("messages", { ...input, requestId: crypto.randomUUID() }),
    retry: async () => { await post("retry", { requestId: crypto.randomUUID() }); },
    select: async (snippetId) => { await post("selection", { snippetId }); },
    reopen: () => { setConsentRequired(false); setIssue(null); setAttempt((count) => count + 1); },
  };
}
