import { Suspense } from "react";

import { ViewTransition } from "@/components/motion/ViewTransition";
import { AppBody } from "@/components/shell/AppShell";
import { AGENT_CHAT_OPEN } from "@/features/agent-chat/agent-handoff";
import { AgentChat } from "@/features/agent-chat/AgentChat";
import { requireSession } from "@/lib/require-session";

import { HomeHeader } from "./HomeChrome";
import { HomeStart } from "./HomeStart";
import { Checkins, ContestsWidget, InternsWidget, JobsWidget, Proposals, ProposalsSkeleton, WidgetSkeleton, Widgets } from "./HomeWidgets";

/**
 * 홈.
 *
 * 대화를 시작하기 전에는 위에서 아래로 로고, 입력창, 추천 프롬프트, 확인 카드, 새 소식 위젯, 제안 카드가 보인다.
 * 말을 보내면(`?compose=1`) 같은 주소에서 대화 화면으로 바뀌고, 주소에 대화가 적혀 있으면
 * (`?chat=`) 그 대화가 열린다.
 *
 * 말을 보내 대화를 시작하는 이동(`AGENT_CHAT_OPEN`)에서만 홈이 빠지고 대화 화면이 들어온다. 두 입력창은
 * 같은 이름이라 홈의 입력창이 대화 화면 아래 자리로 옮겨 간다. 다른 이동(지난 대화 열기 · 뒤로 가기)은 바로 바뀐다.
 * 감싸기는 레이아웃이 아니라 여기 둔다 — 레이아웃은 이동 사이에 남아 있어 들어오고 나가는 일이 없다.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, session] = await Promise.all([searchParams, requireSession()]);
  const chat = typeof params.chat === "string" ? params.chat : null;
  const inConversation = chat !== null || params.compose === "1";

  return (
    <>
      <HomeHeader />
      <AppBody>
        {inConversation ? (
          // 대화는 마운트할 때 주소에서 한 번 읽는다. 사이드바에서 다른 대화를 고르면 새로 세워야 그 대화가 열린다.
          // 두 감싸기는 같은 자리에 서므로 key로 갈라야 React가 바뀜(update)이 아니라 나감 · 들어옴으로 본다.
          <ViewTransition key="chat" enter={{ [AGENT_CHAT_OPEN]: "chat-arrive", default: "none" }} default="none">
            <AgentChat key={chat ?? "compose"} standalone fresh newHref="/home" />
          </ViewTransition>
        ) : (
          <ViewTransition key="home" exit={{ [AGENT_CHAT_OPEN]: "home-leave", default: "none" }} default="none">
          <HomeStart
            checkins={<Suspense fallback={null}><Checkins accessToken={session.accessToken} /></Suspense>}
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
                <Suspense fallback={<WidgetSkeleton />}><ContestsWidget accessToken={session.accessToken} /></Suspense>
                <Suspense fallback={<WidgetSkeleton />}><InternsWidget accessToken={session.accessToken} /></Suspense>
              </Widgets>
            }
          />
          </ViewTransition>
        )}
      </AppBody>
    </>
  );
}
