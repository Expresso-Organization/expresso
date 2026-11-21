"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { RouteNotFound } from "@/components/shell/RouteFallbacks";

import { resumeBrewAction } from "./resume-actions";

/** 화면이 뜨면 한 번 제작을 대화로 잇고 그 대화로 옮긴다. 개발 모드의 두 번 마운트에도 한 번만 부른다. */
export function ResumeBrew({ brewId, again }: { brewId: string; again: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [failure, setFailure] = useState<"missing" | string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void resumeBrewAction(brewId, again).then((result) => {
      if ("conversationId" in result) router.replace(`/home?chat=${result.conversationId}` as Route);
      else setFailure("missing" in result ? "missing" : result.error);
    });
  }, [brewId, again, router]);
  if (failure === "missing") return <RouteNotFound title="그 작업을 찾을 수 없습니다" body="지워졌거나 주소가 잘못됐습니다. 새 포트폴리오를 시작할 수 있습니다." backHref="/home?new=portfolio" backLabel="새로 시작" />;
  if (failure) return <RouteNotFound title="포트폴리오 제작을 열지 못했습니다" body={failure} backHref="/library" backLabel="라이브러리로" />;
  return <div role="status" aria-label="포트폴리오 제작을 여는 중" />;
}
