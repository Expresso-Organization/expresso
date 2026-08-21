import type { ReactNode } from "react";

import { AppBody } from "@/components/shell/AppShell";
import { Skel, SkelAnnounce } from "@/components/shell/Skeleton";
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
 *
 * 무대 안은 감싸지 않는다 — 단계마다 `.body`가 곧 flex 사슬의 시작이라
 * 껍데기를 하나 끼우면 높이가 무너진다. 알림 한 줄만 놓고 나머지는 화면이
 * 자기 `page.module.css`로 짠다.
 */
export function BrewSkeleton({
  step = null,
  tinted = false,
  label,
  children,
}: {
  step?: WizardStepKey | null;
  tinted?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <WizardHeader portfolioTitle={<Skel w={132} h={12} />} saveState={<Skel w={62} h={11} />} />
      <WizardSteps current={step} situation={<Skel w={84} h={11} />} />
      <AppBody>
        <WizardStage tinted={tinted}>
          <SkelAnnounce label={label} />
          {children}
        </WizardStage>
      </AppBody>
    </>
  );
}
