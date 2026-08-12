import type { LayoutItem, LayoutSpec, PortfolioDetail } from "@expresso/contracts";
import { checkClassName } from "@expresso/contracts";
import type { ReactNode } from "react";

// 지면 유틸리티는 이 컴포넌트를 쓰는 화면에만 실린다. preflight를 가져오지
// 않아 앱 UI에 리셋이 새지 않는다.
import "@/styles/portfolio-utilities.css";

import { BlockView, type BlockClassNames } from "./Blocks";
import { classesFor, fallbackSpec, layoutVariables, orderedSections } from "./layout";

type Block = PortfolioDetail["sections"][number]["blocks"][number];
type Section = PortfolioDetail["sections"][number];

/**
 * 포트폴리오 지면.
 *
 * 이 컴포넌트 하나가 공개 사이트 · 03 후보 미리보기 · 08 배포 미리보기에
 * 모두 쓰인다. 미리보기가 실제 지면과 달라지면 고르는 의미가 없다.
 *
 * 지면의 모양은 전부 스펙이 정한다. 여기에는 배치 규칙이 없고, **나무를 그대로
 * 내려가며 상자를 열고 닫는 일**만 한다.
 */
export function PortfolioPage({
  portfolio,
  spec,
  wrapBlock,
}: {
  portfolio: PortfolioDetail;
  /** 고른 지면 대신 다른 후보로 그릴 때만 준다 — 03의 나란히 보기가 그렇다. */
  spec?: LayoutSpec | null;
  /**
   * 블록마다 겉을 한 겹 두른다. 04 편집 캔버스가 고르기 테두리를 붙일 때 쓴다.
   *
   * 편집 화면이 제 나름의 마크업으로 지면을 흉내 내면 **편집하는 것과 나가는 것이
   * 달라진다.** 그래서 04도 이 컴포넌트를 쓰고, 다른 점은 이 한 겹뿐이다.
   */
  wrapBlock?: (block: Block, rendered: ReactNode) => ReactNode;
}) {
  // 아직 지면을 만들지 않았으면 가장 단순한 배치로 눕힌다.
  const layout = spec ?? portfolio.layout ?? fallbackSpec(portfolio);

  return (
    // `pf-page`는 스펙의 어휘가 아니라 렌더러의 표식이다 — 섹션 사이 기본 간격이
    // 이 표식에 걸린다(특정도 0이라 스펙이 언제든 덮어쓴다).
    <article className={`pf-page ${layout.pageClassName}`} style={layoutVariables(layout)}>
      {orderedSections(portfolio, layout).map(({ section, placement }) => (
        <SectionView
          key={section.id}
          section={section}
          placement={placement}
          layout={layout}
          {...(wrapBlock ? { wrapBlock } : {})}
        />
      ))}
    </article>
  );
}

function SectionView({
  section,
  placement,
  layout,
  wrapBlock,
}: {
  section: Section;
  placement: LayoutSpec["sections"][number];
  layout: LayoutSpec;
  wrapBlock?: (block: Block, rendered: ReactNode) => ReactNode;
}) {
  const byId = new Map(section.blocks.map((block) => [block.id, block]));
  const placed = new Set(placedBlockIds(placement.items));
  // 지면이 빠뜨린 블록은 버리지 않고 뒤에 붙인다. 배치의 실수로 문장이
  // 사라지면 그건 표현이 아니라 사고다.
  const leftover = section.blocks.filter((block) => !placed.has(block.id));

  // 안에 제목 블록이 있으면 섹션 이름은 중복이다.
  const labelText = section.blocks.some((block) => block.kind === "heading")
    ? null
    : section.title;
  const label = labelText
    ? (className?: string) => (
      // 이름표는 그리드의 한 칸이 아니라 **줄 하나**다. col-span-full이 없으면
      // 3단 격자에서 이름표가 첫 칸을 먹고 내용이 한 칸씩 밀린다.
      <p className={`${className ?? layout.sectionLabelClassName} col-span-full`}>{labelText}</p>
    )
    : null;

  const render = (block: Block, classes: BlockClassNames) => {
    const rendered = <BlockView block={block} classes={classes} />;
    return wrapBlock ? wrapBlock(block, rendered) : rendered;
  };

  const items = renderItems(placement.items, { byId, layout, label, render });
  // 나무가 이름표 자리를 정하지 않았으면 맨 앞에 세운다.
  const labelFirst = label && !hasLabel(placement.items) ? label() : null;

  return (
    <section className={placement.className}>
      <div className={placement.innerClassName}>
        {labelFirst}
        {items}
        {leftover.map((block) => (
          <div key={block.id} style={{ display: "contents" }}>
            {render(block, { className: classesFor(block, layout) })}
          </div>
        ))}
      </div>
    </section>
  );
}

interface RenderContext {
  byId: Map<string, Block>;
  layout: LayoutSpec;
  label: ((className?: string) => ReactNode) | null;
  render: (block: Block, classes: BlockClassNames) => ReactNode;
}

/** 지면이 준 클래스도 검증을 지난다 — 통과한 것만 그려진다. */
function cleanClassName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const accepted = checkClassName(value).accepted;
  return accepted === "" ? undefined : accepted;
}

/** 나무를 그대로 내려간다. 묶음은 상자 하나, 잎은 블록 하나다. */
function renderItems(
  items: readonly LayoutItem[],
  context: RenderContext,
  path = "",
): ReactNode[] {
  return items.flatMap((item, index) => {
    const key = `${path}${index}`;
    if (item.kind === "label") {
      return context.label ? [<div key={key} style={{ display: "contents" }}>{context.label(item.className)}</div>] : [];
    }
    if (item.kind === "group") {
      return [
        <div key={key} className={item.className}>
          {renderItems(item.items as readonly LayoutItem[], context, `${key}.`)}
        </div>,
      ];
    }
    const block = context.byId.get(item.blockId);
    if (!block) return [];
    return [
      <div key={key} style={{ display: "contents" }}>
        {context.render(block, {
          className: classesFor(block, context.layout, item.className),
          // 목록 한 줄과 이름 쪽은 지면이 따로 정한다. 칩과 스펙 행이 여기서 나온다.
          itemClassName: cleanClassName(item.itemClassName),
          termClassName: cleanClassName(item.termClassName),
        })}
      </div>,
    ];
  });
}

function placedBlockIds(items: readonly LayoutItem[]): string[] {
  return items.flatMap((item) => {
    if (item.kind === "block") return [item.blockId];
    if (item.kind === "group") return placedBlockIds(item.items as readonly LayoutItem[]);
    return [];
  });
}

function hasLabel(items: readonly LayoutItem[]): boolean {
  return items.some((item) =>
    item.kind === "label"
    || (item.kind === "group" && hasLabel(item.items as readonly LayoutItem[])));
}
