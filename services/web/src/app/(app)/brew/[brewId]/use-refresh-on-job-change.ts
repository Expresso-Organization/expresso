"use client";

import { BrewJobStatusSchema, type BrewJobStatus } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useRefreshWhile } from "./use-refresh-while";

/**
 * 잡 상태가 바뀌는 순간 화면을 다시 읽는다.
 *
 * 서버가 그린 상태(`job`)와 다른 상태 · 단계가 SSE로 오면 `router.refresh()`를 부른다. 1.5초마다 다시
 * 읽던 때는 끝난 뒤 평균 0.75초를 그냥 기다렸다. 흐름이 오류로 끊기거나 `EventSource`가 없으면
 * 지금처럼 1.5초마다 다시 읽는다(`useRefreshWhile`).
 *
 * `job`이 null이면 듣지 않는다 — 기다릴 잡이 없을 때다.
 */
export function useRefreshOnJobChange(job: BrewJobStatus | null): void {
  const router = useRouter();
  const [broken, setBroken] = useState<string | null>(null);
  const jobId = job?.jobId ?? null;
  const status = job?.status ?? null;
  const stage = job?.stage ?? null;
  const listening = jobId !== null && typeof EventSource !== "undefined" && broken !== jobId;

  useEffect(() => {
    if (!listening || jobId === null) return;
    const source = new EventSource(`/api/brew-jobs/${encodeURIComponent(jobId)}/events`);
    source.addEventListener("status", (event) => {
      const parsed = BrewJobStatusSchema.safeParse((JSON.parse((event as MessageEvent<string>).data) as { data?: unknown }).data);
      if (!parsed.success) return;
      if (parsed.data.status === status && parsed.data.stage === stage) return;
      // 다시 그리면 새 상태로 이 효과가 다시 돈다. 지금 흐름은 닫는다.
      source.close();
      router.refresh();
    });
    source.onerror = () => {
      source.close();
      setBroken(jobId);
    };
    return () => source.close();
  }, [listening, jobId, status, stage, router]);

  useRefreshWhile(jobId !== null && !listening);
}
