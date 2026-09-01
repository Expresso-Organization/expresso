"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import type { GeneratedPage, PortfolioDetail, PortfolioRevision } from "@expresso/contracts";

import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { EDITOR_SUGGESTION } from "@/lib/sample/editor";

import { PagePreview } from "@/components/portfolio/PagePreview";
import { PortfolioPage } from "@/components/portfolio/PortfolioPage";

import {
  baseStep,
  ChatPanel,
  FreePageHistoryPanel,
  FreePageProperties,
  HistoryPanel,
  PropertiesPanel,
  StyleControls,
} from "./EditorPanels";
import { blockAction, editBlockAction, sectionAction, type EditResult } from "./edit-actions";
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

const RAIL_ITEMS = [
  { icon: "house", label: "홈", href: "/home" as const, active: false, dot: false },
  { icon: "coffee", label: "새 포트폴리오", href: "/portfolio/new" as const, active: true, dot: false },
  { icon: "target", label: "공고 탐색", href: "/jobs" as const, active: false, dot: false },
  { icon: "chart-bar", label: "분석", href: "/analytics" as const, active: false, dot: true },
];

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
  checkpoints,
  generatedPage,
  generatedPageHistory,
}: {
  displayName: string;
  portfolio: PortfolioDetail;
  revisions: readonly PortfolioRevision[];
  checkpoints: readonly EditorCheckpoint[];
  generatedPage: GeneratedPage | null;
  generatedPageHistory: readonly GeneratedPage[];
}) {
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<PanelTab>("chat");
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
            {item.dot ? <span className={styles.railDot} /> : null}
          </Link>
        ))}
        <div className={styles.railFoot}>
          <button type="button" className={styles.railButton} aria-label="도움말">
            <Icon name="question" size={17} color="var(--ex-fg-muted)" />
          </button>
          <span className={styles.railAvatar}>{displayName.slice(0, 1)}</span>
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
              <button
                type="button"
                aria-label="데스크톱"
                aria-pressed="true"
                className={`${styles.viewportButton} ${styles.viewportButtonActive}`}
              >
                <Icon name="desktop" size={15} color="var(--ex-fg)" />
              </button>
              <button type="button" aria-label="모바일" className={styles.viewportButton}>
                <Icon name="device-mobile" size={15} color="var(--ex-fg-muted)" />
              </button>
            </div>
            <span className={styles.toolbarRule} />
            <div className={styles.historyButtons}>
              <button type="button" className={styles.iconAction} aria-label="되돌리기">
                <Icon name="arrow-counter-clockwise" size={15} />
              </button>
              <button
                type="button"
                className={`${styles.iconAction} ${styles.iconActionDisabled}`}
                aria-label="다시 실행"
                disabled
              >
                <Icon name="arrow-clockwise" size={15} />
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
            <button type="button" className={styles.themeAction}>
              <Icon name="palette" size={14} />
              테마
            </button>
            <button type="button" className={styles.previewButton}>
              미리보기
            </button>
            <Link
              href={`/edit/${portfolio.id}/deploy`}
              className={styles.publishButton}
            >
              <Icon name="rocket-launch" size={14} />
              배포하기
            </Link>
          </div>
        </div>

        <div className={styles.stage} data-pane={pane}>
          <aside className={styles.sections} aria-label="섹션">
            <div className={styles.sectionsHead}>
              <span className={styles.sectionsLabel}>{generatedPage ? "구성" : "섹션"}</span>
              <span className={styles.sectionsCount}>
                {generatedPage ? `판 ${generatedPage.revision + 1}` : portfolio.visibleSectionCount}
              </span>
              {!generatedPage ? (
                <button type="button" className={styles.panelHeadAction} aria-label="섹션 추가">
                  <Icon name="plus" size={13} />
                </button>
              ) : null}
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
                        : `숨김 · ${section.hiddenReason ?? "사유 없음"}`}
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

            {sectionResult.error ? (
              <p className={styles.sectionError}>{sectionResult.error}</p>
            ) : null}

            {/* AI 제안 카드는 항상 한 건만 노출 */}
            <div className={styles.suggestion}>
              <div className={styles.suggestionCard}>
                <div className={styles.suggestionHead}>
                  <Icon name="lightbulb" size={14} color="var(--ex-accent-text)" />
                  <span className={styles.suggestionTitle}>한 가지 제안</span>
                </div>
                <div className={styles.suggestionBody}>
                  {generatedPage
                    ? attention?.detail ?? "자동 검사는 참고 정보입니다. 페이지를 바꾸지 않았습니다."
                    : EDITOR_SUGGESTION.text}
                </div>
                {!generatedPage ? (
                  <div className={styles.suggestionActions}>
                    <button type="button" className={styles.suggestionAccept}>올리기</button>
                    <button type="button" className={styles.suggestionDismiss}>그대로 두기</button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.sectionsFoot}>
              <button type="button" className={styles.footRow}>
                <Icon name="palette" size={14} color="var(--ex-fg-muted)" />
                <span className={styles.footLabel}>테마 · 글꼴</span>
                <span className={styles.footSwatch} />
              </button>
              <button type="button" className={styles.footRow}>
                <Icon name="ruler" size={14} color="var(--ex-fg-muted)" />
                <span className={styles.footLabel}>간격 · 여백 기준</span>
                <span className={styles.footValue}>보통</span>
              </button>
              <button type="button" className={styles.footRow}>
                <Icon name="code-simple" size={14} color="var(--ex-fg-muted)" />
                <span className={styles.footLabel}>HTML 직접 보기</span>
              </button>
            </div>
          </aside>

          <div className={styles.canvas}>
            <div className={styles.browser}>
              <div className={styles.browserChrome}>
                <span className={styles.browserDot} />
                <span className={styles.browserDot} />
                <span className={styles.browserDot} />
                <span className={styles.browserAddress}>{address}</span>
              </div>

              {generatedPage ? (
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
                    아직 섹션이 없습니다. 레시피로 돌아가 구성을 만든 뒤 추출하면
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
                                onClick={(event) => { event.stopPropagation(); setTab("chat"); }}
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

            <div className={styles.statusBar}>
              <div className={styles.crumbs}>
                {generatedPage ? (
                  <span className={`${styles.crumb} ${styles.crumbCurrent}`}>
                    자유 HTML · 판 {generatedPage.revision + 1}
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
                  onClick={() => { setTab("chat"); }}
                >
                  <Icon name="coffee" weight="fill" size={11} />이 부분만 AI에게
                </button>
              </div> : null}
              <span className={styles.statusViewport}>데스크톱 1440</span>
              <span className={styles.statusRule} />
              <div className={styles.zoom}>
                <button type="button" className={styles.iconAction} aria-label="축소">
                  <Icon name="minus" size={12} color="var(--ex-fg-muted)" />
                </button>
                <span className={styles.zoomValue}>72%</span>
                <button type="button" className={styles.iconAction} aria-label="확대">
                  <Icon name="plus" size={12} color="var(--ex-fg-muted)" />
                </button>
              </div>
            </div>
          </div>

          <aside className={styles.panel} aria-label="편집 패널">
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>편집</span>
              <span className={styles.panelTarget}>
                {generatedPage
                  ? (tab === "history" ? `판 ${generatedPageHistory.length}개` : "웹페이지 전체")
                  : panelTarget(tab, revisions.length, chosen?.path ?? null)}
              </span>
              <button type="button" className={styles.panelHeadAction} aria-label="넓게 보기">
                <Icon name="arrow-square-out" size={14} />
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

            {tab === "chat" ? (
              <ChatPanel
                portfolioId={portfolio.id}
                blocks={editableBlocks}
                freePage={generatedPage !== null}
              />
            ) : null}
            {tab === "properties" ? (
              generatedPage ? (
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
                <FreePageHistoryPanel pages={generatedPageHistory} />
              ) : (
                <HistoryPanel
                  portfolioId={portfolio.id}
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
