import type { TemplatePreview } from "@expresso/contracts";

import styles from "./page.module.css";

const GAP = { compact: 5, comfortable: 8, spacious: 12 } as const;

/**
 * 템플릿 썸네일.
 *
 * 전에는 템플릿마다 손으로 그린 SVG 여섯 장이었다. 그 그림은 어느 레시피에도
 * 매이지 않아서, **무엇이 어떻게 보일지는 알려주지 않고 분위기만 팔았다.**
 *
 * 지금은 서버가 낸 미리보기를 그린다 — 색도 서체도 밀도도 그 템플릿의 실제
 * style이고, 글은 이 레시피의 섹션 제목과 항목이다. 비어 있는 섹션은 비어
 * 있다고 보여준다(`state`). 채워 그리면 고르고 나서 알게 된다.
 */
export function TemplateThumb({ preview }: { preview: TemplatePreview }) {
  const { style } = preview;

  return (
    <span
      className={styles.thumb}
      style={{
        background: style.background,
        color: style.text,
        gap: `${GAP[style.density]}px`,
        fontFamily: style.font === "serif" ? "'Noto Serif KR', Georgia, serif" : "inherit",
      }}
    >
      {preview.sections.slice(0, 4).map((section) => (
        <span key={section.recipeSectionId} className={styles.thumbSection}>
          <span className={styles.thumbTitle} style={{ color: style.accent }}>
            {section.title}
          </span>
          {section.state === "empty" ? (
            <span className={styles.thumbEmpty} style={{ borderColor: style.text }}>
              비어 있음
            </span>
          ) : (
            section.content.slice(0, 2).map((line, index) => (
              <span key={index} className={styles.thumbLine}>
                {line}
              </span>
            ))
          )}
        </span>
      ))}
    </span>
  );
}
