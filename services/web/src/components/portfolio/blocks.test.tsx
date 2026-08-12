import type { PortfolioBlock } from "@expresso/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlockView } from "./Blocks";

/**
 * 블록이 실제로 어떤 DOM으로 나가는가.
 *
 * 새로 생긴 것 셋을 지킨다 — 문장 안의 결(run), 칩이 될 수 있는 목록 한 줄,
 * 이름–값 쌍. 셋 다 **블록 종류를 늘리지 않고** 만든 것이라, 마크업이 어긋나면
 * 지면이 아무리 잘 짜여도 그대로 안 나온다.
 */

function block(kind: PortfolioBlock["kind"], content: Record<string, unknown>): PortfolioBlock {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    orderNo: 0,
    kind,
    content,
    style: {},
    sourceRecordId: null,
    syncState: "synced",
    locked: false,
  };
}

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe("블록 DOM", () => {
  it("문장 안의 핵심 낱말만 강조한다", () => {
    const html = render(<BlockView
      block={block("paragraph", {
        text: "정산 배치를 24분으로 줄였습니다.",
        runs: [
          { text: "정산 배치를 " },
          { text: "24분", mark: "strong" },
          { text: "으로 줄였습니다." },
        ],
      })}
      classes={{ className: "text-step0" }}
    />);
    expect(html).toContain('<span class="font-semibold">24분</span>');
    // 표시 없는 토막에는 쓸데없는 span을 두지 않는다.
    expect(html).toContain("정산 배치를 ");
    expect(html.match(/<span/g)).toHaveLength(1);
  });

  it("링크는 새 탭으로 열고 상대 창을 넘기지 않는다", () => {
    const html = render(<BlockView
      block={block("paragraph", {
        text: "논문",
        runs: [{ text: "논문", href: "https://example.com/paper" }],
      })}
      classes={{ className: "" }}
    />);
    expect(html).toContain('href="https://example.com/paper"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("목록 한 줄에 클래스가 붙어 칩이 된다", () => {
    const html = render(<BlockView
      block={block("list", { items: ["Kotlin", "Spring Boot"] })}
      classes={{ className: "flex flex-wrap gap-2", itemClassName: "rounded-full border px-3" }}
    />);
    expect(html).toContain('<li class="rounded-full border px-3">Kotlin</li>');
  });

  it("이름–값 쌍은 둘이 갈려 나온다 — 이름 쪽만 조용하게 만들 수 있다", () => {
    const html = render(<BlockView
      block={block("list", {
        items: [{ term: "기간", value: "2022.03 – 2026.02" }, "그냥 항목"],
      })}
      classes={{ className: "", itemClassName: "flex justify-between", termClassName: "text-muted" }}
    />);
    expect(html).toContain('<span class="mr-2 text-muted">기간</span>');
    expect(html).toContain("<span>2022.03 – 2026.02</span>");
    // 쌍이 아닌 항목은 그대로 한 덩어리다.
    expect(html).toContain(">그냥 항목</li>");
  });

  it("지면이 간격을 안 줘도 이름과 값이 붙지 않는다", () => {
    // 칩 클래스처럼 `justify-between`이 없는 배치에서 둘이 맞붙던 자리다.
    const html = render(<BlockView
      block={block("list", { items: [{ term: "언어", value: "Kotlin" }] })}
      classes={{ className: "", itemClassName: "inline-flex rounded-full border px-3" }}
    />);
    expect(html).toContain('<span class="mr-2">언어</span>');
  });

  it("옛 블록도 그대로 그린다 — runs도 items도 없던 시절의 것", () => {
    const html = render(<BlockView
      block={block("list", { text: "- 첫째\n- 둘째" })}
      classes={{ className: "list-disc" }}
    />);
    expect(html).toContain("<li>첫째</li>");
    expect(html).toContain("<li>둘째</li>");
  });
});
