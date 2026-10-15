import type { ReactNode } from "react";

import { AppBody } from "@/components/shell/AppShell";
import {
  WizardHeader,
  WizardStage,
  WizardSteps,
  type WizardStepKey,
} from "@/components/shell/WizardShell";

/**
 * 01–03 공통 뼈대 — 마법사 머리말과 무대.
 *
 * 앱 셸과 사이드바는 `brew/[brewId]/layout.tsx`가 그린다. 여기 있던 시절에는
 * 화면과 이 컴포넌트가 각각 `requireSession()`을 불러 한 번 그릴 때 백엔드에
 * 여섯 번 나갔다.
 *
 * 머리말은 레이아웃으로 올리지 않는다 — `situation`은 같은 화면 안에서도
 * 상태에 따라 "아직 없음" · "추출" · "섹션 4개 · v2"로 갈리므로 화면만 안다.
 */
export function BrewFrame({
  brewId,
  step,
  situation,
  portfolioTitle,
  tinted = false,
  children,
}: {
  brewId: string;
  step: WizardStepKey;
  situation: string;
  /** 머리말에 그리는 이름. 아직 정해지지 않았으면 공고 제목이 대신 선다. */
  portfolioTitle?: string | null;
  tinted?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <WizardHeader portfolioTitle={portfolioTitle ?? "새 포트폴리오"} />
      <WizardSteps brewId={brewId} current={step} situation={situation} />
      <AppBody>
        <WizardStage tinted={tinted}>{children}</WizardStage>
      </AppBody>
    </>
  );
}
