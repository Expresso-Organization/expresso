"use client";
import Link from "next/link";
import type { Route } from "next";
import type { AgentBrewDesign } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { DesignViewContext, Failure, MakeButton, Proposals, Revision, Screens } from "@/features/design-chat/DesignChat";
import designStyles from "@/features/design-chat/DesignChat.module.css";
import { workingLabel } from "@/features/design-chat/thread";
import chatStyles from "./AgentChat.module.css";
import rows from "./BrewMaterialsCard.module.css";
import card from "./RecordDraftCard.module.css";
import styles from "./BrewDesignCard.module.css";
import { useDesignBrew } from "./design-brews";

/**
 * 대화의 「디자인」 카드.
 *
 * 디자인 대화(`design_chats`)의 답 하나를 그린다 — 디자이너의 말과 견본 · 첫 화면 · 고친 결과. 상태는 제작마다 하나를 여러 카드가
 * 함께 읽는다(`DesignBrews`) — 한 카드에서 고른 것이 다른 카드에도 보이고, 앞선 견본의 레이아웃을 새 견본의 스타일과 짝지을 수 있다.
 * 부품은 디자인 화면과 같은 것을 쓴다. 「첫 화면 보기」는 이 대화의 경로로 보내 그 첫 화면의 카드가 대화에 붙게 한다.
 *
 * 여는 카드(`designMessageId`가 null)는 구성이 생길 때까지 기다렸다가 디자인 대화의 첫 답을 그린다. 구성이 실패하면 사유와
 * 「다시 맡기기」를 둔다. 테두리 상자를 두지 않는다 — 견본과 첫 화면이 저마다 틀을 가져, 상자를 씌우면 카드 안에 카드가 된다.
 * 제목은 작업 흔적 줄(「디자인」)이 맡는다.
 *
 * 편집의 「다시 뽑기」로 연 카드(`again`)는 이미 만든 포트폴리오가 있어도 그 자리에 「만든 포트폴리오 열기」 대신 만들기를 둔다.
 */
export function BrewDesignCard({ design: { brewId, designMessageId, again } }: { design: AgentBrewDesign }) {
  const brew = useDesignBrew(brewId);
  if (!brew) return <section className={`${styles.card} ${designStyles.compact}`} aria-label="디자인" />;
  const { state, view, context, retrying } = brew;
  const opening = designMessageId === null;
  const ready = !!context?.recipeId;
  const chat = state.chat;
  const message = chat?.messages.find((item) => item.id === (designMessageId ?? chat.messages.find((first) => first.role === "assistant")?.id));
  const assistant = message?.role === "assistant" ? message : null;
  const shown = assistant ? view.cards[assistant.id] : undefined;
  const last = !!assistant && !state.running && chat?.messages.at(-1)?.id === assistant.id;
  const working = assistant?.status === "running" && chat?.messages.at(-1)?.id === assistant.id ? workingLabel(chat) : null;
  // 고른 첫 화면을 그린 카드에서만 만든다. 고친 결과의 카드는 고친 것만 친다 — 이전 것은 그것을 그린 카드에 있어, 같이 치면 만들기가 두 곳에 뜬다.
  const here = shown?.kind === "screens" ? shown.items.map((item) => item.snippetId) : shown?.kind === "revision" ? [shown.item.snippetId] : [];
  const making = !!chat?.selectedSnippetId && here.includes(chat.selectedSnippetId);

  return <section className={`${styles.card} ${designStyles.compact}`} aria-label="디자인">
    {working ? <p className={styles.wait}><span className={chatStyles.working}>{working}</span></p> : null}
    {opening && context && !ready ? (context.recipeFailure ? <p role="alert" className={card.error}>{context.recipeFailure}</p> : <p className={styles.wait}><span className={chatStyles.working}>구성을 만드는 중</span></p>) : null}
    {opening && context?.recipeFailure && !ready ? <div className={card.actions}><button type="button" className={styles.action} disabled={retrying} onClick={brew.retryRecipe}>다시 맡기기</button></div> : null}
    {opening && state.consentRequired ? <p role="alert" className={card.error}>AI 사용에 동의해야 디자인을 이어 갈 수 있습니다. <button type="button" className={styles.action} onClick={brew.askConsent}>동의 안내 보기</button></p> : null}
    {assistant?.text ? <p className={styles.say}>{assistant.text}</p> : null}
    <DesignViewContext.Provider value={view}>
      {shown ? <div className={designStyles.cards} data-cards="">
        {shown.kind === "proposals" ? <Proposals styles={shown.styles} layouts={shown.layouts} footer={assistant!.id === view.lastProposals} />
          : shown.kind === "screens" ? <Screens items={shown.items} retryable={last} />
          : shown.kind === "revision" ? <Revision card={shown} retryable={last} />
          : <Failure text={shown.error} retryable={last} />}
      </div> : null}
      {/* 이미 만든 포트폴리오는 다시 만들지 않고 연다(다시 뽑기는 빼고). 만드는 일은 이번 달 횟수를 쓴다. */}
      {making && context?.portfolioId && !again ? <div className={styles.make}><Link className={styles.action} href={`/edit/${context.portfolioId}` as Route}>만든 포트폴리오 열기</Link></div>
        // 만드는 중이면 대화 아래의 「생성」 카드가 진행을 보인다.
        : making && (context?.generating || brew.generation?.generation?.status === "queued" || brew.generation?.generation?.status === "running") ? null
        : making ? <div className={styles.make}><MakeButton /></div> : null}
    </DesignViewContext.Provider>
    {/* 카탈로그에서 고르기와 구조화 생성은 카탈로그 화면에 있다. */}
    {opening && shown?.kind === "proposals" ? <Link className={rows.wide} href={`/brew/${brewId}/design?view=catalog` as Route}><Icon name="squares-four" size={12} />카탈로그 화면으로</Link> : null}
  </section>;
}
