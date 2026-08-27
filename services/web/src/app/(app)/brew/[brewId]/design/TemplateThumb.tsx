import type { TemplatePreview } from "@expresso/contracts";
import type { CSSProperties } from "react";

import styles from "./template-thumb.module.css";

const GAP = { compact: 5, comfortable: 8, spacious: 12 } as const;

/**
 * 템플릿 썸네일.
 *
 * 서버가 낸 실제 팔레트와 레시피 글에 스타일의 시각적 특징을 적용합니다.
 * 생성 결과의 축소판은 아닙니다. 비어 있는 섹션은 채워 꾸미지 않습니다.
 * 카드 내부 지면의 색은 앱 테마 토큰이 아니라 선택한 스타일을 따릅니다.
 */
export function TemplateThumb({ preview }: { preview: TemplatePreview }) {
  const { style } = preview;

  return (
    <span
      className={styles.thumb}
      data-style={preview.code.replace(/^designprompts-/, "")}
      data-structure={style.structure}
      aria-hidden="true"
      style={{
        "--thumb-bg": style.background,
        "--thumb-text": style.text,
        "--thumb-accent": style.accent,
        "--thumb-gap": `${GAP[style.density]}px`,
        fontFamily: style.font === "serif" ? "'Noto Serif KR', Georgia, serif"
          : style.font === "mono" ? "var(--ex-font-mono)" : "var(--ex-font-ui)",
      } as CSSProperties}
    >
      {preview.sections.slice(0, 4).map((section) => (
        <span key={section.recipeSectionId} className={styles.thumbSection}>
          <span className={styles.thumbTitle}>
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
