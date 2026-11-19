"use client";

import { createContext, useActionState, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PropsWithChildren } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { AssistantRuntimeProvider, useAuiState, useExternalStoreRuntime, type ThreadMessageLike, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { DESIGN_LAYOUT_GRID, pageDocument, pagePreviewDocument, type DesignCard, type DesignLayout, type DesignLayoutSpec, type DesignScreenItem, type DesignSnippet, type DesignStyle, type DesignTokens } from "@expresso/contracts";

import { startGenerationAction, type BrewState } from "@/app/(app)/brew/[brewId]/design/design-actions";
import { DesignThumb, type DesignCatalogEntry } from "@/app/(app)/brew/[brewId]/design/DesignCatalog";
import { LogoMark } from "@/components/brand/Logo";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import chatStyles from "@/features/agent-chat/AgentChat.module.css";
import { AgentConsentDialog } from "@/features/agent-chat/AgentConsentDialog";
import "@/styles/agent-chat-framework.css";

import styles from "./DesignChat.module.css";
import { threadOf, workingLabel, type ThreadCard } from "./thread";
import { useDesignChat, type DesignChatState } from "./useDesignChat";

/**
 * 디자인을 정하는 대화.
 *
 * 스레드는 제품의 에이전트 채팅과 같은 부품(`Thread`)과 같은 말풍선 스타일을 쓴다. 에이전트의 답에 붙는 카드가 이 화면의
 * 본문이다 — 견본과, 이 사람의 자료로 그린 첫 화면.
 *
 * 견본은 스타일(색 · 서체 · 분위기)과 레이아웃(구성)을 따로 놓는다. 사용자는 각각에서 하나씩 고르고, 그 짝으로 첫 화면을 그린다.
 * 대화에 뜬 카드는 누르면 대화가 이어진다 — 견본은 에이전트의 질문에 대한 답이고, 첫 화면은 다음 말의 대상이 된다(「말로 고치기」).
 * 배치는 흐름이 기본이고, 대화 안의 큰 첫 화면을 누르면 무대로 넓어진다.
 */
export interface CatalogItem { revisionId: string; code: string; name: string; reason: string; preview: DesignCatalogEntry["preview"] }
export interface DesignChatNotice { tone: "info" | "error"; text: string }

type Layout = "stream" | "stage";
interface Picked { style: string | null; layout: string | null }
/** 다음 말이 가리킬 대상. 첫 화면이면 그것을 고치는 말이 되고, 카탈로그의 디자인이면 그 디자인으로 그린다. */
type Subject = { kind: "snippet"; id: string } | { kind: "catalog"; item: CatalogItem };

const ORIGIN_LABEL: Record<DesignSnippet["origin"], string> = { agent: "제안", user: "말씀하신 스타일", catalog: "카탈로그", edit: "고친 것" };
const FONT_LABEL = { sans: "고딕", serif: "명조", mono: "고정폭" } as const;
const FONT_STACK = {
  sans: '"Pretendard Variable", Pretendard, sans-serif',
  serif: '"Nanum Myeongjo", serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;
/** 첫 화면 한 장의 원래 크기. 이 폭에서 그려 두고 카드 폭에 맞춰 줄인다. 그리는 호출도 화면 하나를 이 크기로 잡는다. */
const FRAME = { width: 1440, height: 900 };
/** 넓어지는 첫 화면과 무대의 첫 화면이 한 물건으로 이어지게 하는 이름. 한 번에 한 틀에만 붙인다. */
const MORPH = "design-chat-focus";

interface View {
  brewId: string;
  recipeId: string | null;
  generationAllowed: boolean;
  catalog: CatalogItem[];
  state: DesignChatState;
  /** 동의 안내를 닫아 둔 상태에서 다시 여는 함수. 동의가 필요 없거나 안내가 떠 있으면 null이다. */
  askConsent: (() => void) | null;
  cards: Record<string, ThreadCard>;
  users: ReturnType<typeof threadOf>["users"];
  snippet(id: string | null): DesignSnippet | undefined;
  styleOf(id: string | null): DesignStyle | undefined;
  layoutOf(id: string | null): DesignLayout | undefined;
  /** 견본에서 고른 스타일과 레이아웃. 따로 고르고, 둘이 모이면 첫 화면을 그릴 수 있다. */
  picked: Picked;
  pick(kind: keyof Picked, id: string): void;
  /** 가장 나중에 뜬 견본 카드. 고른 짝과 「첫 화면 보기」는 이 카드 아래에만 둔다. */
  lastProposals: string | null;
  /** 답을 만드는 중이거나 요청을 보내는 중이다. 그동안 카드는 눌리지 않는다. */
  busy: boolean;
  layout: Layout;
  /** 무대에 올린 첫 화면. */
  focus: string | null;
  show(snippetId: string, from?: HTMLElement): void;
  expand(snippetId: string, from: HTMLElement): void;
  collapse(): void;
  subject: Subject | null;
  setSubject(subject: Subject | null): void;
  openCatalog(): void;
}
const ViewContext = createContext<View | null>(null);
const useView = () => useContext(ViewContext)!;

export function DesignChat({ brewId, recipeId, catalog, generationAllowed, notice }: {
  brewId: string;
  recipeId: string | null;
  catalog: CatalogItem[];
  generationAllowed: boolean;
  notice: DesignChatNotice | null;
}) {
  const state = useDesignChat(brewId);
  const { chat } = state;
  const thread = useMemo(() => threadOf(chat), [chat]);
  const [layout, setLayout] = useState<Layout>("stream");
  const [focus, setFocus] = useState<string | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [picked, setPicked] = useState<Picked>({ style: null, layout: null });
  const [sheet, setSheet] = useState(false);
  /** 동의 안내를 닫았는가. 닫아도 동의는 여전히 필요하므로 입력창 위에 다시 여는 자리를 둔다. */
  const [consentClosed, setConsentClosed] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  /** 마지막으로 누른 카드 묶음. 배치가 바뀌면 대화 폭이 달라져 글이 다시 흐르므로, 바뀐 뒤 이 묶음을 다시 보이게 한다. */
  const anchor = useRef<HTMLElement | null>(null);
  const busy = state.running || state.pending;

  // 무대가 열린 동안 새 첫 화면이 그려지면 그것을 무대에 올린다.
  const newest = chat?.snippets.at(-1)?.id ?? null;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (newest && seen.current !== null && seen.current !== newest && layout === "stage") setFocus(newest);
    seen.current = newest;
  }, [newest, layout]);

  // 답이 붙거나 첫 화면이 놓이면 대화가 길어진다. 사람이 맨 아래를 보고 있었으면 새로 온 것이 보이게 끝까지 내린다.
  // 위로 올라가 앞의 카드를 보고 있었으면 그대로 둔다.
  const atBottom = useRef(true);
  const viewport = () => screen.current?.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]') ?? null;
  useEffect(() => {
    const node = viewport();
    if (!node) return;
    const onScroll = () => { atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < node.clientHeight / 2; };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [chat?.id]);
  const grown = `${chat?.messages.length ?? 0}:${chat?.snippets.length ?? 0}:${chat?.run?.status ?? ""}`;
  useEffect(() => {
    if (!atBottom.current) return;
    // 카드 안의 첫 화면은 틀의 폭을 잰 뒤에 그려진다. 그 뒤에 내린다.
    const timer = window.setTimeout(() => { const node = viewport(); node?.scrollTo({ top: node.scrollHeight }); }, 80);
    return () => window.clearTimeout(timer);
  }, [grown]);

  const runtime = useExternalStoreRuntime({
    messages: thread.messages,
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: state.running,
    isDisabled: !chat || state.pending || state.consentRequired,
    onNew: async (message) => {
      const text = message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n").trim();
      if (!text) return;
      const target = subject;
      setSubject(null);
      const sent = await state.send({ action: "say", text, ...(target ? { subject: target.kind === "snippet" ? { kind: "snippet", id: target.id } : { kind: "catalog", id: target.item.revisionId } } : {}) });
      // 보내지 못했으면 대상을 되돌려 다시 보낼 수 있게 한다.
      if (!sent) setSubject(target);
    },
  });

  /**
   * 배치를 바꾼다. 넓어지는 첫 화면이 무대의 첫 화면으로(닫을 때는 반대로) 이어지게 화면 전환으로 감싼다.
   * 이름은 바뀌기 전의 틀에 붙였다가 바뀐 뒤의 틀로 옮긴다 — 한 번에 한 틀만 가진다.
   * 움직임을 줄이도록 설정했거나 전환을 지원하지 않는 브라우저에서는 바로 바꾼다.
   */
  const relayout = (to: Layout, options: { before?: () => void; from?: HTMLElement | null } = {}) => {
    if (to === layout) return;
    const stageFrame = () => screen.current?.querySelector<HTMLElement>("[data-stage] [data-frame]") ?? null;
    const apply = () => {
      flushSync(() => { options.before?.(); setLayout(to); });
      const group = anchor.current;
      // 무대로 갈 때는 누른 카드 묶음을, 돌아올 때는 그 묶음의 큰 첫 화면을 다시 보이게 하고 초점도 돌려놓는다.
      (to === "stream" ? (group?.querySelector("figure") ?? group) : group)?.scrollIntoView({ block: "center" });
      if (to === "stream") group?.querySelector<HTMLElement>("[data-expand]")?.focus({ preventScroll: true });
    };
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
    let named = options.from ?? (layout === "stage" ? stageFrame() : null);
    if (named) named.style.viewTransitionName = MORPH;
    const transition = document.startViewTransition(() => {
      if (named) named.style.viewTransitionName = "";
      apply();
      named = to === "stage" ? stageFrame() : (anchor.current?.querySelector<HTMLElement>("figure [data-frame]") ?? null);
      if (named) named.style.viewTransitionName = MORPH;
    });
    void transition.finished.finally(() => { if (named) named.style.viewTransitionName = ""; });
  };
  const collapse = () => relayout("stream");
  useEffect(() => {
    if (layout !== "stage" || sheet) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") collapse(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const proposals = (chat?.messages ?? []).flatMap((message) => (message.role === "assistant" && message.card?.kind === "proposals" ? [{ id: message.id, card: message.card }] : []));
  const view: View = {
    brewId, recipeId, generationAllowed, catalog, state,
    askConsent: state.consentRequired && consentClosed ? () => setConsentClosed(false) : null,
    cards: thread.cards,
    users: thread.users,
    snippet: (id) => chat?.snippets.find((item) => item.id === id),
    styleOf: (id) => proposals.flatMap(({ card }) => card.styles).find((item) => item.id === id),
    layoutOf: (id) => proposals.flatMap(({ card }) => card.layouts).find((item) => item.id === id),
    picked,
    // 같은 것을 다시 누르면 고른 것을 푼다.
    pick: (kind, id) => setPicked((current) => ({ ...current, [kind]: current[kind] === id ? null : id })),
    lastProposals: proposals.at(-1)?.id ?? null,
    busy,
    layout,
    focus,
    show: (snippetId, from) => {
      if (from) anchor.current = from.closest<HTMLElement>("[data-cards]");
      setFocus(snippetId);
    },
    expand: (snippetId, from) => {
      anchor.current = from.closest<HTMLElement>("[data-cards]");
      relayout("stage", { before: () => setFocus(snippetId), from: from.querySelector<HTMLElement>("[data-frame]") });
    },
    collapse,
    subject,
    setSubject,
    openCatalog: () => setSheet(true),
  };

  return (
    <ViewContext.Provider value={view}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div ref={screen} className={styles.screen} data-layout={layout}>
          {layout === "stage" ? <Stage /> : null}
          <section className={`acf-scope ${chatStyles.root} ${styles.chat}`} aria-label="디자인 대화">
            <Thread
              autoFocus={false}
              components={{ Welcome: Opening, AssistantHeader: AssistantIdentity, ToolFallback: CardTool, ToolGroup: PlainGroup, ComposerHeader: () => <ComposerBar notice={notice} />, UserMessageHeader: UserAttachment }}
            />
          </section>
        </div>
        <CatalogSheet open={sheet} onOpenChange={setSheet} />
        <AgentConsentDialog
          open={state.consentRequired && !consentClosed}
          onOpenChange={(open) => setConsentClosed(!open)}
          onConsented={() => { setConsentClosed(false); state.reopen(); }}
        />
      </AssistantRuntimeProvider>
    </ViewContext.Provider>
  );
}

/** 대화를 읽거나 여는 동안의 빈 자리. 열리면 에이전트의 첫 말이 그 자리에 온다. */
function Opening() {
  const { state } = useView();
  return state.issue && !state.chat ? <p className={styles.notice} data-tone="error" role="alert">{state.issue}</p> : null;
}

function AssistantIdentity() {
  const { state } = useView();
  const last = useAuiState((aui) => aui.message.isLast);
  const working = last ? workingLabel(state.chat) : null;
  return <div className={chatStyles.identity}><LogoMark size={20} /><span>Expresso AI</span>{working ? <span className={chatStyles.working}>{working}</span> : null}</div>;
}

/** 도구 호출을 작업 흔적으로 접지 않고 그 자리에 그대로 놓는다. 이 대화에서는 카드가 답의 본문이다. */
function PlainGroup({ children }: PropsWithChildren) {
  return <div className={styles.cards} data-cards="">{children}</div>;
}

const CardTool: ToolCallMessagePartComponent = ({ toolCallId }) => {
  const { cards, state, lastProposals } = useView();
  const card = cards[toolCallId];
  if (!card) return null;
  // 다시 시도는 마지막 답만 받는다. 앞선 답의 그리지 못한 장에는 다시 그리는 자리를 두지 않는다.
  const last = !state.running && state.chat?.messages.at(-1)?.id === toolCallId;
  if (card.kind === "proposals") return <Proposals styles={card.styles} layouts={card.layouts} footer={toolCallId === lastProposals} />;
  if (card.kind === "screens") return <Screens items={card.items} retryable={last} />;
  if (card.kind === "revision") return <Revision card={card} retryable={last} />;
  return <Failure text={card.error} retryable={last} />;
};

/** 만들지 못한 답. 무엇이 안 됐는지와 다시 시도하는 자리를 둔다. */
function Failure({ text, retryable }: { text: string; retryable: boolean }) {
  const { state, busy, brewId } = useView();
  return (
    <p className={styles.notice} data-tone="error" role="alert">
      {text}
      {retryable ? <button type="button" className={styles.reply} disabled={busy} onClick={() => void state.retry()}><Icon name="arrow-clockwise" size={13} />다시 시도</button> : null}
      {/* 답을 받지 못해도 디자인은 고를 수 있어야 한다. */}
      {retryable ? <Link className={styles.reply} href={`/brew/${brewId}/design?view=catalog`}>카탈로그 화면으로</Link> : null}
    </p>
  );
}

/**
 * 레이아웃의 배치도. 첫 화면을 가로 16칸 · 세로 10칸으로 나눈 격자 위의 블록을 그 자리에 그린다.
 * 그리는 호출도 같은 블록을 받는다 — 보고 고른 구성과 그려지는 구성이 같은 값에서 나온다.
 * 스타일이 주어지면 그 바탕 · 글자 · 강조색으로 그린다. 없으면 화면의 중립 색이다.
 */
function Wireframe({ blocks, tokens }: { blocks: DesignLayoutSpec["blocks"]; tokens?: DesignTokens | undefined }) {
  const { columns, rows } = DESIGN_LAYOUT_GRID;
  const tint = tokens ? ({ background: tokens.background, color: tokens.text, "--wire-accent": tokens.accent } as CSSProperties) : undefined;
  return (
    <span className={styles.wire} aria-hidden="true" style={tint}>
      {blocks.map((block, index) => (
        <i key={index} data-kind={block.kind} style={{ left: `${(block.x / columns) * 100}%`, top: `${(block.y / rows) * 100}%`, width: `${(block.w / columns) * 100}%`, height: `${(block.h / rows) * 100}%` }}><b /></i>
      ))}
    </span>
  );
}

/** 스타일의 얼굴. 바탕색 면에 이름을 그 서체로 놓고, 강조 · 글자 색을 점으로 둔다. */
function Swatch({ name, tokens }: { name: string; tokens: DesignTokens }) {
  return (
    <span className={styles.swatchFace} style={{ background: tokens.background, color: tokens.text, fontFamily: FONT_STACK[tokens.font] }}>
      <strong>{name}</strong>
      <span className={styles.swatchDots} aria-hidden="true">
        <i style={{ background: tokens.accent }} />
        <i style={{ background: tokens.text }} />
      </span>
    </span>
  );
}

/**
 * 견본 묶음. 스타일과 레이아웃을 다른 줄에 따로 놓는다 — 사용자는 각각에서 하나씩 고른다.
 * 스타일을 고르면 레이아웃의 배치도가 그 색으로 바뀌어, 고른 짝이 어떤 모습일지를 그리기 전에 보인다.
 * 둘을 고르면 「첫 화면 보기」가 그 짝을 대화에 보내고 에이전트가 첫 화면을 그린다.
 */
function Proposals({ styles: styleItems, layouts, footer }: { styles: DesignStyle[]; layouts: DesignLayout[]; footer: boolean }) {
  const { state, busy, picked, pick, styleOf, layoutOf } = useView();
  const chosen = { style: styleOf(picked.style), layout: layoutOf(picked.layout) };
  return (
    <div className={styles.proposals}>
      {styleItems.length > 0 ? (
        <section className={styles.proposalRow} aria-label="스타일">
          <h4>스타일</h4>
          <ul className={styles.specimenRow}>
            {styleItems.map((item) => (
              <li key={item.id}>
                <button type="button" className={styles.specimen} aria-pressed={picked.style === item.id} aria-label={`스타일 ${item.name}`} onClick={() => pick("style", item.id)}>
                  <span className={styles.swatch}>
                    <Swatch name={item.name} tokens={item.tokens} />
                    <span className={styles.specimenCue} aria-hidden="true"><Icon name="check" weight="bold" size={13} /></span>
                  </span>
                  <span className={styles.specimenWords}><span>{item.words}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {layouts.length > 0 ? (
        <section className={styles.proposalRow} aria-label="레이아웃">
          <h4>레이아웃</h4>
          <ul className={styles.specimenRow}>
            {layouts.map((item) => (
              <li key={item.id}>
                <button type="button" className={styles.specimen} aria-pressed={picked.layout === item.id} aria-label={`레이아웃 ${item.name}`} onClick={() => pick("layout", item.id)}>
                  <span className={styles.swatch} data-kind="layout">
                    <Wireframe blocks={item.blocks} tokens={chosen.style?.tokens} />
                    <span className={styles.specimenCue} aria-hidden="true"><Icon name="check" weight="bold" size={13} /></span>
                  </span>
                  <span className={styles.specimenWords}><strong>{item.name}</strong><span>{item.words}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {footer ? (
        <div className={styles.combo}>
          <span className={styles.comboPick} data-empty={chosen.style ? undefined : ""}>
            {chosen.style ? <><span className={styles.comboSwatch} style={{ background: chosen.style.tokens.background }} aria-hidden="true"><i style={{ background: chosen.style.tokens.accent }} /></span>{chosen.style.name}</> : "스타일"}
          </span>
          <Icon name="plus" size={12} />
          <span className={styles.comboPick} data-empty={chosen.layout ? undefined : ""}>
            {chosen.layout ? <><span className={styles.comboWire}><Wireframe blocks={chosen.layout.blocks} tokens={chosen.style?.tokens} /></span>{chosen.layout.name}</> : "레이아웃"}
          </span>
          <button
            type="button"
            className={styles.reply}
            data-tone="primary"
            disabled={busy || !chosen.style || !chosen.layout}
            onClick={() => { if (chosen.style && chosen.layout) void state.send({ action: "draw", styleId: chosen.style.id, layoutId: chosen.layout.id }); }}
          >
            <Icon name="browsers" size={14} />첫 화면 보기
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 카드 폭에 맞춰 첫 화면을 줄이는 배율. */
function useFrameScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / FRAME.width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

/**
 * 첫 화면. 서버가 소독해 저장한 마크업과 CSS를 배포 문서와 같은 `pageDocument()`로 그린다.
 * `sandbox`를 비워 두어 이 안에서는 스크립트가 돌지 않고 앱의 쿠키 · 저장소에도 닿지 못한다.
 */
function Frame({ snippet, title }: { snippet: DesignSnippet; title: string }) {
  const { ref, scale } = useFrameScale();
  const srcDoc = useMemo(() => pageDocument({ html: snippet.html, css: snippet.css, title }), [snippet.html, snippet.css, title]);
  return (
    <div ref={ref} className={styles.frame} data-frame="" style={{ background: snippet.tokens.background }}>
      {scale > 0 ? <iframe title={title} srcDoc={srcDoc} sandbox="" tabIndex={-1} style={{ width: FRAME.width, height: FRAME.height, transform: `scale(${scale})` }} /> : null}
    </div>
  );
}

function Dots({ tokens }: { tokens: DesignTokens }) {
  return (
    <span className={styles.dots} aria-hidden="true">
      {[tokens.background, tokens.text, tokens.accent].map((color, index) => <span key={index} style={{ background: color }} />)}
    </span>
  );
}

function ScreenThumb({ snippet, active, label, onOpen }: { snippet: DesignSnippet; active: boolean; label?: string | undefined; onOpen(from: HTMLElement): void }) {
  const selected = useView().state.chat?.selectedSnippetId === snippet.id;
  return (
    <button type="button" className={styles.thumb} aria-pressed={active} onClick={(event) => onOpen(event.currentTarget)}>
      <Frame snippet={snippet} title={`${snippet.name} 첫 화면`} />
      <span className={styles.thumbName}>
        {selected ? <Icon name="check-circle" weight="fill" size={14} /> : null}
        <strong>{snippet.name}</strong>
        {label ? <small>{label}</small> : null}
      </span>
    </button>
  );
}

/** 그리는 중이거나 그리지 못한 장. 스타일과 레이아웃은 이미 정해져 있어, 그 색으로 그린 배치도로 자리를 채운다. */
function PendingThumb({ item }: { item: DesignScreenItem }) {
  const drawing = item.status === "drawing";
  return (
    <div className={styles.thumb} data-state={item.status} role="status">
      <span className={styles.frame}>
        <span className={styles.swatchFill}>{item.layout ? <Wireframe blocks={item.layout.blocks} tokens={item.tokens} /> : <Swatch name={item.name} tokens={item.tokens} />}</span>
        {drawing ? <span className={styles.progress} style={{ background: item.tokens.accent }} /> : null}
      </span>
      <span className={styles.thumbName}><strong>{item.name}</strong><small>{drawing ? "그리는 중" : "그리지 못했습니다"}</small></span>
    </div>
  );
}

/** 크게 본 첫 화면과 그것으로 할 수 있는 일. 흐름 배치에서는 카드 줄 아래에, 무대 배치에서는 왼쪽 무대에 놓인다. */
function ScreenView({ snippet }: { snippet: DesignSnippet }) {
  const { layout, expand } = useView();
  return (
    <figure className={styles.view}>
      {layout === "stream" ? (
        <button type="button" className={styles.expand} data-expand="" aria-label={`${snippet.name} 넓게 보기`} onClick={(event) => expand(snippet.id, event.currentTarget)}>
          <Frame snippet={snippet} title={`${snippet.name} 첫 화면`} />
          <span className={styles.expandCue} aria-hidden="true"><Icon name="arrows-out-simple" size={15} /></span>
        </button>
      ) : <Frame snippet={snippet} title={`${snippet.name} 첫 화면 넓게 보기`} />}
      <figcaption className={styles.viewMeta}>
        <span className={styles.viewName}>
          <strong>{snippet.name}</strong>
          <span>{snippet.layout ? `${snippet.layout.name} · ` : ""}{ORIGIN_LABEL[snippet.origin]}</span>
        </span>
        <span className={styles.viewTokens}><Dots tokens={snippet.tokens} />{FONT_LABEL[snippet.tokens.font]}</span>
        {layout === "stream" ? <span className={styles.viewActions}><SnippetActions snippet={snippet} size="sm" /></span> : null}
      </figcaption>
    </figure>
  );
}

/** 첫 화면 한 장으로 할 수 있는 일 — 새 탭에서 보기, 말로 고치기(다음 말의 대상으로 붙임), 고르기. */
function SnippetActions({ snippet, size }: { snippet: DesignSnippet; size: "sm" | "default" }) {
  const { state, busy, setSubject } = useView();
  const chosen = state.chat?.selectedSnippetId === snippet.id;
  const icon = size === "sm" ? 13 : 14;
  const open = () => {
    // 새 탭의 문서는 앱과 같은 출처로 열린다. 대화 안의 틀과 달리 `sandbox`가 없으므로 스크립트를 막는 CSP가 든 문서로 연다.
    const url = URL.createObjectURL(new Blob([pagePreviewDocument({ html: snippet.html, css: snippet.css, title: snippet.name })], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
  };
  const revise = () => {
    setSubject({ kind: "snippet", id: snippet.id });
    document.querySelector<HTMLTextAreaElement>('[aria-label="에이전트에게 메시지"]')?.focus();
  };
  return (
    <>
      <Button variant="ghost" size={size} onClick={open}><Icon name="arrow-square-out" size={icon} />새 탭에서 보기</Button>
      <Button variant="ghost" size={size} disabled={busy} onClick={revise}><Icon name="chat-text" size={icon} />말로 고치기</Button>
      <Button variant={chosen ? "secondary" : "outline"} size={size} aria-pressed={chosen} disabled={state.pending} onClick={() => void state.select(chosen ? null : snippet.id)}>
        <Icon name={chosen ? "check" : "hand-pointing"} size={icon} />{chosen ? "골랐습니다" : "이 스타일 고르기"}
      </Button>
    </>
  );
}

/** 카드 묶음 안에서 크게 볼 첫 화면. 사용자가 누른 것이 있으면 그것, 없으면 가장 먼저 그려진 것. */
function useShown(snippets: DesignSnippet[]) {
  const { layout, focus, show } = useView();
  const [picked, setPicked] = useState<string | null>(null);
  const local = snippets.find(({ id }) => id === picked) ?? snippets[0] ?? null;
  const active = layout === "stage" ? focus : local?.id ?? null;
  const open = (id: string, from: HTMLElement) => { setPicked(id); show(id, from); };
  return { local, active, open };
}

function RetryRow() {
  const { state, busy } = useView();
  return <div className={styles.replies}><button type="button" className={styles.reply} disabled={busy} onClick={() => void state.retry()}><Icon name="arrow-clockwise" size={13} />그리지 못한 장 다시 그리기</button></div>;
}

function Screens({ items, retryable }: { items: DesignScreenItem[]; retryable: boolean }) {
  const { snippet, layout } = useView();
  const done = items.flatMap((item) => { const found = snippet(item.snippetId); return found ? [found] : []; });
  const { local, active, open } = useShown(done);
  const failed = retryable && items.some((item) => item.status === "failed");
  // 다 그린 한 장뿐이면 고를 줄이 필요 없다. 흐름 배치에서는 바로 크게 놓는다.
  if (layout === "stream" && items.length === 1 && local) return <ScreenView snippet={local} />;
  return (
    <>
      <div className={styles.thumbs} data-count={items.length}>
        {items.map((item) => {
          const found = snippet(item.snippetId);
          return found ? <ScreenThumb key={item.id} snippet={found} active={active === found.id} onOpen={(from) => open(found.id, from)} /> : <PendingThumb key={item.id} item={item} />;
        })}
      </div>
      {failed ? <RetryRow /> : null}
      {layout === "stream" && local ? <ScreenView snippet={local} /> : null}
    </>
  );
}

/** 말로 고친 결과. 무엇이 바뀌었는지를 값으로 보이고, 이전 것과 고친 것을 나란히 둔다. */
function Revision({ card, retryable }: { card: Extract<DesignCard, { kind: "revision" }>; retryable: boolean }) {
  const { snippet, layout } = useView();
  const before = snippet(card.fromSnippetId);
  const after = snippet(card.item.snippetId);
  const { local, active, open } = useShown([...(after ? [after] : []), ...(before ? [before] : [])]);
  const NAME = { background: "바탕", text: "글자", accent: "강조색" } as const;
  const changed = before && after ? (["background", "text", "accent"] as const).filter((name) => before.tokens[name] !== after.tokens[name]) : [];
  return (
    <>
      {changed.length > 0 && before && after ? (
        <p className={styles.change}>
          {changed.map((name) => (
            <span key={name}>
              {NAME[name]}
              <i style={{ background: before.tokens[name] }} />
              <Icon name="arrow-right" size={11} />
              <i style={{ background: after.tokens[name] }} />
            </span>
          ))}
        </p>
      ) : null}
      <div className={styles.thumbs} data-count={2}>
        {before ? <ScreenThumb snippet={before} label="이전" active={active === before.id} onOpen={(from) => open(before.id, from)} /> : null}
        {after ? <ScreenThumb snippet={after} label="고친 것" active={active === after.id} onOpen={(from) => open(after.id, from)} /> : <PendingThumb item={card.item} />}
      </div>
      {retryable && card.item.status === "failed" ? <RetryRow /> : null}
      {layout === "stream" && local ? <ScreenView snippet={local} /> : null}
    </>
  );
}

/** 사용자 말풍선 위에 붙는 대상. 어느 스타일과 레이아웃을 골랐는지, 어느 첫 화면을 두고 한 말인지, 카탈로그에서 무엇을 골랐는지 보인다. */
function UserAttachment() {
  const id = useAuiState((aui) => aui.message.id);
  const { users, snippet, styleOf, layoutOf, catalog } = useView();
  const subjects = users[id]?.subjects ?? [];
  if (subjects.length === 0) return null;
  // 배치도는 함께 고른 스타일의 색으로 그린다.
  const tokens = styleOf(subjects.find(({ kind }) => kind === "style")?.id ?? null)?.tokens;
  return (
    <span className={styles.attachments}>
      {subjects.map((subject) => {
        if (subject.kind === "catalog") {
          const item = catalog.find(({ revisionId }) => revisionId === subject.id);
          return (
            <span key={subject.id} className={styles.attachment}>
              {item ? <span className={styles.attachmentThumb}><span className={styles.miniCover}><DesignThumb code={item.code} name={item.name} preview={item.preview} /></span></span> : null}
              <span><small>카탈로그에서 고름</small><strong>{subject.name}</strong></span>
            </span>
          );
        }
        if (subject.kind === "style") {
          return (
            <span key={subject.id} className={styles.attachment}>
              {tokens ? (
                <span className={styles.attachmentSwatch} style={{ background: tokens.background }} aria-hidden="true">
                  <i style={{ background: tokens.accent }} /><i style={{ background: tokens.text }} />
                </span>
              ) : null}
              <span><small>스타일</small><strong>{subject.name}</strong></span>
            </span>
          );
        }
        if (subject.kind === "layout") {
          const found = layoutOf(subject.id);
          return (
            <span key={subject.id} className={styles.attachment}>
              {found ? <span className={styles.attachmentThumb}><Wireframe blocks={found.blocks} tokens={tokens} /></span> : null}
              <span><small>레이아웃</small><strong>{subject.name}</strong></span>
            </span>
          );
        }
        const found = snippet(subject.id);
        return (
          <span key={subject.id} className={styles.attachment}>
            {found ? <span className={styles.attachmentThumb}><Frame snippet={found} title={`${found.name} 첫 화면`} /></span> : null}
            <span><small>이 첫 화면에서</small><strong>{subject.name}</strong></span>
          </span>
        );
      })}
    </span>
  );
}

/** 고른 첫 화면으로 지면을 만든다. 생성을 맡기면 이 화면은 생성 중 화면으로 바뀐다. */
function MakeButton() {
  const { brewId, recipeId, generationAllowed, state } = useView();
  const [result, start, submitting] = useActionState<BrewState, FormData>(startGenerationAction, { error: null });
  const selected = state.chat?.selectedSnippetId;
  if (!selected) return null;
  return (
    <form action={start} className={styles.makeForm}>
      <input type="hidden" name="brewId" value={brewId} />
      {recipeId ? <input type="hidden" name="recipeId" value={recipeId} /> : null}
      <input type="hidden" name="designSnippetId" value={selected} />
      {result.error ? <span className={styles.makeIssue} role="alert">{result.error}</span> : !generationAllowed ? <span className={styles.makeIssue}>이번 달 AI 크레딧을 모두 썼습니다.</span> : null}
      <Button type="submit" className={styles.make} disabled={submitting || state.running || !generationAllowed}><Icon name="magic-wand" size={14} />{submitting ? "맡기는 중" : "이 스타일로 만들기"}</Button>
    </form>
  );
}

/** 입력창 바로 위. 카탈로그를 여는 자리, 다음 말의 대상, 고른 첫 화면과 만들기가 놓인다. */
function ComposerBar({ notice }: { notice: DesignChatNotice | null }) {
  const { layout, state, snippet, subject, setSubject, openCatalog, busy, askConsent, brewId, picked, layoutOf } = useView();
  // 카탈로그의 디자인은 스타일이다. 견본에서 고른 레이아웃이 있으면 그 구성으로 그린다.
  const withLayout = subject?.kind === "catalog" ? layoutOf(picked.layout) : undefined;
  const chosen = snippet(state.chat?.selectedSnippetId ?? null);
  const target = subject?.kind === "snippet" ? snippet(subject.id) : undefined;
  const issue = state.chat && state.issue ? { tone: "error" as const, text: state.issue } : notice;
  return (
    <div className={styles.barWrap}>
      {askConsent ? (
        <p className={styles.notice} role="status">
          AI 사용에 동의해야 대화를 이어 갈 수 있습니다.
          <button type="button" className={styles.reply} onClick={askConsent}>동의 안내 보기</button>
          <Link className={styles.reply} href={`/brew/${brewId}/design?view=catalog`}>카탈로그 화면으로</Link>
        </p>
      ) : issue ? <p className={styles.notice} data-tone={issue.tone} role={issue.tone === "error" ? "alert" : "status"}>{issue.text}</p> : null}
      <div className={styles.bar}>
        <span className={styles.barLeft}>
          <button type="button" className={styles.reply} onClick={openCatalog}><Icon name="squares-four" size={14} />카탈로그</button>
          {target ? (
            <span className={styles.chip}>
              <span className={styles.chipThumb}><Frame snippet={target} title={`${target.name} 첫 화면`} /></span>
              <span className={styles.chipText}><small>이 첫 화면에서</small>{target.name}</span>
              <button type="button" aria-label="대상 빼기" onClick={() => setSubject(null)}><Icon name="x" size={11} /></button>
            </span>
          ) : null}
          {subject?.kind === "catalog" ? (
            <span className={styles.chip}>
              <span className={styles.chipThumb}><span className={styles.miniCover}><DesignThumb code={subject.item.code} name={subject.item.name} preview={subject.item.preview} /></span></span>
              <span className={styles.chipText}><small>카탈로그에서 고름</small>{subject.item.name}</span>
              <button type="button" aria-label={`${subject.item.name} 빼기`} onClick={() => setSubject(null)}><Icon name="x" size={11} /></button>
            </span>
          ) : null}
          {withLayout ? (
            <span className={styles.chip}>
              <span className={styles.chipThumb}><Wireframe blocks={withLayout.blocks} /></span>
              <span className={styles.chipText}><small>레이아웃</small>{withLayout.name}</span>
            </span>
          ) : null}
          {subject?.kind === "catalog" ? (
            <button
              type="button"
              className={styles.reply}
              data-tone="primary"
              disabled={busy}
              onClick={() => { const { revisionId } = subject.item; setSubject(null); void state.send({ action: "draw_catalog", revisionId, ...(withLayout ? { layoutId: withLayout.id } : {}) }); }}
            >
              <Icon name="browsers" size={14} />첫 화면 그리기
            </button>
          ) : null}
        </span>
        {layout === "stream" && chosen ? (
          <span className={styles.dock}>
            <span className={styles.chip}>
              <span className={styles.chipThumb}><Frame snippet={chosen} title={`${chosen.name} 첫 화면`} /></span>
              {chosen.name}
              <button type="button" aria-label="고른 스타일 빼기" disabled={state.pending} onClick={() => void state.select(null)}><Icon name="x" size={11} /></button>
            </span>
            <MakeButton />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** 무대 배치의 왼쪽. 대화에서 넓힌 첫 화면을 크게 본다. */
function Stage() {
  const { focus, snippet, collapse, state } = useView();
  const shown = snippet(focus);
  const close = useRef<HTMLButtonElement>(null);
  // 무대가 열리면 닫는 자리로 초점을 옮긴다 — 키보드로 넓힌 사람이 바로 돌아갈 수 있다.
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);
  return (
    <section className={styles.stage} data-stage="" aria-label="넓게 보기">
      <button ref={close} type="button" className={styles.stageClose} onClick={collapse}><Icon name="arrows-in-simple" size={14} />대화로 돌아가기</button>
      {shown ? (
        <>
          <ScreenView snippet={shown} />
          <div className={styles.stageActions}>
            <SnippetActions snippet={shown} size="default" />
            {/* 만들기는 고른 첫 화면으로 만든다. 무대에 올린 것이 고른 것일 때만 둔다 — 다른 것을 보면서 누르면 보이는 것과 다른 지면이 나온다. */}
            {state.chat?.selectedSnippetId === shown.id ? <MakeButton /> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function CatalogSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { catalog, setSubject, brewId } = useView();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.sheet}>
        <DialogHeader>
          <DialogTitle>카탈로그</DialogTitle>
          <DialogDescription>
            디자인 {catalog.length}개. 고르면 입력창 위에 붙습니다. 구조화 생성과 페이지 짜임새는 <Link href={`/brew/${brewId}/design?view=catalog`}>카탈로그 화면</Link>에서 고릅니다.
          </DialogDescription>
        </DialogHeader>
        <ul className={styles.catalog}>
          {catalog.map((item) => (
            <li key={item.revisionId}>
              <button type="button" className={styles.catalogItem} onClick={() => { setSubject({ kind: "catalog", item }); onOpenChange(false); }}>
                <span className={styles.swatch}><DesignThumb code={item.code} name={item.name} preview={item.preview} /></span>
                <strong>{item.name}</strong>
                <small>{item.reason}</small>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
