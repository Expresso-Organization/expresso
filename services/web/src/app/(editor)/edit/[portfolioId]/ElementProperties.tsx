"use client";

import {
  readStructuredText,
  STRUCTURED_STYLE_COLORS,
  STRUCTURED_STYLE_FONTS,
  type PageEditorDesign,
  type StructuredElementStyle,
  type StructuredPartStyle,
  type StructuredPortfolioSnapshot,
} from "@expresso/contracts";
import {
  STRUCTURED_PARTS,
  STRUCTURED_TYPE_LABELS,
  STYLE_COLOR_LABELS,
  editableFields,
  elementStyleCss,
  elementTextPaths,
  textPathParts,
} from "@expresso/portfolio-renderer/editing";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";

import { structuredPageAction } from "./edit-actions";
import styles from "./page.module.css";

/** 디자인 단계의 길이를 px로 읽는다. rem · em은 문서 기본 16px 기준이다. 읽지 못하면 null이다. */
function pixels(value: string): number | null {
  const match = /^(\d*\.?\d+)(rem|em|px)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === "px" ? 1 : 16) : null;
}

const FONT_LABELS: Record<string, string> = { display: "제목", body: "본문", mono: "고정폭" };

/** 여러 줄로 고치는 칸. 나머지는 한 줄이다. */
const MULTILINE = /\/(?:body|intro|summary|text|quote)$/;

/**
 * 04b 속성 탭 — 고른 요소를 직접 고친다.
 *
 * 칸은 부품 정의에서 온다. 모양 선택지는 카탈로그 props, 글자 부분은 렌더러의 부분 표, 글은 요소가 보여 주는 글의 경로다.
 * 색 · 서체 · 글자 크기는 이 포트폴리오 디자인의 역할 · 단계 안에서 고른다. 고르는 동안 미리보기에 바로 덧입히고, 저장하면
 * 새 판이 된다.
 */
export function ElementProperties({
  snapshot,
  elementKey,
  part,
  naturalSizes,
  design,
  portfolioId,
  revision,
  onDraftCss,
}: {
  snapshot: StructuredPortfolioSnapshot;
  elementKey: string;
  /** 미리보기에서 누른 글자 부분. 그 부분을 맨 위에 둔다. */
  part: string | null;
  /** 미리보기가 잰 글자 부분별 지금 크기(px). 크기 조절이 이 크기와 가장 가까운 단계에서 시작한다. */
  naturalSizes: Record<string, number>;
  design: PageEditorDesign | null;
  portfolioId: string;
  revision: number;
  onDraftCss: (css: string) => void;
}) {
  const node = snapshot.spec.elements[elementKey];
  const savedProps = (node?.props ?? {}) as Record<string, unknown>;
  const savedStyle = (savedProps.style ?? {}) as StructuredElementStyle;
  const [props, setProps] = useState<Record<string, string | undefined>>({});
  const [style, setStyle] = useState<StructuredElementStyle>(savedStyle);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [state, save, saving] = useActionState(structuredPageAction, {});
  /** 사용자가 펼치거나 접은 글자 부분. 미리보기에서 누른 부분(`part`)이 바뀌면 이 선택은 잊는다. */
  const [toggle, setToggle] = useState<{ forPart: string | null; open: string | null } | null>(null);
  const [, startTransition] = useTransition();

  const fields = node ? editableFields(node.type) : [];
  const parts = Object.entries(STRUCTURED_PARTS[node?.type ?? ""] ?? {}).sort(([a], [b]) => Number(b === part) - Number(a === part));
  const paths = elementTextPaths(snapshot, elementKey);
  // 여러 섹션의 글을 보이는 요소(목차 · 수치 띠)만 칸 이름에 섹션 제목을 붙인다.
  const spansSections = new Set(paths.filter((path) => path.startsWith("/sections/")).map((path) => path.split("/")[2])).size > 1;
  const styleChanged = JSON.stringify(style) !== JSON.stringify(savedStyle);
  const propsChanged = Object.entries(props).some(([name, value]) => value !== savedProps[name]);
  const patches = Object.entries(texts)
    .filter(([path, value]) => value !== (readStructuredText(snapshot.content, path) ?? ""))
    .map(([path, value]) => ({ path, value }));
  const dirty = styleChanged || propsChanged || patches.length > 0;

  function draftSpec() {
    const spec = structuredClone(snapshot.spec);
    const target = spec.elements[elementKey]!.props as Record<string, unknown>;
    for (const [name, value] of Object.entries(props)) {
      if (value === undefined) delete target[name];
      else target[name] = value;
    }
    const cleaned = Object.fromEntries(Object.entries(style).filter(([, value]) => Object.values(value).some((item) => item !== undefined)));
    if (Object.keys(cleaned).length) target.style = cleaned;
    else delete target.style;
    return spec;
  }

  // 고르는 동안의 글자 모양을 미리보기에 덧입힌다. 이 요소의 규칙만 낸다.
  useEffect(() => {
    if (!node || !styleChanged) { onDraftCss(""); return; }
    onDraftCss(elementStyleCss({ root: elementKey, elements: { [elementKey]: { ...node, props: { ...node.props, style } } } } as never));
  }, [style, styleChanged, node, elementKey, onDraftCss]);
  useEffect(() => () => onDraftCss(""), [onDraftCss]);

  if (!node) return null;

  function setPart(name: string, patch: Partial<StructuredPartStyle>) {
    setStyle((previous) => {
      const next = { ...previous[name], ...patch };
      for (const key of Object.keys(next) as (keyof StructuredPartStyle)[]) if (next[key] === undefined) delete next[key];
      const result = { ...previous, [name]: next };
      if (!Object.keys(next).length) delete result[name];
      return result;
    });
  }

  function submit() {
    const form = new FormData();
    form.set("portfolioId", portfolioId);
    form.set("payload", JSON.stringify({
      expectedRevision: revision,
      ...(styleChanged || propsChanged ? { spec: draftSpec() } : {}),
      patches,
    }));
    startTransition(() => save(form));
  }

  const steps = design?.steps ?? [];
  const title = paths.length ? readStructuredText(snapshot.content, paths[0]!) : null;
  // 글 칸을 묶음(「수치 1」 · 섹션 제목)으로 모은다. 묶음 없는 칸이 먼저 온다.
  const textGroups: { key: string; section: string | null; item: string | null; fields: { path: string; field: string }[] }[] = [];
  for (const path of paths) {
    const { section, item, field } = textPathParts(snapshot, path, { section: spansSections });
    const key = `${section ?? ""}|${item ?? ""}`;
    const found = textGroups.find((one) => one.key === key);
    if (found) found.fields.push({ path, field });
    else textGroups.push({ key, section, item, fields: [{ path, field }] });
  }
  const changedParts = parts.filter(([name]) => JSON.stringify(style[name] ?? {}) !== JSON.stringify(savedStyle[name] ?? {})).length;
  const changedProps = Object.entries(props).filter(([name, value]) => value !== savedProps[name]).length;
  const changes = patches.length + changedParts + changedProps;
  // 펼친 글자 부분. 미리보기에서 다른 부분을 누르면 그 부분이 펼쳐진다.
  const openPart = toggle && toggle.forPart === part ? toggle.open : (part ?? parts[0]?.[0] ?? null);
  const sizeOf = (name: string) => {
    const value = style[name] ?? {};
    const at = value.size ? steps.findIndex((step) => step.name === value.size) : -1;
    const natural = naturalSizes[name];
    return { at, natural, label: at >= 0 ? steps[at]!.size : natural !== undefined ? `${Math.round(natural)}px` : null };
  };

  return (
    <div className={styles.elementPanel}>
      <div className={styles.elementScroll}>
        <div className={styles.targetCard}>
          <Icon name="crosshair-simple" size={15} color="var(--ex-fg-muted)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.targetName}>{STRUCTURED_TYPE_LABELS[node.type] ?? node.type}</div>
            {title ? <div className={styles.targetPath}>{title}</div> : null}
          </div>
        </div>

        {textGroups.length ? (
          <section className={styles.elementSection} aria-label="글">
            <h3 className={styles.elementHeading}>글</h3>
            {textGroups.map(({ key, section, item, fields: groupFields }) => (
              <div key={key} className={styles.textGroup}>
                {section || item ? (
                  <div className={styles.textGroupName}>
                    {section ? <span className={styles.textGroupSection}>{section}</span> : null}
                    {item ? <span className={styles.textGroupItem}>{item}</span> : null}
                  </div>
                ) : null}
                {groupFields.map(({ path, field }) => {
                  const value = texts[path] ?? readStructuredText(snapshot.content, path) ?? "";
                  const edited = value !== (readStructuredText(snapshot.content, path) ?? "");
                  const change = (next: string) => setTexts((previous) => ({ ...previous, [path]: next }));
                  const id = `text-${elementKey}-${path}`;
                  return (
                    <div key={path} className={styles.elementRow}>
                      <label htmlFor={id} className={`${styles.elementLabel} ${edited ? styles.elementLabelEdited : ""}`}>{field}</label>
                      {MULTILINE.test(path) ? (
                        <textarea id={id} className={styles.textArea} rows={3} value={value} onChange={(event) => change(event.target.value)} />
                      ) : (
                        <input id={id} className={styles.textInput} value={value} onChange={(event) => change(event.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ) : null}

        {fields.length ? (
          <section className={styles.elementSection} aria-label="모양">
            <h3 className={styles.elementHeading}>모양</h3>
            {fields.map((field) => {
              const value = field.name in props ? props[field.name] : (savedProps[field.name] as string | undefined);
              return (
                <div key={field.name} className={styles.elementRow}>
                  <span className={styles.elementLabel}>{field.label}</span>
                  <span className={styles.weightSegment} role="group" aria-label={field.label}>
                    {field.options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={value === option.value}
                        className={`${styles.weightOption} ${value === option.value ? styles.weightOptionActive : ""}`}
                        onClick={() => setProps((previous) => ({ ...previous, [field.name]: option.value }))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </section>
        ) : null}

        {parts.length ? (
          <section className={styles.elementSection} aria-label="글자">
            <h3 className={styles.elementHeading}>글자</h3>
            {parts.map(([name, partInfo]) => {
              const value = style[name] ?? {};
              const { at, natural, label: sizeLabel } = sizeOf(name);
              // 기본 크기에서 한 단계 움직이면 지금 크기보다 바로 크거나 작은 단계로 간다.
              const larger = at >= 0 ? at + 1 : natural === undefined ? 0 : steps.findIndex((step) => (pixels(step.size) ?? Infinity) > natural + 0.5);
              const smaller = at >= 0 ? at - 1 : natural === undefined ? -1 : steps.findLastIndex((step) => (pixels(step.size) ?? Infinity) < natural - 0.5);
              const open = openPart === name;
              const summary = [
                value.color ? STYLE_COLOR_LABELS[value.color] : null,
                value.font ? FONT_LABELS[value.font] : null,
                sizeLabel,
              ].filter(Boolean).join(" · ") || "기본";
              const panelId = `part-${elementKey}-${name}`;
              return (
                <div key={name} className={`${styles.partBlock} ${open ? styles.partBlockOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.partHead}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setToggle({ forPart: part, open: open ? null : name })}
                  >
                    <span className={styles.partName}>{partInfo.label}</span>
                    {open ? null : (
                      <span className={styles.partSummary}>
                        {value.color ? <span className={styles.partDot} style={{ background: design?.colors[value.color] }} aria-hidden="true" /> : null}
                        {summary}
                      </span>
                    )}
                    <Icon name="caret-down" size={12} color="var(--ex-fg-subtle)" className={styles.partCaret} />
                  </button>
                  {open ? (
                    <div id={panelId} className={styles.partBody}>
                      <div className={styles.elementRow}>
                        <span className={styles.elementLabel}>색</span>
                        <span className={styles.swatchRow} role="group" aria-label={`${partInfo.label} 색`}>
                          <button
                            type="button"
                            aria-pressed={!value.color}
                            className={`${styles.swatchDefault} ${!value.color ? styles.colorSwatchOn : ""}`}
                            onClick={() => setPart(name, { color: undefined })}
                          >
                            기본
                          </button>
                          {STRUCTURED_STYLE_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              aria-label={STYLE_COLOR_LABELS[color]}
                              title={STYLE_COLOR_LABELS[color]}
                              aria-pressed={value.color === color}
                              className={`${styles.colorSwatch} ${value.color === color ? styles.colorSwatchOn : ""}`}
                              style={{ background: design?.colors[color] }}
                              onClick={() => setPart(name, { color })}
                            />
                          ))}
                        </span>
                      </div>
                      <div className={styles.elementRow}>
                        <span className={styles.elementLabel}>서체</span>
                        <span className={styles.weightSegment} role="group" aria-label={`${partInfo.label} 서체`}>
                          {[undefined, ...STRUCTURED_STYLE_FONTS].map((font) => (
                            <button
                              key={font ?? "default"}
                              type="button"
                              aria-pressed={value.font === font}
                              title={font ? design?.fonts[font] : undefined}
                              className={`${styles.weightOption} ${value.font === font ? styles.weightOptionActive : ""}`}
                              onClick={() => setPart(name, { font })}
                            >
                              {font ? FONT_LABELS[font] : "기본"}
                            </button>
                          ))}
                        </span>
                      </div>
                      <div className={styles.elementRow}>
                        <span className={styles.elementLabel}>크기</span>
                        <span className={styles.sizeControl}>
                          <span className={styles.stepper} role="group" aria-label={`${partInfo.label} 크기`}>
                            <button
                              type="button"
                              className={styles.stepperButton}
                              aria-label="한 단계 작게"
                              disabled={smaller < 0 && at < 0}
                              onClick={() => setPart(name, { size: smaller >= 0 ? steps[smaller]!.name : undefined })}
                            >
                              −
                            </button>
                            <span className={styles.stepperValue}>{at < 0 ? "기본" : steps[at]!.name}</span>
                            <button
                              type="button"
                              className={`${styles.stepperButton} ${styles.stepperRight}`}
                              aria-label="한 단계 크게"
                              disabled={larger < 0 || larger >= steps.length}
                              onClick={() => setPart(name, { size: steps[larger]!.name })}
                            >
                              ＋
                            </button>
                          </span>
                          {sizeLabel ? <span className={styles.propNote}>{sizeLabel}</span> : null}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}
      </div>

      <div className={`${styles.elementDock} ${dirty ? styles.elementDockDirty : ""}`}>
        {state.error ? <p className={styles.dockError}>{state.error}</p> : null}
        <div className={styles.dockRow}>
          <span className={styles.dockCount} aria-live="polite">{dirty ? `바뀐 곳 ${changes}` : "바뀐 곳 없음"}</span>
          <button
            type="button"
            className={styles.dockCancel}
            disabled={!dirty || saving}
            onClick={() => { setProps({}); setStyle(savedStyle); setTexts({}); }}
          >
            변경 취소
          </button>
          <button type="button" className={styles.dockSave} disabled={!dirty || saving} onClick={submit}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
