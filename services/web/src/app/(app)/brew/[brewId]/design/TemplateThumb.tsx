import type { TemplatePreview } from "@expresso/contracts";
import type { CSSProperties } from "react";

import styles from "./template-thumb.module.css";

const GAP = { compact: 5, comfortable: 8, spacious: 12 } as const;

/**
 * 템플릿 썸네일.
 *
 * 내용에 영향을 받지 않는 디자인 견본입니다. 서체·색면·간격·경계만 비교합니다.
 * 문구는 디자인 이름만 씁니다. 레시피 내용은 받지 않습니다.
 * 카드 내부 지면의 색은 앱 테마 토큰이 아니라 선택한 스타일을 따릅니다.
 */
export function TemplateThumb({ preview }: { preview: Pick<TemplatePreview, "code" | "name" | "style"> }) {
  const { style } = preview;
  const longestWord = Math.max(...preview.name.split(/\s+/).map((word) => word.length));

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
        "--thumb-title-scale": `${Math.min(18, 125 / longestWord)}cqw`,
        "--thumb-title-size": preview.name.length > 13 ? "var(--ex-text-3xl)"
          : preview.name.length > 9 ? "var(--ex-text-4xl)" : "var(--ex-text-display-sm)",
        fontFamily: style.font === "serif" ? "'Noto Serif KR', Georgia, serif"
          : style.font === "mono" ? "var(--ex-font-mono)" : "var(--ex-font-ui)",
      } as CSSProperties}
    >
      <span className={styles.thumbSection}>
        <span className={styles.thumbTitle}>{preview.name}</span>
      </span>
      <span className={styles.thumbSection}>
        <span className={styles.colorStudy}>
          <span /><span /><span />
        </span>
        <span className={styles.sampleRule} />
      </span>
      <span className={styles.thumbSection}>
        <span className={styles.weightStudy}>
          <span /><span /><span />
        </span>
      </span>
    </span>
  );
}
