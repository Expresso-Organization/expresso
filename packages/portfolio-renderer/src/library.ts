import { createRequire } from "node:module";
import React from "react";
import { components } from "./collected/components.mjs";
import { sourceCss } from "./collected/styles.mjs";
import { SourceBindingContext, type SourceBinding } from "./source-jsx.js";
import type {
  StructuredPortfolioSpec,
  PageLibraryItem,
  PageLibrarySearch,
  StructuredPortfolioContent,
} from "@expresso/contracts";
interface Runtime {
  slot: "intro" | "section";
  key: string;
  props: { name: string; type: string; required: boolean }[];
  material: string;
  sha256: string;
  revision: string | null;
  license: string | null;
  adaptation: string;
  boundDetails: number;
}
interface Entry extends Omit<PageLibraryItem, "slot" | "renderKey"> {
  runtime: Runtime | null;
  materials: { path: string; sha256: string }[];
}
const require = createRequire(import.meta.url);
interface Inventory {
  version: number;
  inventoryHash: string;
  total: number;
  items: Entry[];
}
const summary = require("./collected/summary.json") as {
  inventoryHash: string;
  total: number;
  counts: Record<string, number>;
};
let cachedInventory: Inventory | undefined,
  cachedEntries: Map<string, Entry> | undefined;
const inventory = () =>
  (cachedInventory ??= require("./collected/inventory.json") as Inventory);
const entries = () =>
  (cachedEntries ??= new Map(
    inventory().items.flatMap((item) => [
      [item.id, item] as const,
      ...(item.runtime ? [[item.runtime.key, item] as const] : []),
    ]),
  ));
export const LIBRARY_INVENTORY_HASH = summary.inventoryHash;
export const LIBRARY_TOTAL = summary.total;
export const LIBRARY_COUNTS = summary.counts;
const publicItem = ({
  runtime,
  materials,
  ...item
}: Entry): PageLibraryItem => ({
  ...item,
  slot: runtime?.slot ?? null,
  renderKey: runtime?.key ?? null,
});
export function searchPageLibrary(input: PageLibrarySearch) {
  const words = input.q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = inventory().items.filter(
    (item) =>
      (!input.slot || item.runtime?.slot === input.slot) &&
      (!input.status || item.status === input.status),
  );
  const ranked = matches
    .map((item) => ({
      item,
      score: words.reduce(
        (score, word) =>
          score +
          (JSON.stringify([
            item.id,
            item.runtime?.key,
            item.name,
            item.sourceItemId,
            item.source,
            item.kind,
            item.roles,
            item.categories,
          ])
            .toLowerCase()
            .includes(word)
            ? 1
            : 0),
        0,
      ),
    }))
    .filter((row) => !words.length || row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  return {
    inventoryHash: summary.inventoryHash,
    inventoryTotal: summary.total,
    counts: LIBRARY_COUNTS,
    total: ranked.length,
    page: input.page,
    items: ranked
      .slice((input.page - 1) * input.limit, input.page * input.limit)
      .map((row) => publicItem(row.item)),
  };
}
export function retrievePageLibrary(
  content: StructuredPortfolioContent,
  instruction = "",
) {
  const semantics = /\uB514\uC790\uC774\uB108|\uD3B8\uC9D1/.test(
    content.profile.role,
  )
    ? "editorial typography layout bento"
    : /\uBD84\uC11D|\uAE30\uD6C4/.test(content.profile.role)
      ? "chart dashboard analytics"
      : "grid timeline technical";
  const query = [
    semantics,
    content.profile.role,
    ...content.profile.focus,
    ...content.sections.map((s) => s.title),
    instruction,
  ].join(" ");
  // 실행 선택지는 전체 호환 목록을 전달합니다. 참고 자료는 전체 목록에서 검색하여 토큰 예산 안으로 추립니다.
  const intro = inventory()
    .items.filter((i) => i.runtime?.slot === "intro")
    .map(publicItem);
  const section = inventory()
    .items.filter((i) => i.runtime?.slot === "section")
    .map(publicItem);
  const guidance = searchPageLibrary({
    q: query,
    status: "guidance",
    page: 1,
    limit: 8,
  }).items;
  return {
    inventoryHash: summary.inventoryHash,
    inventoryTotal: summary.total,
    query,
    intro,
    section,
    guidance,
  };
}
export function librarySelection(spec: StructuredPortfolioSpec) {
  const ids = Object.values(spec.elements).flatMap((node) => [
    ...("sourceId" in node.props && node.props.sourceId
      ? [node.props.sourceId]
      : []),
    ...(node.type === "PortfolioPage" ? node.props.referenceIds || [] : []),
  ]);
  return {
    inventoryHash: summary.inventoryHash,
    inventoryTotal: summary.total,
    selected: [...new Set(ids)].map((id) => {
      const item = entries().get(id);
      if (!item) throw new Error(`등록되지 않은 수집 ID: ${id}`);
      return {
        id: item.id,
        key: item.runtime?.key || id,
        sourceUrl: item.sourceUrl,
        status: item.status,
        material: item.runtime?.material || null,
        sha256: item.runtime?.sha256 || null,
        adaptation: item.runtime?.adaptation || item.reason,
      };
    }),
  };
}
export function validateLibrarySelection(spec: StructuredPortfolioSpec) {
  for (const node of Object.values(spec.elements)) {
    if ("sourceId" in node.props && node.props.sourceId) {
      const item = entries().get(node.props.sourceId),
        slot = node.type === "NameIntro" ? "intro" : "section";
      if (
        !item ||
        item.status !== "renderable" ||
        item.runtime?.slot !== slot ||
        !components[item.id]
      )
        throw new Error(
          `사용할 수 없는 ${slot} 수집 컴포넌트: ${node.props.sourceId}`,
        );
    }
    if (node.type === "PortfolioPage")
      for (const id of node.props.referenceIds || [])
        if (entries().get(id)?.status !== "guidance")
          throw new Error(`구도 참고 자료로 사용할 수 없는 ID: ${id}`);
  }
}
export function collectedSourceName(sourceId: string) {
  return entries().get(sourceId)?.sourceItemId;
}
// 원본 안에 이미 연결한 사례 항목 수입니다. 빌드가 원본 변환 결과에서 기록합니다.
export function collectedBoundDetails(sourceId: string) {
  return entries().get(sourceId)?.runtime?.boundDetails ?? 0;
}
export function renderCollected(
  sourceId: string,
  binding: SourceBinding,
  children?: React.ReactNode,
): React.ReactNode {
  const item = entries().get(sourceId),
    Component = item ? components[item.id] : undefined;
  if (!item?.runtime || !Component)
    throw new Error(`실행 원본이 없는 ID: ${sourceId}`);
  const props: Record<string, unknown> = {};
  const title = binding.section?.title || binding.profile.name,
    description = binding.section?.summary || "";
  const nav = binding.sections
    .slice(0, 4)
    .map((s) => ({ label: s.title, href: `#section-${s.id}` }));
  let headingBound = false;
  const controls = new Set([
    "className",
    "variant",
    "spread",
    "highlightColor",
    "baseColor",
    "duration",
    "delay",
    "width",
    "height",
    "color",
    "textColor",
    "texture",
    "depth",
    "bookmarkColor",
    "size",
    "orientation",
    "animation",
  ]);
  for (const { name, type } of item.runtime.props) {
    if (controls.has(name)) continue;
    let value: unknown = null;
    if (/\[\]|Array</.test(type)) value = [];
    else if (type === "string" || /ReactNode/.test(type)) value = "";
    else if (type === "number") value = 0;
    else if (type === "boolean") value = false;
    if (
      /^(headline|heading|headingLine1|headingLine1Prefix|headingPrefix|title|titleLine1|titleLine1Start|titleLines)$/.test(
        name,
      ) &&
      !headingBound
    ) {
      value = name === "titleLines" ? [title] : title;
      headingBound = true;
    }
    if (/^(description|descriptionText|subtitle|subheading)$/.test(name))
      value = description;
    if (/^(brand|brandName|logoText|author|recipient)$/.test(name))
      value = binding.profile.name;
    if (/^(navLinks|navItems)$/.test(name))
      value = /string\[\]/.test(type) ? nav.map((n) => n.label) : nav;
    if (/^(backgroundImage|previewImage|avatarUrl)$/.test(name))
      value =
        binding.section?.media[0]?.src ||
        binding.sections[0]?.media[0]?.src ||
        "";
    if (
      /^(ctaLabel|ctaText|primaryText|primaryCtaLabel|primaryCtaText|primaryActionText)$/.test(
        name,
      )
    )
      value = "프로젝트 보기";
    if (/^(ctaHref|primaryHref|primaryCtaHref|scrollHref)$/.test(name))
      value = "#work";
    if (name === "children") value = children;
    if (name === "illustration")
      value = binding.section?.media[0]
        ? React.createElement("img", {
            src: binding.section.media[0].src,
            alt: binding.section.media[0].alt,
          })
        : null;
    props[name] = value;
  }
  // 레이아웃·시각 처리 값은 내용과 별개로 지정합니다. 기본 마케팅 수치와 인물 목록은 비웁니다.
  if (item.sourceItemId === "book") {
    props.variant = "default";
    props.color = "var(--sp-panel)";
    props.textColor = "var(--sp-ink)";
    props.depth = 6;
    props.size = "md";
    props.animation = "hover";
    props.orientation = "portrait";
    props.title = title;
    props.children = children || binding.section?.summary;
    props.width = 300;
    props.height = 400;
  }
  if (item.sourceItemId === "award") {
    props.variant = "stamp";
    props.level = "silver";
    props.showIcon = false;
  }
  props.children ??= children;
  if (item.sourceItemId === "annotated-text") {
    props.children = title;
    props.variant = "wavy";
    props.animate = false;
  }
  if (item.sourceItemId === "text-gradient") {
    props.children = title;
    props.highlightColor = "var(--sp-accent)";
    props.baseColor = "var(--sp-ink)";
  }
  return React.createElement(
    SourceBindingContext.Provider,
    {
      value: {
        ...binding,
        namespace: `${item.id}-${binding.section?.id || "intro"}`,
      },
    },
    React.createElement(
      "div",
      {
        "data-library-source": item.id,
        "data-source-slot": item.runtime.slot,
        "data-has-media": binding.sections.some(
          (section) => section.media.length > 0,
        ),
        className:
          item.sourceItemId === "annotated-text" ||
          item.sourceItemId === "text-gradient"
            ? "sp-source sp-source-annotation"
            : "sp-source",
      },
      item.sourceItemId === "annotated-text" ||
        item.sourceItemId === "text-gradient"
        ? React.createElement("h2", {}, React.createElement(Component, props))
        : React.createElement(Component, props),
    ),
  );
}
// 이름 판: CSS blur 값은 가우스 표준편차입니다. 14px이면 가상 입력 이미지의 큰 글자(약 90px, 획 두께 약 12px)가
// 판 안에서 판독되지 않는 것을 히어로 2·5·12와 세 가상 프로필 화면(1440·390px)에서 확인했습니다.
// 여백은 블러 반경과 같게 두어 판 가장자리에서 번져 드는 바깥 글자가 이름에 닿지 않게 합니다.
// 배경 이미지는 이미 brightness(.38)로 어두워 흰 글자 대비를 확보하므로 판에 별도 색을 칠하지 않습니다. 판 밖의 이미지 글자는 그대로 보입니다.
// 원본은 Tailwind 기본 리셋(링크 상속, 이미지 최대 폭, border-box)을 전제로 작성됐습니다.
// 리셋 전체는 호스트 문서에 영향을 주므로 빼고, 필요한 규칙만 원본 레이어보다 먼저 선언한 레이어에 둡니다.
// 레이어 밖에 두면 원본 유틸리티(min-w-*, h-full 등)를 덮어 크기가 무너집니다.
export const COLLECTED_PORTFOLIO_CSS =
  "@layer sp-source-base{.sp-source *{box-sizing:border-box;min-width:0}.sp-source a{color:inherit;text-decoration:inherit}.sp-source img{max-width:100%;height:auto}}\n" +
  sourceCss +
  `\n.sp-source{min-width:0;max-width:100%;overflow:clip;isolation:isolate;}.sp-source [data-personal-heading]{font-size:clamp(3.25rem,7vw,7.5rem)!important;line-height:1.08!important;word-break:keep-all;overflow-wrap:anywhere;letter-spacing:-.04em}.sp-source-definition{color:inherit!important;font-size:clamp(1rem,2vw,1.5rem)!important;line-height:1.5!important;margin-top:1rem;max-width:42ch}.sp-source-annotation h2{font-size:clamp(2rem,4vw,4rem);line-height:1.3;margin:1.5rem}.sp-source-annotation span{white-space:normal!important}.sp-source[data-source-slot=intro][data-has-media=true] img{filter:brightness(.38)}.sp-source-nameplate{display:contents}.sp-source[data-source-slot=intro][data-has-media=true] .sp-source-nameplate{--sp-nameplate-blur:14px;display:inline-block;max-width:100%;padding:var(--sp-nameplate-blur);border-radius:var(--radius-lg,12px);-webkit-backdrop-filter:blur(var(--sp-nameplate-blur));backdrop-filter:blur(var(--sp-nameplate-blur))}.sp-source[data-source-slot=intro][data-has-media=true] .sp-source-nameplate>:last-child{margin-bottom:0!important}.sp-source[data-source-slot=intro][data-has-media=true] [data-personal-heading],.sp-source[data-source-slot=intro][data-has-media=true] .sp-source-definition{color:#fff!important;text-shadow:0 1px 3px #0008}.sp-source[data-source-slot=intro][data-has-media=true] a[data-portfolio-nav=true]{color:#fff!important;text-shadow:0 1px 3px #0008}.sp-source[data-source-slot=intro][data-has-media=true] a[data-light-control=true]{color:#16223a!important;text-shadow:none!important}.sp-source p{overflow-wrap:anywhere}.sp-source a{cursor:pointer}.sp-source a[data-source-native]{color:revert-layer}.sp-source-motion{animation:sp-source-enter .7s cubic-bezier(.22,1,.36,1) both}.sp-source-motion:has(.sp-source-motion){animation:none}.sp-source a{transition:transform .2s,color .2s}.sp-source a:hover{transform:translateY(-2px)}.sp-source-details{padding:clamp(1.5rem,4vw,4rem)}.sp-page[data-layout=library]{display:block;padding:0}.sp-page[data-layout=library]>.sp-index,.sp-page[data-layout=library]>.sp-career,.sp-page[data-layout=library]>.sp-evidence,.sp-page[data-layout=library]>.sp-contact{margin:clamp(1.5rem,4vw,4rem)}.sp-page[data-layout=library]>.sp-intro{padding:0;position:static;max-height:none}.sp-page[data-layout=library] .sp-case{margin:0;padding:0}.sp-page[data-motion=none] .sp-source-motion{animation:none}@keyframes sp-source-enter{from{opacity:.2;translate:0 18px}to{opacity:1;translate:0 0}}@media(prefers-reduced-motion:reduce){.sp-source *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}@media(max-width:600px){.sp-source [data-personal-heading]{font-size:3.25rem!important}.sp-source nav{max-width:100%}}`;
