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
  textPathLabel,
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

  return (
    <div className={styles.properties}>
      <div className={styles.targetCard}>
        <Icon name="crosshair-simple" size={15} color="var(--ex-fg-muted)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.targetName}>{STRUCTURED_TYPE_LABELS[node.type] ?? node.type}</div>
          {title ? <div className={styles.targetPath}>{title}</div> : null}
        </div>
      </div>

      {fields.length ? (
        <div className={styles.propGroup}>
          <div className={styles.propGroupHead}>
            <span className={styles.propGroupLabel}>모양</span>
            <span className={styles.propGroupRule} />
          </div>
          <div className={styles.propRows}>
            {fields.map((field) => {
              const value = field.name in props ? props[field.name] : (savedProps[field.name] as string | undefined);
              return (
                <div key={field.name} className={styles.propRow}>
                  <span className={styles.propLabel}>{field.label}</span>
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
          </div>
        </div>
      ) : null}

      {parts.map(([name, partInfo]) => {
        const value = style[name] ?? {};
        const at = value.size ? steps.findIndex((step) => step.name === value.size) : -1;
        // 기본 크기에서 한 단계 움직이면 지금 크기보다 바로 크거나 작은 단계로 간다.
        const natural = naturalSizes[name];
        const larger = at >= 0 ? at + 1 : natural === undefined ? 0 : steps.findIndex((step) => (pixels(step.size) ?? Infinity) > natural + 0.5);
        const smaller = at >= 0 ? at - 1 : natural === undefined ? -1 : steps.findLastIndex((step) => (pixels(step.size) ?? Infinity) < natural - 0.5);
        return (
          <div key={name} className={`${styles.propGroup} ${name === part ? styles.propGroupPicked : ""}`}>
            <div className={styles.propGroupHead}>
              <span className={styles.propGroupLabel}>{partInfo.label}</span>
              <span className={styles.propGroupRule} />
            </div>
            <div className={styles.propRows}>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>색</span>
                <span className={styles.swatchRow} role="group" aria-label={`${partInfo.label} 색`}>
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
                  <button
                    type="button"
                    aria-pressed={!value.color}
                    className={`${styles.inherit} ${!value.color ? styles.inheritOn : ""}`}
                    onClick={() => setPart(name, { color: undefined })}
                  >
                    기본
                  </button>
                </span>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>서체</span>
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
              <div className={styles.propRow}>
                <span className={styles.propLabel}>크기</span>
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
                <span className={styles.propNote}>{at >= 0 ? steps[at]!.size : natural !== undefined ? `${Math.round(natural)}px` : null}</span>
              </div>
            </div>
          </div>
        );
      })}

      {paths.length ? (
        <div className={styles.propGroup}>
          <div className={styles.propGroupHead}>
            <span className={styles.propGroupLabel}>글</span>
            <span className={styles.propGroupRule} />
          </div>
          <div className={styles.propRows}>
            {paths.map((path) => {
              const label = textPathLabel(snapshot, path, { section: spansSections });
              const value = texts[path] ?? readStructuredText(snapshot.content, path) ?? "";
              const change = (next: string) => setTexts((previous) => ({ ...previous, [path]: next }));
              return (
                <label key={path} className={styles.propField}>
                  <span className={styles.propLabel}>{label}</span>
                  {MULTILINE.test(path) ? (
                    <textarea className={styles.textArea} rows={3} value={value} onChange={(event) => change(event.target.value)} />
                  ) : (
                    <input className={styles.textInput} value={value} onChange={(event) => change(event.target.value)} />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {state.error ? <p className={styles.panelError}>{state.error}</p> : null}
      <div className={styles.propActions}>
        <button
          type="button"
          className={styles.revertButton}
          disabled={!dirty || saving}
          onClick={() => { setProps({}); setStyle(savedStyle); setTexts({}); }}
        >
          되돌리기
        </button>
        <button type="button" className={styles.propSave} disabled={!dirty || saving} onClick={submit}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
