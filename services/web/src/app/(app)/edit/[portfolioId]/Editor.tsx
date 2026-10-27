"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

import { pageDocument, type GeneratedPage, type PageEditorDesign, type PortfolioDetail, type PortfolioRevision } from "@expresso/contracts";
import { STRUCTURED_PARTS, STRUCTURED_TYPE_LABELS } from "@expresso/portfolio-renderer/editing";

import { LogoMark } from "@/components/brand/Logo";
import { WizardSteps } from "@/components/shell/WizardShell";
import { Icon } from "@/components/ui/Icon";

import { EditablePagePreview } from "@/components/portfolio/EditablePagePreview";
import { PagePreview } from "@/components/portfolio/PagePreview";
import { PortfolioPage } from "@/components/portfolio/PortfolioPage";

import { ElementChat } from "./ElementChat";
import { ElementProperties } from "./ElementProperties";
import { PageOutline } from "./PageOutline";
import { RecordLibrary, type LibraryRecord } from "./RecordLibrary";

import {
  baseStep,
  ChatPanel,
  FreePageHistoryPanel,
  FreePageProperties,
  HistoryPanel,
  PropertiesPanel,
  StyleControls,
} from "./EditorPanels";
import { blockAction, editBlockAction, historyAction, restorePageAction, sectionAction, type EditResult, type HistoryResult } from "./edit-actions";
import { MediaDrop } from "./MediaDrop";
import styles from "./page.module.css";

type PanelTab = "chat" | "properties" | "history";

const PANEL_TABS: readonly { key: PanelTab; label: string }[] = [
  { key: "chat", label: "채팅" },
  { key: "properties", label: "속성" },
  { key: "history", label: "이력" },
];

function panelTarget(tab: PanelTab, revisionCount: number, chosen: string | null): string {
  if (tab === "history") return `변경 ${revisionCount}건`;
  return chosen ?? "고른 것 없음";
}

// 편집 화면은 사이드바의 「새 포트폴리오」 묶음에 속한다(`sectionForPath`의 /edit).
const RAIL_ITEMS = [
  { icon: "house", label: "홈", href: "/home" as const, active: false },
  { icon: "coffee", label: "새 포트폴리오", href: "/brew/new" as const, active: true },
  { icon: "target", label: "공고 탐색", href: "/jobs" as const, active: false },
  { icon: "chart-bar", label: "분석", href: "/analytics" as const, active: false },
];

/** 캔버스가 흉내 내는 기기 폭. 지면은 이 폭으로 그린 뒤 배율만큼 줄여 보인다. */
const DEVICE_WIDTH = { desktop: 1440, mobile: 390 } as const;
const DEVICE_LABEL = { desktop: "데스크톱", mobile: "모바일" } as const;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;

/** 요소 크기를 따라간다. 캔버스가 맞춤 배율을 계산할 때 쓴다. */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // 그리기 전에 한 번 잰다. 재기 전 배율(100%)로 한 번 그렸다가 줄어드는 것을 막는다.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const first = node.getBoundingClientRect();
    setSize({ width: first.width, height: first.height });
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface EditorCheckpoint {
  id: string;
  label: string;
  createdAt: string;
}

const BLOCK_LABEL: Record<string, string> = {
  heading: "제목",
  paragraph: "문단",
  list: "목록",
  metric: "수치",
  chart: "그림",
};

export function Editor({
  displayName,
  portfolio,
  revisions,
  revisionsCursor = null,
  checkpoints,
  generatedPage,
  generatedPageHistory,
  design = null,
  records = [],
}: {
  displayName: string;
  portfolio: PortfolioDetail;
  revisions: readonly PortfolioRevision[];
  /** 이력 다음 장. 없으면 끝이다. */
  revisionsCursor?: string | null;
  checkpoints: readonly EditorCheckpoint[];
  generatedPage: GeneratedPage | null;
  generatedPageHistory: readonly GeneratedPage[];
  /** 구조화 지면이 고를 수 있는 디자인 값. 구조화 지면이 아니면 없다. */
  design?: PageEditorDesign | null;
  /** 왼쪽 기록 목록. 구조화 지면에서만 쓴다. */
  records?: readonly LibraryRecord[];
}) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  // 초안을 저장한 뒤 워커가 스크린샷을 보고 다듬습니다. 다듬는 동안은 다시 읽어 새 판이 오면 바꿔 보입니다.
  const refining = generatedPage?.refinement?.status === "pending";
  const refined = generatedPage?.generationManifest?.visualReview?.status === "adopted" && generatedPage.refinement === undefined;
  useEffect(() => {
    if (!refining) return;
    const timer = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(timer);
  }, [refining, router]);
  const [tab, setTab] = useState<PanelTab>("chat");
  /** 구조화 지면에서 고른 요소(Spec 키)와 미리보기에서 누른 글자 부분. */
  const structured = generatedPage?.generationManifest?.structured ?? null;
  const [picked, setPicked] = useState<{ key: string; part: string | null } | null>(null);
  const pickedKey = picked && structured?.spec.elements[picked.key] ? picked.key : null;
  const [scrollRequest, setScrollRequest] = useState(0);
  const [draftCss, setDraftCss] = useState("");
  const [leftTab, setLeftTab] = useState<"outline" | "records">("outline");
  const elementParts = useMemo(() => Object.fromEntries(
    Object.entries(structured?.spec.elements ?? {}).map(([key, node]) => [
      key,
      Object.fromEntries(Object.entries(STRUCTURED_PARTS[node.type] ?? {}).map(([name, part]) => [name, part.selector])),
    ]),
  ), [structured]);
  const pickElement = useCallback((key: string, part: string | null, scroll = false) => {
    setPicked({ key, part });
    if (scroll) setScrollRequest((count) => count + 1);
  }, []);
  const pickedNode = pickedKey ? structured?.spec.elements[pickedKey] : undefined;
  const pickedBinding = (pickedNode?.props as { section?: { $state?: string } } | undefined)?.section?.$state;
  const pickedLabel = pickedNode
    ? structured?.content.sections.find((section) => pickedBinding === `/sectionById/${section.id}`)?.title
      ?? STRUCTURED_TYPE_LABELS[pickedNode.type] ?? pickedNode.type
    : null;
  const [sectionId, setSectionId] = useState<string>(
    portfolio.sections[0]?.id ?? "",
  );
  /** 지면에서 고른 블록. 04b가 고치는 대상이고, 캔버스의 테두리도 여기를 따른다. */
  const [blockId, setBlockId] = useState<string | null>(null);
  const [sectionResult, runSection, sectionPending] =
    useActionState<EditResult, FormData>(sectionAction, {});
  const [blockResult, runBlockAction, blockPending] =
    useActionState<EditResult, FormData>(blockAction, {});
  /** 캔버스 툴바의 모양 고치기. 04b 속성 패널과 같은 문을 쓴다. */
  const [styleResult, runStyle, stylePending] =
    useActionState<EditResult, FormData>(editBlockAction, {});
  /** 지우기 전에 되물은 블록. */
  const [asking, setAsking] = useState<string | null>(null);
  /** 캔버스 보기 — 기기 폭, 배율(null이면 화면에 맞춤), 지면/HTML. */
  const [device, setDevice] = useState<keyof typeof DEVICE_WIDTH>("desktop");
  const [zoom, setZoom] = useState<number | null>(null);
  const [canvasView, setCanvasView] = useState<"page" | "html">("page");
  const [panelWide, setPanelWide] = useState(false);
  /** 「이 부분만 AI에게」로 고른 블록. 채팅 패널이 이 블록을 대상으로 열린다. */
  const [chatTarget, setChatTarget] = useState<string | null>(null);
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  const [undoBlockResult, runUndoBlock, undoBlockPending] =
    useActionState<HistoryResult, FormData>(historyAction, {});
  const [undoPageResult, runUndoPage, undoPagePending] =
    useActionState<{ error?: string; revision?: number }, FormData>(restorePageAction, {});

  const deviceWidth = DEVICE_WIDTH[device];
  // 맞춤 배율은 기기 폭이 캔버스에 들어가는 비율이다. 원래 크기보다 키우지는 않는다.
  const fitZoom = area.width > 0 ? Math.min(1, area.width / deviceWidth) : 1;
  const scale = zoom ?? fitZoom;

  function stepZoom(direction: -1 | 1) {
    const next = Math.round((scale + direction * ZOOM_STEP) * 100) / 100;
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
  }

  function chooseDevice(next: keyof typeof DEVICE_WIDTH) {
    setDevice(next);
    setZoom(null);
  }

  /*
   * 되돌리기. 생성 지면은 바로 앞 판을 새 판으로 다시 쌓고, 블록 지면은 가장 최근
   * 블록 변경 한 번을 무른다(섹션 변경은 블록이 없어 이력의 복원 지점으로 되돌린다).
   */
  const lastBlockRevision = revisions[0]?.blockId ? revisions[0] : null;
  const canUndo = generatedPage ? generatedPage.revision > 0 : lastBlockRevision !== null;
  const undoPending = undoBlockPending || undoPagePending;
  const undoError = generatedPage ? undoPageResult.error : undoBlockResult.error
    ?? (undoBlockResult.conflict ? "그 뒤에 이 블록을 또 고쳤습니다. 이력 탭에서 되돌려 주세요." : undefined);

  function undo() {
    const formData = new FormData();
    formData.set("portfolioId", portfolio.id);
    if (generatedPage) {
      formData.set("revision", String(generatedPage.revision - 1));
      formData.set("expectedRevision", String(generatedPage.revision));
      startTransition(() => runUndoPage(formData));
      return;
    }
    if (!lastBlockRevision) return;
    formData.set("revisionId", lastBlockRevision.id);
    startTransition(() => runUndoBlock(formData));
  }

  function askAi(id: string) {
    setChatTarget(id);
    setTab("chat");
  }

  function toggleSection(id: string, visible: boolean) {
    const formData = new FormData();
    formData.set("portfolioId", portfolio.id);
    formData.set("sectionId", id);
    formData.set("visible", String(visible));
    startTransition(() => runSection(formData));
  }

  function runBlock(fields: Record<string, string | string[]>) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const item of value) formData.append(name, item);
      else formData.set(name, value);
    }
    startTransition(() => runBlockAction(formData));
  }

  /** 블록을 한 칸 옮긴다. 섹션 안의 차례 전체를 보낸다. */
  function moveBlock(
    entry: { sectionId: string; siblings: string[]; index: number },
    step: -1 | 1,
  ) {
    const ids = [...entry.siblings];
    const target = entry.index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[entry.index], ids[target]] = [ids[target] as string, ids[entry.index] as string];
    runBlock({ intent: "reorder", portfolioId: portfolio.id, sectionId: entry.sectionId, blockIds: ids });
  }

  function duplicateBlock(id: string) {
    runBlock({ intent: "duplicate", portfolioId: portfolio.id, blockId: id });
  }

  /** 지우기는 한 번 되묻는다 — 이 블록의 편집 이력이 함께 사라진다. */
  function deleteBlock(id: string, confirmed = false) {
    if (!confirmed) {
      setAsking(id);
      return;
    }
    setAsking(null);
    setBlockId(null);
    runBlock({ intent: "delete", portfolioId: portfolio.id, blockId: id });
  }

  /** 한 칸 옮긴다. 옮긴 뒤의 차례 전체를 보낸다. */
  function moveSection(index: number, step: -1 | 1) {
    const ids = portfolio.sections.map((section) => section.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    const formData = new FormData();
    formData.set("portfolioId", portfolio.id);
    for (const id of ids) formData.append("sectionIds", id);
    startTransition(() => runSection(formData));
  }

  // 말로 고칠 수 있는 블록만 고른다. 미디어는 말로 바꿀 것이 없고,
  // 잠근 블록은 계약이 거절한다(§8.3) — 목록에서 미리 뺀다.
  const editableBlocks = portfolio.sections.flatMap((section) =>
    section.blocks
      .filter((block) => block.kind !== "media" && !block.locked)
      .map((block, index) => ({
        id: block.id,
        label: `${section.title ?? "섹션"} · ${index + 1}번 ${BLOCK_LABEL[block.kind] ?? "블록"}`,
      })));

  const selectedSection =
    portfolio.sections.find((section) => section.id === sectionId) ??
    portfolio.sections[0];

  const chosen = portfolio.sections.flatMap((section) =>
    section.blocks.map((block, index) => ({
      block,
      index,
      sectionId: section.id,
      sectionTitle: section.title ?? "제목 없는 섹션",
      siblings: section.blocks.map((one) => one.id),
      path: `${section.title ?? "섹션"} › ${index + 1}번`,
    }))).find((entry) => entry.block.id === blockId) ?? null;
  const address = portfolio.deployment
    ? `${portfolio.deployment.subdomain}.xpresso.me`
    : "아직 주소가 없습니다";
  const attention = generatedPage?.qaReport.checks.find(({ status }) => status === "fail");

  /*
   * 좁은 화면에서 지금 보고 있는 칸.
   *
   * 1280 이상에서는 56 · 244 · 가변 · 320 네 열이 다 선다. 그보다 좁으면 셋을
   * 겹쳐 두고 하나씩 본다 — 지면(canvas)이 기본이고 아래 전환 막대로 섹션과
   * 편집 패널을 불러온다. 넓은 화면에서는 이 값이 아무 일도 하지 않는다.
   */
  const [pane, setPane] = useState<"canvas" | "sections" | "panel">("canvas");

  return (
    <div className={styles.frame}>
      <nav className={styles.rail} aria-label="주요 이동">
        <span className={styles.railLogo}>
          <LogoMark size={22} />
        </span>
        {RAIL_ITEMS.map((item) => (
          <Link
            key={item.icon}
            href={item.href}
            aria-label={item.label}
            className={`${styles.railButton} ${item.active ? styles.railButtonActive : ""}`}
          >
            <Icon
              name={item.icon}
              weight={item.active ? "fill" : "regular"}
              size={17}
              color={item.active ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
            />
          </Link>
        ))}
        <div className={styles.railFoot}>
          <Link href="/account" className={styles.railAvatar} aria-label={`${displayName} · 설정`}>
            {displayName.slice(0, 1)}
          </Link>
        </div>
      </nav>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <Link href="/home" className={styles.toolbarBack} aria-label="뒤로">
            <Icon name="caret-left" size={15} />
          </Link>
          <span className={styles.toolbarTitle}>{portfolio.title}</span>
          <span className={styles.statusPill}>
            <span className={styles.statusDot} />
            <span className={styles.statusText}>
              {portfolio.deployment
                ? portfolio.deployment.hasUnpublishedChanges
                  ? `v${portfolio.deployment.version} · 배포 후 변경됨`
                  : `배포됨 · v${portfolio.deployment.version}`
                : "아직 배포 전"}
            </span>
          </span>
          {generatedPage ? (
            <span
              className={`${styles.generationPill} ${
                generatedPage.qualityStatus === "ready"
                  ? styles.generationReady
                  : styles.generationFailed
              }`}
              title={generationSummary(generatedPage)}
            >
              {generatedPage.qualityStatus === "ready" ? "웹 QA 통과" : "웹 QA 확인 필요"}
              {generatedPage.generationManifest?.usage.costUsd != null
                ? ` · $${generatedPage.generationManifest.usage.costUsd.toFixed(4)}`
                : ""}
            </span>
          ) : null}

          <div className={styles.toolbarRight}>
            <div className={styles.viewport}>
              {(["desktop", "mobile"] as const).map((one) => (
                <button
                  key={one}
                  type="button"
                  aria-label={DEVICE_LABEL[one]}
                  aria-pressed={device === one}
                  className={`${styles.viewportButton} ${device === one ? styles.viewportButtonActive : ""}`}
                  onClick={() => chooseDevice(one)}
                >
                  <Icon
                    name={one === "desktop" ? "desktop" : "device-mobile"}
                    size={15}
                    color={device === one ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
                  />
                </button>
              ))}
            </div>
            <span className={styles.toolbarRule} />
            <div className={styles.historyButtons}>
              <button
                type="button"
                className={`${styles.iconAction} ${!canUndo || undoPending ? styles.iconActionDisabled : ""}`}
                aria-label={generatedPage ? "이전 판으로 되돌리기" : "마지막 변경 되돌리기"}
                title={undoError ?? (generatedPage ? "바로 앞 판을 새 판으로 다시 쌓습니다" : "마지막 블록 변경 한 번을 무릅니다")}
                disabled={!canUndo || undoPending}
                onClick={undo}
              >
                <Icon name="arrow-counter-clockwise" size={15} />
              </button>
            </div>
            <span className={styles.toolbarRule} />
            <span className={styles.saveState}>
              <Icon name="cloud-check" size={14} />
              {new Date(portfolio.updatedAt).toLocaleString("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              저장
            </span>
            {/* 지금 판의 디자인을 바꾸는 API는 없다. 다른 디자인으로 다시 뽑는 단계로 간다. */}
            <Link
              href={`/brew/${portfolio.brewId}/design?again=1`}
              className={styles.themeAction}
              title="디자인을 바꿔 새로 만듭니다 · 생성 1회를 씁니다"
            >
              <Icon name="palette" size={14} />
              다시 뽑기
            </Link>
            {generatedPage ? (
              <a
                href={`/edit/${portfolio.id}/preview`}
                target="_blank"
                rel="noreferrer"
                className={styles.previewButton}
              >
                미리보기
              </a>
            ) : null}
            <Link
              href={`/edit/${portfolio.id}/deploy`}
              className={styles.publishButton}
            >
              <Icon name="rocket-launch" size={14} />
              배포하기
            </Link>
          </div>
        </div>

        {/* 04 다듬기도 제작 흐름의 여섯째 단계다. 지난 단계는 이 포트폴리오의 브루 화면으로 돌아간다. */}
        <WizardSteps
          brewId={portfolio.brewId}
          current="edit"
          situation={generatedPage ? `생성 완료 · 판 ${generatedPage.revision}${refining ? " · AI가 다듬는 중" : ""}` : "생성 전"}
        />

        <div className={styles.stage} data-pane={pane}>
          <aside className={styles.sections} aria-label="섹션">
            {structured && generatedPage ? (
              <>
                <div className={styles.sectionsHead} role="tablist" aria-label="왼쪽 목록">
                  {([["outline", "목차"], ["records", "기록"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={leftTab === key}
                      className={`${styles.leftTab} ${leftTab === key ? styles.leftTabOn : ""}`}
                      onClick={() => setLeftTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {leftTab === "outline" ? (
                  <PageOutline
                    snapshot={structured}
                    portfolioId={portfolio.id}
                    revision={generatedPage.revision}
                    selected={pickedKey}
                    onSelect={(key) => pickElement(key, null, true)}
                  />
                ) : (
                  <RecordLibrary
                    records={records}
                    snapshot={structured}
                    portfolioId={portfolio.id}
                    revision={generatedPage.revision}
                  />
                )}
              </>
            ) : (
              <>
            <div className={styles.sectionsHead}>
                <span className={styles.sectionsLabel}>{generatedPage ? "구성" : "섹션"}</span>
                <span className={styles.sectionsCount}>
                  {generatedPage ? `판 ${generatedPage.revision + 1}` : portfolio.visibleSectionCount}
                </span>
              </div>

              <div className={styles.sectionList}>
                {portfolio.sections.map((section, index) => (
                  <div
                    key={section.id}
                    role={generatedPage ? undefined : "button"}
                    tabIndex={generatedPage ? undefined : 0}
                    onClick={() => { if (!generatedPage) setSectionId(section.id); }}
                    onKeyDown={(event) => {
                      if (generatedPage) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSectionId(section.id);
                      }
                    }}
                    className={[
                      styles.sectionRow,
                      section.id === selectedSection?.id ? styles.sectionRowActive : null,
                      !section.visible ? styles.sectionHidden : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {/* 순서는 지면 전체의 차례를 통째로 보낸다 — 하나만 바꾸면 자리가 부딪힌다. */}
                    {!generatedPage ? <span className={styles.sectionMove}>
                      <button
                        type="button"
                        className={styles.sectionMoveButton}
                        aria-label={`${section.title ?? "섹션"} 위로`}
                        disabled={index === 0 || sectionPending}
                        onClick={(event) => { event.stopPropagation(); moveSection(index, -1); }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.sectionMoveButton}
                        aria-label={`${section.title ?? "섹션"} 아래로`}
                        disabled={index === portfolio.sections.length - 1 || sectionPending}
                        onClick={(event) => { event.stopPropagation(); moveSection(index, 1); }}
                      >
                        ↓
                      </button>
                    </span> : null}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className={styles.sectionTitle} style={{ display: "block" }}>
                        {section.title ?? "제목 없는 섹션"}
                      </span>
                      <span className={styles.sectionMeta} style={{ display: "block" }}>
                        {section.visible
                          ? `블록 ${section.blocks.length}개`
                          : "숨김"}
                      </span>
                    </span>
                    {!generatedPage ? <button
                      type="button"
                      className={styles.sectionEye}
                      aria-label={section.visible ? "숨기기" : "다시 꺼내기"}
                      aria-pressed={!section.visible}
                      disabled={sectionPending}
                      onClick={(event) => { event.stopPropagation(); toggleSection(section.id, !section.visible); }}
                    >
                      <Icon
                        name={section.visible ? "eye" : "eye-slash"}
                        size={13}
                        color={section.visible ? "var(--ex-border-firm)" : "var(--ex-fg-subtle)"}
                      />
                    </button> : null}
                  </div>
                ))}
              </div>
              </>
            )}

            {sectionResult.error ? (
              <p className={styles.sectionError}>{sectionResult.error}</p>
            ) : null}

            {/* 생성 지면의 자동 검사 결과를 한 건만 보인다 */}
            {generatedPage ? <div className={styles.suggestion}>
              <div className={styles.suggestionCard}>
                <div className={styles.suggestionHead}>
                  <Icon name="lightbulb" size={14} color="var(--ex-accent-text)" />
                  <span className={styles.suggestionTitle}>한 가지 제안</span>
                </div>
                <div className={styles.suggestionBody}>
                  {attention?.detail ?? "자동 검사는 참고 정보입니다. 페이지를 바꾸지 않았습니다."}
                </div>
              </div>
            </div> : null}

            {generatedPage ? (
              <div className={styles.sectionsFoot}>
                <button
                  type="button"
                  className={styles.footRow}
                  aria-pressed={canvasView === "html"}
                  onClick={() => setCanvasView((view) => (view === "html" ? "page" : "html"))}
                >
                  <Icon name={canvasView === "html" ? "browser" : "code-simple"} size={14} color="var(--ex-fg-muted)" />
                  <span className={styles.footLabel}>{canvasView === "html" ? "지면으로 돌아가기" : "HTML 직접 보기"}</span>
                </button>
              </div>
            ) : null}
          </aside>

          <div className={styles.canvas}>
            {refining ? (
              <p className={styles.refineNotice} role="status">
                <span className={styles.statusDot} />
                초안입니다. AI가 화면을 보고 다듬고 있으며, 끝나면 다듬은 판으로 바뀝니다.
              </p>
            ) : refined ? (
              <p className={styles.refineNotice} role="status">AI가 화면을 보고 다듬은 판입니다.</p>
            ) : null}
            <div ref={areaRef} className={styles.canvasArea}>
            <div className={styles.browser} style={{ width: Math.round(deviceWidth * scale) }}>
              <div className={styles.browserChrome}>
                <span className={styles.browserDot} />
                <span className={styles.browserDot} />
                <span className={styles.browserDot} />
                <span className={styles.browserAddress}>{address}</span>
              </div>

              <div className={styles.browserBody}>
              {canvasView === "html" && generatedPage ? (
                <pre className={styles.htmlSource} aria-label="배포될 HTML">
                  {pageDocument({
                    html: generatedPage.html,
                    css: generatedPage.css,
                    title: portfolio.title,
                    description: generatedPage.rationale,
                    ...(generatedPage.styleSpec ? { grammar: generatedPage.styleSpec } : {}),
                  })}
                </pre>
              ) : (
              /* 지면을 기기 폭으로 그린 뒤 배율만큼 줄인다. 모바일이면 지면이 좁은 화면 배치로 바뀐다. */
              <div
                className={styles.deviceFrame}
                style={{ width: deviceWidth, height: `${100 / scale}%`, transform: `scale(${scale})` }}
              >
              {generatedPage && structured ? (
                <EditablePagePreview
                  page={generatedPage}
                  title={portfolio.title}
                  className={styles.freePagePreview!}
                  parts={elementParts}
                  selected={pickedKey}
                  scrollRequest={scrollRequest}
                  draftCss={draftCss}
                  onSelect={pickElement}
                />
              ) : generatedPage ? (
                <PagePreview
                  page={generatedPage}
                  title={portfolio.title}
                  className={styles.freePagePreview!}
                />
              ) : (
              <div className={styles.page}>
                <span className={styles.scrollbar} aria-hidden="true" />

                <div className={styles.siteNav}>
                  <span className={styles.siteDot} />
                  <span className={styles.siteName}>{portfolio.title}</span>
                  <span className={styles.siteMenu}>
                    {portfolio.sections
                      .filter((section) => section.visible)
                      .slice(0, 4)
                      .map((section) => (
                        <span key={section.id} className={styles.siteMenuItem}>
                          {section.title ?? "섹션"}
                        </span>
                      ))}
                  </span>
                </div>

                {portfolio.sections.length === 0 ? (
                  <div className={styles.heroLede}>
                    아직 섹션이 없습니다. 디자인 선택으로 돌아가 다시 만들면
                    이 자리에 문장이 채워집니다.
                  </div>
                ) : (
                  /*
                   * 공개 사이트와 **같은 컴포넌트**로 그린다. 편집 화면이 제 나름의
                   * 마크업으로 흉내 내면 고친 모양이 여기서는 안 보이고 나가서만
                   * 보인다 — 그건 편집이 아니다.
                   */
                  <PortfolioPage
                    portfolio={portfolio}
                    wrapBlock={(block, rendered) => {
                      const isSelected = block.id === blockId;
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          className={isSelected ? styles.selected : styles.pickable}
                          onClick={() => { setBlockId(block.id); setTab("properties"); }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setBlockId(block.id);
                              setTab("properties");
                            }
                          }}
                        >
                          {isSelected ? (
                            <div className={styles.floatingToolbar}>
                              <StyleControls
                                portfolioId={portfolio.id}
                                block={block}
                                layoutStep={baseStep(portfolio.layout?.blockClasses[block.kind])}
                                run={runStyle}
                                running={stylePending}
                                compact
                              />
                              <span className={styles.toolRule} />
                              <button
                                type="button"
                                className={styles.toolAi}
                                onClick={(event) => { event.stopPropagation(); askAi(block.id); }}
                              >
                                <Icon name="coffee" weight="fill" size={11} />
                                AI로 다듬기
                              </button>
                            </div>
                          ) : null}
                          {rendered}
                        </div>
                      );
                    }}
                  />
                )}
              </div>
              )}
              </div>
              )}
              </div>
            </div>
            </div>

            <div className={styles.statusBar}>
              <div className={styles.crumbs}>
                {generatedPage ? (
                  <span className={`${styles.crumb} ${styles.crumbCurrent}`}>
                    {generatedPage.generationManifest?.structured ? "구조화 지면" : "자유 HTML"} · 판 {generatedPage.revision + 1}
                  </span>
                ) : chosen ? (
                  <>
                    <span className={styles.crumb}>{chosen.sectionTitle}</span>
                    <Icon name="caret-right" size={9} color="var(--ex-border-firm)" />
                    <span className={`${styles.crumb} ${styles.crumbCurrent}`}>
                      {chosen.path.split(" › ")[1]} {BLOCK_LABEL[chosen.block.kind] ?? "블록"}
                    </span>
                  </>
                ) : (
                  <span className={styles.crumb}>고른 것 없음</span>
                )}
              </div>
              {!generatedPage ? <div className={styles.elementActions}>
                {/* 블록 조작은 고른 것이 있어야 한다. 대상 없는 버튼은 누를 수 없다. */}
                <button
                  type="button"
                  className={styles.iconAction}
                  aria-label="위로 이동"
                  disabled={!chosen || chosen.index === 0 || blockPending}
                  onClick={() => chosen && moveBlock(chosen, -1)}
                >
                  <Icon name="arrow-up" size={13} color="var(--ex-fg-muted)" />
                </button>
                <button
                  type="button"
                  className={styles.iconAction}
                  aria-label="아래로 이동"
                  disabled={!chosen || chosen.index === chosen.siblings.length - 1 || blockPending}
                  onClick={() => chosen && moveBlock(chosen, 1)}
                >
                  <Icon name="arrow-down" size={13} color="var(--ex-fg-muted)" />
                </button>
                <button
                  type="button"
                  className={styles.iconAction}
                  aria-label="복제"
                  disabled={!chosen || blockPending}
                  onClick={() => chosen && duplicateBlock(chosen.block.id)}
                >
                  <Icon name="copy" size={13} color="var(--ex-fg-muted)" />
                </button>
                <button
                  type="button"
                  className={styles.iconAction}
                  aria-label="삭제"
                  disabled={!chosen || blockPending}
                  onClick={() => chosen && deleteBlock(chosen.block.id)}
                >
                  <Icon name="trash" size={13} color="var(--ex-fg-muted)" />
                </button>
                {blockResult.error || styleResult.error ? (
                  <span className={styles.statusError}>
                    {blockResult.error ?? styleResult.error}
                  </span>
                ) : null}
                {asking ? (
                  <span className={styles.statusAsk}>
                    편집 이력도 함께 사라집니다
                    <button
                      type="button"
                      className={styles.statusAskGo}
                      title="지면 전체는 복원 지점으로 되돌릴 수 있습니다"
                      onClick={() => chosen && deleteBlock(chosen.block.id, true)}
                    >
                      그래도 지우기
                    </button>
                  </span>
                ) : null}
                <span className={styles.statusRule} />
                <button
                  type="button"
                  className={styles.statusAi}
                  disabled={!chosen}
                  onClick={() => { if (chosen) askAi(chosen.block.id); }}
                >
                  <Icon name="coffee" weight="fill" size={11} />이 부분만 AI에게
                </button>
              </div> : null}
              {undoError ? <span className={styles.statusError}>{undoError}</span> : null}
              <span className={styles.statusViewport}>{DEVICE_LABEL[device]} {deviceWidth}</span>
              <span className={styles.statusRule} />
              <div className={styles.zoom}>
                <button
                  type="button"
                  className={styles.iconAction}
                  aria-label="축소"
                  disabled={scale <= ZOOM_MIN}
                  onClick={() => stepZoom(-1)}
                >
                  <Icon name="minus" size={12} color="var(--ex-fg-muted)" />
                </button>
                <button
                  type="button"
                  className={styles.zoomValue}
                  title={zoom === null ? "화면에 맞춘 배율입니다" : "눌러서 화면에 맞추기"}
                  aria-label={`배율 ${Math.round(scale * 100)}%${zoom === null ? " · 화면에 맞춤" : " · 눌러서 화면에 맞추기"}`}
                  onClick={() => setZoom(null)}
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  type="button"
                  className={styles.iconAction}
                  aria-label="확대"
                  disabled={scale >= ZOOM_MAX}
                  onClick={() => stepZoom(1)}
                >
                  <Icon name="plus" size={12} color="var(--ex-fg-muted)" />
                </button>
              </div>
            </div>
          </div>

          <aside className={`${styles.panel} ${panelWide ? styles.panelWide : ""}`} aria-label="편집 패널">
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>편집</span>
              <span className={styles.panelTarget}>
                {generatedPage
                  ? (tab === "history" ? `판 ${generatedPageHistory.length}개` : structured ? (pickedLabel ?? "지면 전체") : "웹페이지 전체")
                  : panelTarget(tab, revisions.length, chosen?.path ?? null)}
              </span>
              <button
                type="button"
                className={`${styles.panelHeadAction} ${styles.panelWideToggle}`}
                aria-label={panelWide ? "좁게 보기" : "넓게 보기"}
                aria-pressed={panelWide}
                onClick={() => setPanelWide((wide) => !wide)}
              >
                <Icon name={panelWide ? "arrows-in-simple" : "arrows-out-simple"} size={14} />
              </button>
            </div>

            <div className={styles.panelTabs} role="tablist" aria-label="편집 패널 탭">
              {PANEL_TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={item.key === tab}
                  onClick={() => setTab(item.key)}
                  className={`${styles.panelTab} ${
                    item.key === tab ? styles.panelTabActive : ""
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "chat" && structured && generatedPage && pickedKey ? (
              <ElementChat
                key={pickedKey}
                portfolioId={portfolio.id}
                elementKey={pickedKey}
                label={pickedLabel ?? pickedKey}
                revision={generatedPage.revision}
              />
            ) : tab === "chat" ? (
              <ChatPanel
                key={chatTarget ?? "default"}
                initialTarget={chatTarget}
                portfolioId={portfolio.id}
                blocks={editableBlocks}
                freePage={generatedPage !== null}
                structured={!!generatedPage?.generationManifest?.structured}
              />
            ) : null}
            {tab === "properties" ? (
              structured && generatedPage ? (
                pickedKey ? (
                  <ElementProperties
                    key={`${pickedKey}:${generatedPage.revision}`}
                    snapshot={structured}
                    elementKey={pickedKey}
                    part={picked?.part ?? null}
                    design={design}
                    portfolioId={portfolio.id}
                    revision={generatedPage.revision}
                    onDraftCss={setDraftCss}
                  />
                ) : (
                  <div className={styles.properties}>
                    <p className={styles.panelEmpty}>지면이나 목차에서 요소를 고르세요.</p>
                  </div>
                )
              ) : generatedPage ? (
                <FreePageProperties page={generatedPage} />
              ) : <>
                <PropertiesPanel
                  portfolioId={portfolio.id}
                  block={chosen?.block ?? null}
                  path={chosen?.path ?? ""}
                  layoutStep={baseStep(
                    chosen ? portfolio.layout?.blockClasses[chosen.block.kind] : undefined,
                  )}
                />
                {/*
                  * 지면에 그림을 넣는 유일한 길이다. 추출은 문장만 내므로
                  * 화면 캡처와 로고는 여기서 들어온다.
                  */}
                {selectedSection ? (
                  <MediaDrop
                    portfolioId={portfolio.id}
                    sectionId={selectedSection.id}
                    sectionTitle={selectedSection.title ?? "이 섹션"}
                  />
                ) : null}
              </>
            ) : null}
            {tab === "history" ? (
              generatedPage ? (
                <FreePageHistoryPanel pages={generatedPageHistory} portfolioId={portfolio.id} />
              ) : (
                <HistoryPanel
                  portfolioId={portfolio.id}
                  displayName={displayName}
                  nextCursor={revisionsCursor}
                  revisions={revisions}
                  checkpoints={checkpoints}
                />
              )
            ) : null}
          </aside>
        </div>

        {/* 좁은 화면에서만 뜨는 칸 전환. 넓어지면 CSS가 감춘다. */}
        <div className={styles.paneSwitch} role="tablist" aria-label="편집 화면 전환">
          {PANES.map((one) => (
            <button
              key={one.key}
              type="button"
              role="tab"
              aria-selected={pane === one.key}
              className={`${styles.paneTab} ${pane === one.key ? styles.paneTabOn : ""}`}
              onClick={() => setPane(one.key)}
            >
              <Icon
                name={one.icon}
                size={16}
                color={pane === one.key ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
              />
              {one.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const PANES = [
  { key: "sections" as const, label: "섹션", icon: "list-bullets" },
  { key: "canvas" as const, label: "지면", icon: "browser" },
  { key: "panel" as const, label: "편집", icon: "sliders-horizontal" },
];

function generationSummary(page: GeneratedPage): string {
  const usage = page.generationManifest?.usage;
  const failures = page.qaReport.checks
    .filter(({ status }) => status === "fail")
    .map(({ detail }) => detail);
  return [
    `모델 ${page.generationManifest?.model ?? "기록 없음"}`,
    usage ? `입력 ${usage.inputTokens.toLocaleString()} · 출력 ${usage.outputTokens.toLocaleString()} tokens` : "",
    failures.length > 0 ? failures.join(" / ") : "모든 자동 검사 통과",
  ].filter(Boolean).join("\n");
}
