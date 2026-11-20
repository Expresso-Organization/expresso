"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ensureRecipeAction } from "@/app/(app)/brew/[brewId]/design/design-actions";
import { REFRESH_MS } from "@/app/(app)/brew/[brewId]/use-refresh-while";
import { DesignViewContext, Stage, useDesignView, type DesignView } from "@/features/design-chat/DesignChat";
import designStyles from "@/features/design-chat/DesignChat.module.css";
import { useDesignChat, type DesignChatState } from "@/features/design-chat/useDesignChat";
import { BrewDesignCardResponseSchema, type BrewDesignCardData } from "@/lib/brew-design-card";
import { AgentConsentDialog } from "./AgentConsentDialog";

/**
 * 대화의 「디자인」 카드들이 함께 쓰는 제작별 상태.
 *
 * 한 제작의 디자인 카드는 여럿이다(여는 카드 · 그린 첫 화면 · 다시 받은 견본 · 고친 결과). 카드마다 디자인 대화를 따로 읽으면
 * 한 카드에서 고른 것이 다른 카드에 보이지 않고, 앞선 카드에서 고른 레이아웃을 새 견본의 스타일과 짝지을 수 없다. 그래서
 * 제작마다 디자인 대화 하나 · 화면 상태(`useDesignView`) 하나를 두고 카드는 그것을 읽기만 한다. 넓게 보기의 무대와 동의 안내도
 * 제작마다 하나다.
 */
export interface DesignBrew {
  state: DesignChatState;
  view: DesignView;
  /** 구성 · 생성 가능 여부. 아직 읽지 못했으면 null이다. */
  context: BrewDesignCardData | null;
  issue: string | null;
  retrying: boolean;
  retryRecipe(): void;
  askConsent(): void;
}

class DesignBrewStore {
  readonly #entries = new Map<string, DesignBrew>();
  readonly #listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get = (brewId: string) => this.#entries.get(brewId);
  set(brewId: string, entry: DesignBrew) { this.#entries.set(brewId, entry); for (const listener of this.#listeners) listener(); }
}
const StoreContext = createContext<DesignBrewStore | null>(null);

/** 카드가 읽는 제작의 디자인 상태. 아직 준비되지 않았으면 undefined다. */
export function useDesignBrew(brewId: string): DesignBrew | undefined {
  const store = useContext(StoreContext);
  return useSyncExternalStore(store?.subscribe ?? (() => () => undefined), () => store?.get(brewId), () => undefined);
}

async function readContext(brewId: string): Promise<BrewDesignCardData> {
  const response = await fetch(`/api/brews/${brewId}/design-card`, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? "디자인을 불러오지 못했습니다.");
  return BrewDesignCardResponseSchema.parse(payload).data;
}

/**
 * 대화에 디자인 카드가 있는 제작마다 상태를 하나씩 둔다. `cards`는 제작 ID → 그 제작의 카드가 가리키는 디자인 대화의 답 ID다 —
 * 대화에 새 카드가 붙었는데 디자인 대화에서 아직 그 답을 읽지 않았으면 다시 읽는다.
 */
export function DesignBrews({ cards, onDraw, children }: { cards: Record<string, string[]>; onDraw(brewId: string, styleId: string, layoutId: string): Promise<void>; children: ReactNode }) {
  const [store] = useState(() => new DesignBrewStore());
  return <StoreContext.Provider value={store}>
    {Object.entries(cards).map(([brewId, wanted]) => <DesignBrewSource key={brewId} brewId={brewId} wanted={wanted} store={store} onDraw={onDraw} />)}
    {children}
  </StoreContext.Provider>;
}

function DesignBrewSource({ brewId, wanted, store, onDraw }: { brewId: string; wanted: string[]; store: DesignBrewStore; onDraw(brewId: string, styleId: string, layoutId: string): Promise<void> }) {
  const [context, setContext] = useState<BrewDesignCardData | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [consentClosed, setConsentClosed] = useState(true);
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

  // 구성이 생기면 디자인 대화를 연다(이미 열려 있으면 읽기만 한다).
  const state = useDesignChat(brewId, { autoOpen: ready });
  const { view } = useDesignView({
    brewId, recipeId: context?.recipeId ?? null, generationAllowed: context?.generationAllowed ?? false, catalog: [], state,
    draw: (styleId, layoutId) => { setIssue(null); void onDraw(brewId, styleId, layoutId).catch((error: unknown) => setIssue(error instanceof Error ? error.message : "첫 화면을 그리지 못했습니다.")); },
  });

  // 대화에 붙은 카드가 가리키는 답을 아직 읽지 않았으면 다시 읽는다 — 도구나 「첫 화면 보기」가 디자인 대화에 차례를 맡긴 뒤다.
  const missing = !!state.chat && wanted.some((id) => !state.chat!.messages.some((message) => message.id === id));
  const { refresh } = state;
  useEffect(() => { if (missing) refresh(); }, [missing, refresh, state.chat?.version]);

  useEffect(() => {
    if (view.layout !== "stage") return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") view.collapse(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const retryRecipe = () => {
    setRetrying(true);
    void ensureRecipeAction(brewId).then((result) => {
      setRetrying(false);
      if (result.error) setIssue(result.error);
      else setContext((current) => (current ? { ...current, recipeBuilding: true, recipeFailure: null } : current));
    });
  };
  useEffect(() => { store.set(brewId, { state, view, context, issue, retrying, retryRecipe, askConsent: () => setConsentClosed(false) }); });

  return <>
    {view.layout === "stage" ? createPortal(<DesignViewContext.Provider value={view}><div className={`acf-scope ${designStyles.overlay}`}><div className={designStyles.screen} data-layout="stage"><Stage /></div></div></DesignViewContext.Provider>, document.body) : null}
    <AgentConsentDialog open={state.consentRequired && !consentClosed} onOpenChange={(open) => setConsentClosed(!open)} onConsented={() => { setConsentClosed(true); state.reopen(); }} />
  </>;
}
