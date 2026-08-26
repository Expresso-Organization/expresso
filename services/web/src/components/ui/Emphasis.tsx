import { Fragment, type ReactNode } from "react";

/**
 * 정의서 본문은 강조 어절을 `<b>`로, 형광 어절을 crema 배경으로 표시합니다.
 * 예시 데이터에서는 둘 다 `**...**`로 적고 여기서 갈라 렌더합니다.
 */
export function Emphasis({
  text,
  mode = "bold",
}: {
  text: string;
  /** bold = ink-900 굵게, highlight = crema 형광 */
  mode?: "bold" | "highlight";
}): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 0 ? (
      <Fragment key={index}>{part}</Fragment>
    ) : mode === "highlight" ? (
      <span
        key={index}
        style={{
          background: "var(--ex-accent-surface)",
          color: "var(--ex-fg)",
          borderRadius: "3px",
          padding: "1px 3px",
        }}
      >
        {part}
      </span>
    ) : (
      <b key={index} style={{ color: "var(--ex-fg)", fontWeight: 600 }}>
        {part}
      </b>
    ),
  );
}
