import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";
import {
  WizardHeader,
  WizardStage,
  WizardSteps,
  type WizardStepKey,
} from "@/components/shell/WizardShell";
import { requireSession } from "@/lib/require-session";

/** 01–03 공통 뼈대. 사이드바는 "새 포트폴리오"가 활성이다. */
export async function BrewFrame({
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
  const session = await requireSession();

  return (
    <AppShell
      sidebar={
        <Sidebar
          active="new-portfolio"
          categories={session.categories}
          displayName={session.user.displayName}
          quotaUsed={session.quota.used}
          quotaLimit={session.quota.limit}
        />
      }
      header={
        <>
          <WizardHeader portfolioTitle={portfolioTitle ?? "새 포트폴리오"} />
          <WizardSteps brewId={brewId} current={step} situation={situation} />
        </>
      }
    >
      <WizardStage tinted={tinted}>{children}</WizardStage>
    </AppShell>
  );
}
