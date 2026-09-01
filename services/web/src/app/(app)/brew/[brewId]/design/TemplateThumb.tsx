import type { TemplatePreview } from "@expresso/contracts";
import type { CSSProperties } from "react";

import styles from "./template-thumb.module.css";

// 이름을 생략하지 않고 조판할 줄바꿈 위치입니다. 목록에 없는 이름도 그대로 표시합니다.
const TITLE_BREAKS = new Map<string, number[]>([
  ["monochrome", [4]], ["bauhaus", [3]], ["modern-dark", [7]],
  ["newsprint", [4]], ["swiss-minimalist", [6]], ["flat-design", [5]],
  ["art-deco", [4]], ["material-design", [9]], ["neo-brutalism", [4]],
  ["bold-typography", [5, 9]], ["cyberpunk", [5]],
  ["playful-geometric", [8, 11]], ["minimal-dark", [8]],
  ["claymorphism", [4]], ["professional", [6]], ["vaporwave", [5]],
  ["enterprise", [5]], ["industrial", [5]], ["neumorphism", [3]],
  ["maximalism", [4]],
]);

/** 내용과 무관한 디자인 견본. 이름과 서체·색면·여백만으로 스타일을 비교합니다. */
export function TemplateThumb({ preview }: { preview: Pick<TemplatePreview, "code" | "name" | "style"> }) {
  const { style } = preview;
  const styleCode = preview.code.replace(/^designprompts-/, "");
  const offsets = [0, ...(TITLE_BREAKS.get(styleCode) ?? []), preview.name.length];
  const lines = offsets.slice(0, -1).map((start, i) => preview.name.slice(start, offsets[i + 1]));
  const longestLine = Math.max(1, ...lines.map((line) => line.trim().length));

  return (
    <span
      className={styles.thumb}
      data-style={styleCode}
      data-structure={style.structure}
      aria-hidden="true"
      style={{
        "--thumb-bg": style.background,
        "--thumb-text": style.text,
        "--thumb-accent": style.accent,
        "--poster-title-scale": `${Math.min(28, 130 / longestLine)}cqw`,
        "--poster-title-max": lines.length > 2 ? "var(--ex-text-4xl)" : "var(--ex-text-display-md)",
        fontFamily: style.font === "serif" ? "'Noto Serif KR', Georgia, serif"
          : style.font === "mono" ? "var(--ex-font-mono)" : "var(--ex-font-ui)",
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
