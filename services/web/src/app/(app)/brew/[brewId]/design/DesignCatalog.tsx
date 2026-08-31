"use client";

import type { DesignSystemSpecV2, ReferenceLock } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, type CSSProperties } from "react";

import { Icon } from "@/components/ui/Icon";

import {
  saveDesignSelectionAction,
  type DesignSelectionActionState,
} from "./design-selection-actions";
import styles from "./DesignCatalog.module.css";

/**
 * 카드 썸네일 — 포스터.
 *
 * 96f2ccc 의 `TemplateThumb` 를 옮겨 왔다. 그 개정의 근거는
 * `docs/architecture/portfolio-style-ui-plan.md` 에 있다 — 카드 견본은 최종
 * 생성 결과가 아니라 스타일을 설명하는 미리보기이므로, 레시피 문장 · 제목 ·
 * 성과 수치를 넣지 않고 **디자인 이름을 그 디자인의 서체로 조판**한다. 이름은
 * 생략하지 않고 줄로 접는다.
 *
 * 원본의 스타일별 색면 · 선 · 도형은 옛 30종 코드에 하나씩 손으로 맞춘 것이라
 * 우리 코드에는 걸리지 않는다. 근거 없이 새로 지어내지 않고 두었다.
 */
function DesignThumb({ name, spec }: { name: string; spec: DesignSystemSpecV2 }) {
  const { colors, typography } = spec;
  // 긴 이름은 잘라 내지 않고 낱말 경계에서 접는다.
  const lines = name.split(/\s+/).filter(Boolean);
  const longestLine = Math.max(1, ...lines.map((line) => line.length));

  return (
    <span
      className={styles.thumb}
      aria-hidden="true"
      style={{
        "--thumb-bg": colors.canvas.value,
        "--thumb-text": colors.text.value,
        "--thumb-accent": colors.accent.value,
        "--poster-title-scale": `${Math.min(28, 130 / longestLine)}cqw`,
        "--poster-title-max":
          lines.length > 2 ? "var(--ex-text-4xl)" : "var(--ex-text-display-md)",
        fontFamily: `${typography.display.family}, ${typography.display.fallback}`,
      } as CSSProperties}
    >
      <span className={styles.posterTitle}>
        {lines.map((line, index) => <span key={index}>{line}</span>)}
      </span>
      <span className={styles.palette}>
        <span data-color="accent" />
        <span data-color="text" />
        <span data-color="background" />
      </span>
    </span>
  );
}

type CatalogCategory = "recommended" | "builtin" | "reference" | "personal" | "company";

export interface DesignCatalogEntry {
  designSystemId: string;
  revisionId: string;
  code: string;
  name: string;
  description: string;
  originKind: "builtin" | "reference" | "generated" | "website";
  sourceName: string | null;
  sourceUrl: string | null;
  capturedAt: string | null;
  attribution: string | null;
  traits: string[];
  signatureMove: string;
  fitReasons: string[];
  recommended: boolean;
  filters: {
    surface: "light" | "dark";
    density: "compact" | "comfortable" | "spacious";
    typography: string;
    contentFocus: string[];
    moods: string[];
    roles: string[];
  };
  designHtml: string;
  designMarkdown: string;
  markdownSha256: string;
  contentHash: string;
  spec: DesignSystemSpecV2;
  referenceLock: ReferenceLock;
  legacyTemplateId: string | null;
}

const CATEGORIES: Array<{ key: CatalogCategory; label: string }> = [
  { key: "recommended", label: "추천" },
  { key: "builtin", label: "Expresso 기본" },
  { key: "reference", label: "유명 웹사이트" },
  { key: "personal", label: "내 디자인" },
  { key: "company", label: "회사 웹사이트" },
];

const ORIGIN_LABEL: Record<DesignCatalogEntry["originKind"], string> = {
  builtin: "Expresso 기본",
  reference: "Refero 참고",
  generated: "내 디자인",
  website: "회사 웹사이트",
};

const FOCUS_LABEL: Record<string, string> = {
  image: "이미지 중심",
  metrics: "수치 중심",
  text: "글 중심",
};

function matchesCategory(entry: DesignCatalogEntry, category: CatalogCategory): boolean {
  if (category === "recommended") return entry.recommended;
  if (category === "builtin") return entry.originKind === "builtin";
  if (category === "reference") return entry.originKind === "reference";
  if (category === "personal") return entry.originKind === "generated";
  return entry.originKind === "website";
}

function formatCapturedAt(value: string | null): string {
  if (!value) return "수집 시각 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}

export function DesignCatalog({
  brewId,
  entries,
  initialRevisionId,
}: {
  brewId: string;
  entries: DesignCatalogEntry[];
  initialRevisionId: string | null;
}) {
  const firstAvailableRevisionId = initialRevisionId
    && entries.some((entry) => entry.revisionId === initialRevisionId)
    ? initialRevisionId
    : entries[0]?.revisionId ?? null;
  const [actionState, saveSelection, pending] = useActionState<
    DesignSelectionActionState,
    FormData
  >(saveDesignSelectionAction, { error: null, savedRevisionId: initialRevisionId });
  const [category, setCategory] = useState<CatalogCategory>("recommended");
  const [query, setQuery] = useState("");
  const [surface, setSurface] = useState<"all" | "light" | "dark">("all");
  const [density, setDensity] = useState<"all" | "compact" | "comfortable" | "spacious">("all");
  const [focus, setFocus] = useState("all");
  const [typography, setTypography] = useState("all");
  const [mood, setMood] = useState("all");
  const [role, setRole] = useState("all");
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    firstAvailableRevisionId,
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<"html" | "markdown" | "source">("html");
  const [htmlMode, setHtmlMode] = useState<"preview" | "code">("preview");
  const [fullscreen, setFullscreen] = useState(false);

  const focusOptions = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.filters.contentFocus))],
    [entries],
  );
  const typographyOptions = useMemo(
    () => [...new Set(entries.map((entry) => entry.filters.typography))],
    [entries],
  );
  const moodOptions = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.filters.moods))],
    [entries],
  );
  const roleOptions = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.filters.roles))],
    [entries],
  );
  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return entries.filter((entry) => {
      if (!matchesCategory(entry, category)) return false;
      if (surface !== "all" && entry.filters.surface !== surface) return false;
      if (density !== "all" && entry.filters.density !== density) return false;
      if (focus !== "all" && !entry.filters.contentFocus.includes(focus)) return false;
      if (typography !== "all" && entry.filters.typography !== typography) return false;
      if (mood !== "all" && !entry.filters.moods.includes(mood)) return false;
      if (role !== "all" && !entry.filters.roles.includes(role)) return false;
      if (!normalized) return true;
      return [
        entry.name,
        entry.description,
        ...entry.traits,
        ...entry.filters.moods,
        ...entry.filters.roles,
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized));
    });
  }, [category, density, entries, focus, mood, query, role, surface, typography]);
  const selected = entries.find((entry) => entry.revisionId === selectedRevisionId) ?? null;
  const selectedIsSaved = selected?.revisionId === actionState.savedRevisionId;

  useEffect(() => {
    if (!fullscreen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", close);
    };
  }, [fullscreen]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setInspectorOpen(!media.matches || initialRevisionId !== null);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [initialRevisionId]);

  const gridStateKey = [category, density, focus, mood, query, role, surface, typography].join(":");

  return (
    <div className={styles.catalogLayout}>
      <section className={styles.catalogPane} aria-label="디자인 카탈로그">
        <div className={styles.catalogHeader}>
          <div>
            <h1 className={styles.catalogTitle}>디자인을 고르세요</h1>
            <p className={styles.catalogIntro}>
              같은 샘플을 보고 시각 방향과 적용 규칙을 비교할 수 있습니다.
            </p>
          </div>
          <span className={styles.catalogCount}>{entries.length}개 디자인</span>
        </div>

        <div className={styles.categoryRow} role="tablist" aria-label="디자인 분류">
          {CATEGORIES.map((item) => {
            const count = entries.filter((entry) => matchesCategory(entry, item.key)).length;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={category === item.key}
                className={`${styles.categoryTab} ${category === item.key ? styles.categoryTabActive : ""}`}
                onClick={() => setCategory(item.key)}
              >
                {item.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.catalogTools}>
          <label className={styles.searchField}>
            <Icon name="magnifying-glass" size={14} />
            <span className={styles.srOnly}>디자인 검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름, 분위기, 직무로 검색"
            />
            {query ? (
              <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}>
                <Icon name="x" size={13} />
              </button>
            ) : null}
          </label>
          <div className={styles.filterRow}>
            <label className={styles.filterSelect}>
              <span>지면</span>
              <select value={surface} onChange={(event) => setSurface(event.target.value as typeof surface)}>
                <option value="all">전체</option>
                <option value="light">밝게</option>
                <option value="dark">어둡게</option>
              </select>
            </label>
            <label className={styles.filterSelect}>
              <span>직무</span>
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="all">전체</option>
                {roleOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className={styles.filterSelect}>
              <span>밀도</span>
              <select value={density} onChange={(event) => setDensity(event.target.value as typeof density)}>
                <option value="all">전체</option>
                <option value="compact">촘촘하게</option>
                <option value="comfortable">보통</option>
                <option value="spacious">넓게</option>
              </select>
            </label>
            <label className={styles.filterSelect}>
              <span>서체</span>
              <select value={typography} onChange={(event) => setTypography(event.target.value)}>
                <option value="all">전체</option>
                {typographyOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className={styles.filterSelect}>
              <span>중심</span>
              <select value={focus} onChange={(event) => setFocus(event.target.value)}>
                <option value="all">전체</option>
                {focusOptions.map((value) => (
                  <option key={value} value={value}>{FOCUS_LABEL[value] ?? value}</option>
                ))}
              </select>
            </label>
            <label className={styles.filterSelect}>
              <span>분위기</span>
              <select value={mood} onChange={(event) => setMood(event.target.value)}>
                <option value="all">전체</option>
                {moodOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        </div>

        {visibleEntries.length > 0 ? (
          <div key={gridStateKey} className={styles.designGrid}>
            {visibleEntries.map((entry) => {
              const isSelected = entry.revisionId === selectedRevisionId;
              return (
                <article
                  key={entry.revisionId}
                  className={`${styles.designCard} ${isSelected ? styles.designCardSelected : ""}`}
                >
                  <span className={styles.cardPreview} aria-hidden="true">
                    <DesignThumb name={entry.name} spec={entry.spec} />
                    {isSelected ? (
                      <span className={styles.cardCheck}><Icon name="check" size={12} /></span>
                    ) : entry.recommended ? (
                      <span className={styles.recommendBadge}>
                        <Icon name="sparkle" weight="fill" size={9} /> 추천
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`${entry.name} 디자인 문서 열기`}
                    aria-pressed={isSelected}
                    className={styles.cardHitTarget}
                    onClick={() => {
                      setSelectedRevisionId(entry.revisionId);
                      setInspectorOpen(true);
                      setInspectorTab("html");
                      setHtmlMode("preview");
                    }}
                  />
                  <span className={styles.cardFooter}>
                    <span className={styles.cardNameRow}>
                      <strong>{entry.name}</strong>
                      <span className={styles.originBadge}>{ORIGIN_LABEL[entry.originKind]}</span>
                    </span>
                    <span className={styles.cardFitReason}>{entry.fitReasons[0]}</span>
                  </span>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.catalogEmpty}>
            <Icon name="palette" size={22} />
            <strong>이 조건에 맞는 디자인이 없습니다</strong>
            <p>검색어 또는 필터를 조정하면 다른 방향을 볼 수 있습니다.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSurface("all");
                setDensity("all");
                setFocus("all");
                setTypography("all");
                setMood("all");
                setRole("all");
              }}
            >
              필터 초기화
            </button>
          </div>
        )}
      </section>

      {selected && inspectorOpen ? (
        <aside
          className={`${styles.inspector} ${fullscreen ? styles.inspectorFullscreen : ""}`}
          aria-label={`${selected.name} 디자인 인스펙터`}
        >
          <header className={styles.inspectorHeader}>
            <div className={styles.inspectorIdentity}>
              <span className={styles.inspectorEyebrow}>{ORIGIN_LABEL[selected.originKind]}</span>
              <div className={styles.inspectorNameRow}>
                <h2>{selected.name}</h2>
                <span>r{selected.referenceLock.primaryDirection.revision}</span>
              </div>
              <p>{selected.signatureMove}</p>
            </div>
            <div className={styles.inspectorActions}>
              <button
                type="button"
                aria-label={fullscreen ? "전체 화면 닫기" : "전체 화면으로 보기"}
                onClick={() => setFullscreen((value) => !value)}
              >
                <Icon name={fullscreen ? "arrows-in-simple" : "arrows-out-simple"} size={16} />
              </button>
              <button
                type="button"
                className={styles.inspectorClose}
                aria-label="인스펙터 닫기"
                onClick={() => setInspectorOpen(false)}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </header>

          <nav className={styles.inspectorTabs} aria-label="디자인 문서">
            {([
              ["html", "DESIGN.html"],
              ["markdown", "DESIGN.md"],
              ["source", "출처와 적용 규칙"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={inspectorTab === key}
                className={inspectorTab === key ? styles.inspectorTabActive : ""}
                onClick={() => setInspectorTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className={styles.inspectorBody}>
            {inspectorTab === "html" ? (
              <div className={styles.htmlDocument}>
                <div className={styles.documentMode}>
                  <button
                    type="button"
                    className={htmlMode === "preview" ? styles.documentModeActive : ""}
                    onClick={() => setHtmlMode("preview")}
                  >
                    <Icon name="eye" size={13} /> 미리보기
                  </button>
                  <button
                    type="button"
                    className={htmlMode === "code" ? styles.documentModeActive : ""}
                    onClick={() => setHtmlMode("code")}
                  >
                    <Icon name="code" size={13} /> 코드 보기
                  </button>
                  <span>{selected.markdownSha256.slice(0, 10)}</span>
                </div>
                {/*
                  문서 안의 모션은 스크립트가 돈다. allow-same-origin 은 주지 않아
                  불투명 출처에 갇히므로 부모 화면·쿠키·저장소에 닿지 못하고, 문서
                  자신의 CSP 가 script-src 를 해시 하나로 묶는다. 축소 미리보기는
                  여러 장이 동시에 움직이면 산만해 열지 않는다.
                */}
                {htmlMode === "preview" ? (
                  <iframe
                    className={styles.documentFrame}
                    srcDoc={selected.designHtml}
                    title={`${selected.name} DESIGN.html`}
                    sandbox="allow-scripts"
                  />
                ) : (
                  <pre className={styles.codeDocument}><code>{selected.designHtml}</code></pre>
                )}
              </div>
            ) : null}

            {inspectorTab === "markdown" ? (
              <pre className={styles.markdownDocument}><code>{selected.designMarkdown}</code></pre>
            ) : null}

            {inspectorTab === "source" ? (
              <div className={styles.sourceDocument}>
                <section>
                  <h3>출처</h3>
                  <dl>
                    <div><dt>이름</dt><dd>{selected.sourceName ?? "Expresso"}</dd></div>
                    <div><dt>유형</dt><dd>{ORIGIN_LABEL[selected.originKind]}</dd></div>
                    <div><dt>수집</dt><dd>{formatCapturedAt(selected.capturedAt)}</dd></div>
                    <div><dt>표기</dt><dd>{selected.attribution ?? "Expresso 기본 디자인"}</dd></div>
                  </dl>
                  {selected.sourceUrl ? (
                    <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                      Refero 스타일 열기 <Icon name="arrow-square-out" size={12} />
                    </a>
                  ) : null}
                  {selected.referenceLock.sources.length > 0 ? (
                    <ul className={styles.sourceLinks}>
                      {selected.referenceLock.sources.map((source) => (
                        <li key={`${source.name}-${source.url ?? "none"}`}>
                          {source.url ? (
                            <a href={source.url} target="_blank" rel="noreferrer">
                              {source.name} <Icon name="arrow-square-out" size={11} />
                            </a>
                          ) : source.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {selected.originKind === "reference" ? (
                    <p className={styles.referenceNotice}>Refero Styles의 공개 DESIGN.md를 변환한 비공식 참고입니다. 원본 자산과 카피는 포함하지 않습니다.</p>
                  ) : null}
                </section>
                <section>
                  <h3>현재 포트폴리오에 맞는 이유</h3>
                  <ul>{selected.fitReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </section>
                <section>
                  <h3>적용 규칙</h3>
                  <div className={styles.ruleGroup}>
                    <strong>보존</strong>
                    <ul>{selected.referenceLock.preserve.map((rule) => <li key={rule}>{rule}</li>)}</ul>
                  </div>
                  <div className={styles.ruleGroup}>
                    <strong>제외</strong>
                    <ul>{selected.referenceLock.reject.map((rule) => <li key={rule}>{rule}</li>)}</ul>
                  </div>
                </section>
              </div>
            ) : null}
          </div>

          <footer className={styles.inspectorFooter}>
            <div className={styles.selectionSummary}>
              <span>{selectedIsSaved ? "현재 적용한 디자인" : "선택한 디자인"}</span>
              <strong>{selected.name}</strong>
              {actionState.error ? <em role="alert">{actionState.error}</em> : null}
            </div>
            {selectedIsSaved ? (
              <Link
                href={`/brew/${brewId}/outline` as Route}
                className={styles.continueLink}
              >
                레시피로 계속 <Icon name="arrow-right" size={13} />
              </Link>
            ) : null}
            <form action={saveSelection}>
              <input type="hidden" name="brewId" value={brewId} />
              <input type="hidden" name="designSystemRevisionId" value={selected.revisionId} />
              <button type="submit" disabled={pending || selectedIsSaved}>
                {pending ? "적용하는 중" : selectedIsSaved ? (
                  <><Icon name="check" size={14} /> 적용됨</>
                ) : (
                  <>이 디자인 적용 <Icon name="arrow-right" size={14} /></>
                )}
              </button>
            </form>
          </footer>
        </aside>
      ) : (
        <button
          type="button"
          className={styles.openInspector}
          onClick={() => {
            setSelectedRevisionId(selectedRevisionId ?? entries[0]?.revisionId ?? null);
            setInspectorOpen(true);
          }}
        >
          <Icon name="sidebar-simple" size={16} /> 디자인 문서 열기
        </button>
      )}
    </div>
  );
}
