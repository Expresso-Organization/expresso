"use client";
import { showToast } from "@/components/ui/toast";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import type { DesignGraphic } from "@expresso/contracts";
import type { WaitReading } from "@/app/(app)/brew/[brewId]/design/GenerationWait";
import { LivePreview } from "@/app/(app)/brew/[brewId]/design/LivePreview";
import { cancelGenerationInChatAction, ensureRecipeAction } from "@/app/(app)/brew/[brewId]/design/design-actions";
import { REFRESH_MS } from "@/app/(app)/brew/[brewId]/use-refresh-while";
import { Icon } from "@/components/ui/Icon";
import { DesignViewContext, Stage, useDesignView, type DesignView } from "@/features/design-chat/DesignChat";
import designStyles from "@/features/design-chat/DesignChat.module.css";
import { useDesignChat, type DesignChatState } from "@/features/design-chat/useDesignChat";
import { BrewDesignCardResponseSchema, type BrewDesignCardData } from "@/lib/brew-design-card";
import { BrewGenerationCardResponseSchema, generationRunning, type BrewGenerationCardData } from "@/lib/brew-generation-card";
import { AgentConsentDialog } from "./AgentConsentDialog";
import stageStyles from "./AgentStage.module.css";

/**
 * 대화의 「디자인」 · 「생성」 카드들이 함께 쓰는 제작별 상태.
 *
 * 한 제작의 카드는 여럿이다(여는 카드 · 그린 첫 화면 · 다시 받은 견본 · 고친 결과 · 생성). 카드마다 따로 읽으면 한 카드에서 고른 것이
 * 다른 카드에 보이지 않는다. 그래서 제작마다 디자인 대화 하나 · 화면 상태(`useDesignView`) 하나 · 생성 상태 하나를 두고 카드는 그것을
 * 읽기만 한다. 넓게 보기의 무대 · 동의 안내 · 만들어지는 지면의 무대도 제작마다 하나다.
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
  /** 최근 생성. 이 대화에 「생성」 카드가 없으면 null이다. */
  generation: BrewGenerationCardData | null;
  /** 기다리는 동안 보일 입력 묶음. 생성이 도는 동안 처음 한 번 읽는다. */
  reading: WaitReading | null;
  /** 생성 상태를 읽은 시각. 기다림 그림의 남은 시간을 이 시각으로 센다 — 그리는 중에 시계를 읽지 않는다. */
  loadedAt: number;
  /** 만들어지는 지면이 이 화면에서 섰는가(첫 조각이 왔다). */
  live: boolean;
  /** 그 지면이 지금 가운데에 열려 있는가. */
  staged: boolean;
  /** 지면을 가운데에 열 자리가 있는가(공고 화면 · 독립 채팅). */
  stageable: boolean;
  toggleStage(): void;
  cancel(): void;
  remake(): Promise<string | null>;
}

class DesignBrewStore {
  readonly #entries = new Map<string, DesignBrew>();
  readonly #listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get = (brewId: string) => this.#entries.get(brewId);
  set(brewId: string, entry: DesignBrew) { this.#entries.set(brewId, entry); for (const listener of this.#listeners) listener(); }
}
const StoreContext = createContext<DesignBrewStore | null>(null);

/** 카드가 읽는 제작의 상태. 아직 준비되지 않았으면 undefined다. */
export function useDesignBrew(brewId: string): DesignBrew | undefined {
  const store = useContext(StoreContext);
  return useSyncExternalStore(store?.subscribe ?? (() => () => undefined), () => store?.get(brewId), () => undefined);
}

async function readJson<T>(url: string, parse: (payload: unknown) => T, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? fallback);
  return parse(payload);
}
const readContext = (brewId: string) => readJson(`/api/brews/${brewId}/design-card`, (payload) => BrewDesignCardResponseSchema.parse(payload).data, "디자인을 불러오지 못했습니다.");
const readGeneration = (brewId: string, reading: boolean) => readJson(`/api/brews/${brewId}/generation${reading ? "?reading=1" : ""}`, (payload) => BrewGenerationCardResponseSchema.parse(payload).data, "생성 상태를 불러오지 못했습니다.");

interface DesignBrewsProps {
  /** 제작 ID → 그 제작의 「디자인」 카드가 가리키는 디자인 대화의 답 ID. */
  cards: Record<string, string[]>;
  /** 제작 ID → 그 제작의 「생성」 카드가 가리키는 생성 ID. 마지막이 가장 최근이다. */
  generations: Record<string, string[]>;
  onDraw(brewId: string, styleId: string, layoutId: string, graphic: DesignGraphic): Promise<void>;
  onMake(brewId: string): Promise<void>;
  /** 만들어지는 지면을 여는 자리. 없으면 가운데로 열지 않고 카드만 둔다. */
  stageHost: HTMLElement | null;
  /** 지금 가운데에 열린 지면의 제작. */
  stagedBrew: string | null;
  onStage(brewId: string, open: boolean): void;
  children: ReactNode;
}

/** 대화에 디자인 카드가 있는 제작마다 상태를 하나씩 둔다. */
export function DesignBrews({ cards, generations, children, ...rest }: DesignBrewsProps) {
  const [store] = useState(() => new DesignBrewStore());
  return <StoreContext.Provider value={store}>
    {Object.entries(cards).map(([brewId, wanted]) => <DesignBrewSource key={brewId} brewId={brewId} wanted={wanted} generationIds={generations[brewId] ?? []} store={store} {...rest} />)}
    {children}
  </StoreContext.Provider>;
}

function DesignBrewSource({ brewId, wanted, generationIds, store, onDraw, onMake, stageHost, stagedBrew, onStage }: Omit<DesignBrewsProps, "cards" | "generations" | "children"> & { brewId: string; wanted: string[]; generationIds: string[]; store: DesignBrewStore }) {
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

  // ── 생성 ───────────────────────────────────────────
  const [generation, setGeneration] = useState<BrewGenerationCardData | null>(null);
  const [reading, setReading] = useState<WaitReading | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [live, setLive] = useState(false);
  const [ended, setEnded] = useState(false);
  const latestCard = generationIds.at(-1) ?? null;
  const current = generation?.generation?.id ?? null;
  const running = generationRunning(generation);
  // 생성이 도는 동안 · 끝났는데 포트폴리오가 아직 안 보이는 동안 · 대화에 새 생성 카드가 붙었는데 아직 그 생성을 모르는 동안 다시 읽는다.
  // 워커는 스트림에 완성을 쓴 뒤 잡 상태를 바꾼다.
  const polling = !!latestCard && (!generation || running || (ended && !generation.generation?.portfolioId) || current !== latestCard);
  const loadGeneration = useCallback(async (withReading: boolean) => {
    const next = await readGeneration(brewId, withReading);
    setGeneration(next);
    setLoadedAt(Date.now());
    if (next.reading) setReading(next.reading);
  }, [brewId]);
  useEffect(() => {
    if (!latestCard) return;
    let alive = true;
    const read = (withReading: boolean) => loadGeneration(withReading).catch((error: unknown) => { if (alive) setIssue(error instanceof Error ? error.message : "생성 상태를 불러오지 못했습니다."); });
    void read(!reading);
    if (!polling) return () => { alive = false; };
    const timer = window.setInterval(() => void read(false), REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  // 입력 묶음은 처음 한 번만 청한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestCard, polling, loadGeneration]);
  // 새 생성이 시작되면 지면이 선 것과 끝난 것을 처음부터 센다.
  useEffect(() => { setLive(false); setEnded(false); }, [current]);

  // 구성이 생기면 디자인 대화를 연다(이미 열려 있으면 읽기만 한다).
  const state = useDesignChat(brewId, { autoOpen: ready });
  const { view } = useDesignView({
    brewId, recipeId: context?.recipeId ?? null, generationAllowed: context?.generationAllowed ?? false, catalog: [], state,
    draw: (styleId, layoutId, graphic) => { setIssue(null); void onDraw(brewId, styleId, layoutId, graphic).catch((error: unknown) => setIssue(error instanceof Error ? error.message : "첫 화면을 그리지 못했습니다.")); },
    // 화면을 넘기지 않는다. 대화에 「생성」 카드가 붙고, 지면이 서면 가운데로 연다.
    make: async () => {
      try { await onMake(brewId); view.collapse(); return null; }
      catch (error) { return error instanceof Error ? error.message : "만들기를 시작하지 못했습니다."; }
    },
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
      else setContext((previous) => (previous ? { ...previous, recipeBuilding: true, recipeFailure: null } : previous));
    });
  };
  const staged = stagedBrew === brewId;
  // 대화의 마지막 「생성」 카드가 가리키는 생성이 도는 중이거나, 이 화면에서 지면이 섰으면 무대를 둔다(스트림은 처음부터 다시 읽혀 새로 고쳐도 다시 선다).
  const stageMounted = !!stageHost && !!current && current === latestCard && (running || live);
  const entry: DesignBrew = {
    state, view, context, issue, retrying, retryRecipe, askConsent: () => setConsentClosed(false),
    generation, reading, loadedAt, live, staged, stageable: !!stageHost,
    toggleStage: () => onStage(brewId, !staged),
    cancel: () => { if (current) void cancelGenerationInChatAction(current).then(() => loadGeneration(false)); },
    remake: async () => {
      try { await onMake(brewId); await loadGeneration(true); return null; }
      catch (error) { return error instanceof Error ? error.message : "만들기를 시작하지 못했습니다."; }
    },
  };
  useEffect(() => { store.set(brewId, entry); });
  // 불러오기 · 그리기 실패는 카드마다 적지 않고 알림 하나로 띄운다. 한 제작의 카드가 여럿이면 같은 경고가 카드 수만큼 붙었다.
  useEffect(() => { if (issue) showToast(issue, "danger"); }, [issue]);
  useEffect(() => { if (state.issue) showToast(state.issue, "danger"); }, [state.issue]);

  const title = generation?.title ?? "포트폴리오";
  const portfolioId = generation?.generation?.status === "done" ? generation.generation.portfolioId : null;
  return <>
    {view.layout === "stage" ? createPortal(<DesignViewContext.Provider value={view}><div className={`acf-scope ${designStyles.overlay}`}><div className={designStyles.screen} data-layout="stage"><Stage /></div></div></DesignViewContext.Provider>, document.body) : null}
    {stageMounted && current ? createPortal(
      // 지면이 서기 전부터 이 자리에 둔다. 틀은 `document.write`로 채워져, 다른 자리로 옮기면 쓴 것이 지워진다.
      <section className={`acf-scope ${stageStyles.stage}`} data-open={staged} aria-hidden={!staged} aria-label="만들어지는 지면" style={staged ? { viewTransitionName: "agent-stage" } : undefined}>
        <header className={stageStyles.head}>
          <strong>{title}</strong>
          <span className={stageStyles.actions}>
            {portfolioId ? <Link className={stageStyles.primary} href={`/edit/${portfolioId}` as Route}>다듬기에서 열기</Link> : null}
            <button type="button" className={stageStyles.close} onClick={() => onStage(brewId, false)}><Icon name="arrows-in-simple" size={14} />지면 닫기</button>
          </span>
        </header>
        <div className={stageStyles.page}>
          <LivePreview jobId={current} title={title} onLive={() => { if (!live) { setLive(true); onStage(brewId, true); } }} onEnd={() => { setEnded(true); void loadGeneration(false); }}>{null}</LivePreview>
        </div>
      </section>, stageHost!) : null}
    <AgentConsentDialog open={state.consentRequired && !consentClosed} onOpenChange={(open) => setConsentClosed(!open)} onConsented={() => { setConsentClosed(true); state.reopen(); }} />
  </>;
}
