import type { TextRun } from "@expresso/contracts";
import type { ReactNode } from "react";

/**
 * 문장 안의 결.
 *
 * 표시는 다섯뿐이고 **전부 지면의 팔레트와 계단 안에서 논다** — 강조는 색이
 * 아니라 굵기와 형광이고, 코드는 서체다. 여기서 새 색이나 새 크기를 만들면
 * 지면마다 다른 팔레트를 쓰는 의미가 없어진다.
 *
 * 링크는 표시와 따로다. 강조하면서 링크일 수 있다.
 */

const MARK_CLASS = {
  strong: "font-semibold",
  emphasis: "italic",
  underline: "underline underline-offset-4 decoration-2 decoration-accent",
  // 형광은 강조색을 옅게 깐다. 글자색은 그대로 둬야 대비가 유지된다.
  highlight: "bg-accent/15",
  code: "font-mono text-step-1",
} as const;

function Run({ run }: { run: TextRun }) {
  const className = run.mark ? MARK_CLASS[run.mark] : undefined;

  if (run.href) {
    return (
      <a
        href={run.href}
        // 바깥으로 나가는 주소다. 여는 쪽 탭을 빼앗지 않고, 상대 창을 넘기지 않는다.
        target="_blank"
        rel="noopener noreferrer"
        className={`${className ?? ""} underline underline-offset-4 decoration-accent text-accent hover:opacity-70 transition-opacity`.trim()}
      >
        {run.text}
      </a>
    );
  }
  return className ? <span className={className}>{run.text}</span> : <>{run.text}</>;
}

/** run들을 그린다. 표시가 없는 글은 그냥 글자로 나간다 — 쓸데없는 span을 두지 않는다. */
export function RunsView({ runs }: { runs: readonly TextRun[] }): ReactNode {
  return runs.map((run, index) => <Run key={index} run={run} />);
}
