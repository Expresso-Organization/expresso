"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * 재료 화면의 「AI와 대화 시작」 제출 버튼.
 *
 * 체크 저장이 끝나기 전에 누르면 방금 뺀 기록으로 질문이 만들어지고, 만든 질문은 다시 만들지
 * 않는다. 그래서 저장 중(`saving`)과 제출 중(`pending`) 모두 잠근다.
 */
export function BeginInterviewButton({
  className,
  saving,
  children,
}: {
  className: string | undefined;
  saving: boolean;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={saving || pending} aria-busy={saving || pending}>
      {children}
    </button>
  );
}
