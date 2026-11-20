"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import type { AgentBrewDesign } from "@expresso/contracts";
import { ensureRecipeAction } from "@/app/(app)/brew/[brewId]/design/design-actions";
import { REFRESH_MS } from "@/app/(app)/brew/[brewId]/use-refresh-while";
import { Icon } from "@/components/ui/Icon";
import { DesignViewContext, Failure, MakeButton, Proposals, Revision, Screens, Stage, useDesignView } from "@/features/design-chat/DesignChat";
import designStyles from "@/features/design-chat/DesignChat.module.css";
import { workingLabel } from "@/features/design-chat/thread";
import { useDesignChat } from "@/features/design-chat/useDesignChat";
import { BrewDesignCardResponseSchema, type BrewDesignCardData } from "@/lib/brew-design-card";
import chatStyles from "./AgentChat.module.css";
import card from "./RecordDraftCard.module.css";
import styles from "./BrewDesignCard.module.css";

async function readContext(brewId: string): Promise<BrewDesignCardData> {
  const response = await fetch(`/api/brews/${brewId}/design-card`, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? "디자인을 불러오지 못했습니다.");
  return BrewDesignCardResponseSchema.parse(payload).data;
}

/**
 * 대화의 「디자인」 카드.
 *
 * 디자인 대화(`design_chats`)의 답 하나를 그린다 — 디자이너의 말과 견본 · 첫 화면 · 고친 결과. 부품과 그 상태는 디자인 화면과
 * 같은 것을 쓴다(`useDesignView`). 「첫 화면 보기」만 이 대화의 경로(`onDraw`)로 보내 그 첫 화면의 카드가 대화에 붙게 한다.
 *
 * 여는 카드(`designMessageId`가 null)는 구성이 생길 때까지 기다렸다가 디자인 대화를 열고 그 첫 답을 그린다. 구성이 실패하면
 * 사유와 「다시 맡기기」를 둔다. 넓게 보기는 대화가 좁은 자리에 있어 화면 전체를 덮는 무대로 연다.
 */
export function BrewDesignCard({ design: { brewId, designMessageId }, onDraw }: { design: AgentBrewDesign; onDraw(styleId: string, layoutId: string): Promise<void> }) {
  const [context, setContext] = useState<BrewDesignCardData | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const opening = designMessageId === null;
  const ready = !!context?.recipeId;
  const waiting = !context || (!ready && !context.recipeFailure);

  useEffect(() => {
    let alive = true;
    const read = () => readContext(brewId)
      .then((next) => { if (alive) { setContext(next); setIssue(null); } })
      .catch((error: unknown) => { if (alive) setIssue(error instanceof Error ? error.message : "디자인을 불러오지 못했습니다."); });
    void read();
    // 구성이 생길 때까지 디자인 화면과 같은 주기로 다시 읽는다.
    if (!waiting) return () => { alive = false; };
    const timer = window.setInterval(() => void read(), REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [brewId, waiting]);

  const state = useDesignChat(brewId, { autoOpen: opening && ready });
  const { view } = useDesignView({
    brewId, recipeId: context?.recipeId ?? null, generationAllowed: context?.generationAllowed ?? false, catalog: [], state,
    draw: (styleId, layoutId) => { setIssue(null); void onDraw(styleId, layoutId).catch((error: unknown) => setIssue(error instanceof Error ? error.message : "첫 화면을 그리지 못했습니다.")); },
  });
  useEffect(() => {
    if (view.layout !== "stage") return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") view.collapse(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const chat = state.chat;
  const message = chat?.messages.find((item) => item.id === (designMessageId ?? chat.messages.find((first) => first.role === "assistant")?.id));
  const assistant = message?.role === "assistant" ? message : null;
  const shown = assistant ? view.cards[assistant.id] : undefined;
  const last = !!assistant && !state.running && chat?.messages.at(-1)?.id === assistant.id;
  const working = assistant?.status === "running" && chat?.messages.at(-1)?.id === assistant.id ? workingLabel(chat) : null;
  // 고른 첫 화면이 이 카드에 있으면 그 아래에서 만든다.
  const here = shown?.kind === "screens" ? shown.items.map((item) => item.snippetId) : shown?.kind === "revision" ? [shown.item.snippetId, shown.fromSnippetId] : [];
  const making = !!chat?.selectedSnippetId && here.includes(chat.selectedSnippetId);

  const retryRecipe = async () => {
    setRetrying(true);
    const result = await ensureRecipeAction(brewId);
    setRetrying(false);
    if (result.error) setIssue(result.error);
    else setContext((current) => (current ? { ...current, recipeBuilding: true, recipeFailure: null } : current));
  };

  return <section className={`${card.card} ${styles.card}`} aria-label="디자인">
    <header className={card.head}><Icon name="palette" size={15} /><span>디자인</span>{working ? <span className={chatStyles.working}>{working}</span> : null}</header>
    {opening && context && !ready ? (context.recipeFailure ? <p role="alert" className={card.error}>{context.recipeFailure}</p> : <p className={styles.wait}><span className={chatStyles.working}>구성을 만드는 중</span></p>) : null}
    {opening && context?.recipeFailure && !ready ? <div className={card.actions}><button type="button" className={styles.action} disabled={retrying} onClick={() => void retryRecipe()}>다시 맡기기</button></div> : null}
    {assistant?.text ? <p className={styles.say}>{assistant.text}</p> : null}
    <DesignViewContext.Provider value={view}>
      {shown ? <div className={designStyles.cards} data-cards="">
        {shown.kind === "proposals" ? <Proposals styles={shown.styles} layouts={shown.layouts} footer={assistant!.id === view.lastProposals} />
          : shown.kind === "screens" ? <Screens items={shown.items} retryable={last} />
          : shown.kind === "revision" ? <Revision card={shown} retryable={last} />
          : <Failure text={shown.error} retryable={last} />}
      </div> : null}
      {making && !context?.generating ? <div className={styles.make}><MakeButton /></div> : null}
      {view.layout === "stage" ? createPortal(<div className={`acf-scope ${designStyles.overlay}`}><div className={designStyles.screen} data-layout="stage"><Stage /></div></div>, document.body) : null}
    </DesignViewContext.Provider>
    {context?.generating && making ? <div className={card.actions}><Link className={styles.action} href={`/brew/${brewId}/design` as Route}>생성 화면 보기</Link></div> : null}
    {issue || (state.issue && !working) ? <p role="alert" className={card.error}>{issue ?? state.issue}</p> : null}
  </section>;
}
