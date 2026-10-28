"use client";

import { useCareerEditorSession } from "../session/useCareerEditorSession";
import type { CareerEditorSnapshot } from "../session/CareerEditorSession";

const LABELS: Record<CareerEditorSnapshot["status"], string> = {
  loading: "불러오는 중",
  saving: "저장 중",
  saved: "저장됨",
  offline: "오프라인",
  conflict: "충돌 확인 필요",
  unavailable: "",
};

/** 본문 저장 상태입니다. 같은 기록의 세션은 하나라 연결을 더 만들지 않습니다. */
export function SaveState({ recordId, className }: { recordId: string; className?: string | undefined }) {
  const { snapshot } = useCareerEditorSession(recordId);
  return <span className={className} role="status" data-state={snapshot.status}>{LABELS[snapshot.status]}</span>;
}
