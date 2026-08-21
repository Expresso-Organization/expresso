import type { ReactNode } from "react";

import { AppBody } from "@/components/shell/AppShell";
import { Skel } from "@/components/shell/Skeleton";
import {
  WizardHeader,
  WizardStage,
  WizardSteps,
  type WizardStepKey,
} from "@/components/shell/WizardShell";

/**
 * 마법사가 기다릴 때의 뼈대 — `BrewFrame`과 같은 순서로 선다.
 *
 * 단계 줄은 진짜로 그린다. 여섯 칸의 이름은 고정이고(`WIZARD_STEPS`), 지금
 * 몇 번째인지는 주소를 아는 `loading.tsx`가 알려 준다. 포트폴리오 이름과 우측
 * 상황 문구만 응답에서 오므로 그 둘을 비운다.
 */
export function BrewSkeleton({
  step = null,
  tinted = false,
  children,
}: {
  step?: WizardStepKey | null;
  tinted?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <WizardHeader portfolioTitle={<Skel w={132} h={12} />} saveState={<Skel w={62} h={11} />} />
      <WizardSteps current={step} situation={<Skel w={84} h={11} />} />
      <AppBody>
        <WizardStage tinted={tinted}>{children}</WizardStage>
      </AppBody>
    </>
  );
}

/** 글이 앉을 줄 몇 개 — 길이를 조금씩 달리해 문단처럼 보이게 한다. */
export function SkelLines({ count, from = 96 }: { count: number; from?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Skel
          key={index}
          w={`${from - (index % 3) * 14}%`}
          h={12}
          style={{ marginBottom: 9 }}
        />
      ))}
    </>
  );
}
