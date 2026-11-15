import { Suspense } from "react";

import { AppBody } from "@/components/shell/AppShell";
import { AgentChat } from "@/features/agent-chat/AgentChat";
import { requireSession } from "@/lib/require-session";

import { HomeHeader } from "./HomeChrome";
import { HomeStart } from "./HomeStart";
import { ContestsWidget, InternsWidget, JobsWidget, Proposals, ProposalsSkeleton, WidgetSkeleton, Widgets } from "./HomeWidgets";

/**
 * 홈.
 *
 * 대화를 시작하기 전에는 위에서 아래로 로고, 입력창, 추천 프롬프트, 행동 제안, 새 소식 위젯이 보인다.
 * 말을 보내면(`?compose=1`) 같은 주소에서 대화 화면으로 바뀌고, 주소에 대화가 적혀 있으면
 * (`?chat=`) 그 대화가 열린다.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, session] = await Promise.all([searchParams, requireSession()]);
  const inConversation = typeof params.chat === "string" || params.compose === "1";

  return (
    <>
      <HomeHeader />
      <AppBody>
        {inConversation ? (
          <AgentChat standalone fresh newHref="/home" />
        ) : (
          <HomeStart
            proposals={
              <Suspense fallback={<ProposalsSkeleton />}>
                <Proposals
                  accessToken={session.accessToken}
                  recordTotal={session.categories.reduce((sum, category) => sum + category.recordCount, 0)}
                />
              </Suspense>
            }
            widgets={
              <Widgets>
                <Suspense fallback={<WidgetSkeleton />}><JobsWidget accessToken={session.accessToken} /></Suspense>
                <Suspense fallback={<WidgetSkeleton />}><ContestsWidget /></Suspense>
                <Suspense fallback={<WidgetSkeleton />}><InternsWidget accessToken={session.accessToken} /></Suspense>
              </Widgets>
            }
          />
        )}
      </AppBody>
    </>
  );
}
