"use client";
import { useEffect, useState } from "react";
import { AgentReviewFreshnessResponseSchema } from "@expresso/contracts";

/**
 * 요건 대조 · 보완점 정리 뒤에 공고나 근거 기록이 바뀌었는지를 카드가 열릴 때 한 번 묻는다.
 * 대화 id가 아직 없거나 조회가 실패하면 바뀌지 않은 것으로 둔다 — 표시만 하는 정보다.
 */
export function useToolFreshness(conversationId: string | null, toolId: string) {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    void fetch(`/api/agent/conversations/${conversationId}/reviews/${toolId}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (response.ok) setStale(AgentReviewFreshnessResponseSchema.parse(await response.json()).data.stale); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversationId, toolId]);
  return stale;
}
