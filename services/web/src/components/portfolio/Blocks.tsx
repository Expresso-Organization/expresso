import {
  normalizeListItem,
  parseChartContent,
  parseMediaContent,
  parseRuns,
  ListItemSchema,
  type PortfolioBlock,
} from "@expresso/contracts";

import { ChartView } from "./Chart";
import { MediaView } from "./Media";
import { RunsView } from "./Text";

/**
 * 블록의 DOM.
 *
 * 종류마다 **하나씩**이다. 표현의 변주는 전부 클래스가 한다 — 큰 수치와
 * 인라인 배지의 차이는 `text-step4 grid`와 `text-step1 inline-flex`의 차이지
 * 다른 마크업이 아니다. 그래서 표현을 늘리는 데 이 파일을 고칠 필요가 없다.
 *
 * 여기 남은 것은 **내용의 구조**뿐이다 — 수치는 값과 라벨이 갈려야 크게 세울 수
 * 있고, 목록은 항목이 나뉘어야 하고, 이름–값 쌍은 둘이 갈려야 나란히 설 수 있다.
 */

/** 지면이 블록에 주는 클래스들. 목록은 바깥 상자 말고 한 줄에도 붙는다. */
export interface BlockClassNames {
  className: string;
  itemClassName?: string | undefined;
  termClassName?: string | undefined;
}

function text(block: PortfolioBlock): string {
  const value = block.content["text"];
  return typeof value === "string" ? value : "";
}

function items(block: PortfolioBlock) {
  const value = block.content["items"];
  if (Array.isArray(value)) {
    const parsed = value.flatMap((item) => {
      const result = ListItemSchema.safeParse(item);
      return result.success ? [normalizeListItem(result.data)] : [];
    });
    if (parsed.length > 0) return parsed;
  }
  // 목록을 문단으로 저장한 경우도 있다. 줄 단위로 나눈다.
  return text(block)
    .split("\n")
    .map((line) => line.replace(/^[-·•]\s*/, "").trim())
    .filter(Boolean)
    .map((value) => ({ term: null, value }));
}

/** 수치는 값과 라벨이 갈려 있어야 크게 세울 수 있다. */
function metric(block: PortfolioBlock): { value: string; label: string } {
  const value = block.content["value"];
  const label = block.content["label"];
  if (typeof value === "string") {
    return { value, label: typeof label === "string" ? label : "" };
  }
  const raw = text(block).trim();
  const matched = /^([\d.,]+\s*\S{0,4})\s*(.*)$/s.exec(raw);
  return { value: matched?.[1]?.trim() ?? raw, label: matched?.[2]?.trim() ?? "" };
}

export function BlockView({
  block,
  classes,
}: {
  block: PortfolioBlock;
  classes: BlockClassNames;
}) {
  const { className, itemClassName, termClassName } = classes;

  switch (block.kind) {
    case "heading": {
      const runs = parseRuns(block.content);
      return <h2 className={className}>{runs ? <RunsView runs={runs} /> : text(block)}</h2>;
    }

    case "paragraph": {
      const runs = parseRuns(block.content);
      return <p className={className}>{runs ? <RunsView runs={runs} /> : text(block)}</p>;
    }

    case "list":
      return (
        <ul className={className}>
          {items(block).map((item) => (
            <li key={`${item.term ?? ""}${item.value}`} className={itemClassName}>
              {/*
                * 이름이 있으면 값과 갈라 둔다 — 지면이 둘을 다르게 세운다.
                * 기본 여백은 여기서 준다. 지면이 `justify-between`을 주면 그쪽이
                * 이기고, 아무것도 안 주면 이 한 칸이 둘을 붙지 않게 한다.
                */}
              {item.term ? (
                <span className={`mr-2 ${termClassName ?? ""}`.trim()}>{item.term}</span>
              ) : null}
              {item.term ? <span>{item.value}</span> : item.value}
            </li>
          ))}
        </ul>
      );

    case "metric": {
      const { value, label } = metric(block);
      return (
        <div className={className}>
          <span>{value}</span>
          {/* 지면이 간격을 안 주면 값과 라벨이 붙는다. 기본 여백은 여기서 준다. */}
          {label ? <span className="text-step-1 font-body opacity-70 ml-2">{label}</span> : null}
        </div>
      );
    }

    case "chart": {
      const chart = parseChartContent(block.content);
      // 깨진 그림은 자리만 차지한다. 없는 편이 낫다.
      if (!chart) return null;
      return (
        <div className={className}>
          <ChartView chart={chart} />
        </div>
      );
    }

    case "media": {
      const media = parseMediaContent(block.content);
      // 자산이 지워졌거나 옛 모양이면 자리만 차지한다. 없는 편이 낫다.
      if (!media) return null;
      return <MediaView media={media} className={className} />;
    }
  }
}
