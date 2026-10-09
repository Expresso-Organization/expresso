import React, { createContext, useContext } from "react";
import {
  jsx as reactJsx,
  jsxs as reactJsxs,
  Fragment,
} from "react/jsx-runtime";
import type {
  StructuredPortfolioContent,
  StructuredSection,
} from "@expresso/contracts";
export { Fragment };
export interface SourceBinding {
  profile: StructuredPortfolioContent["profile"];
  sections: StructuredSection[];
  section?: StructuredSection;
  namespace?: string;
}
export const SourceBindingContext = createContext<SourceBinding | null>(null);
const labels = new Set([
  "프로젝트 보기",
  "프로필",
  "관련 자료",
  "연락하기",
  "↓",
  "↗",
  "•",
  "→",
]);
const removedTags = new Set([
  "script",
  "iframe",
  "video",
  "audio",
  "form",
  "input",
  "textarea",
  "select",
]);
interface Inspection {
  // 원본 코드에 글자가 있었는가
  text: boolean;
  // 입력 내용이 하나라도 남는가
  kept: boolean;
}
const none: Inspection = { text: false, kept: false };
const merge = (items: Inspection[]): Inspection => ({
  text: items.some((item) => item.text),
  kept: items.some((item) => item.kept),
});
// 원본 하위 트리를 렌더링 전에 살펴, 샘플 글자를 지운 뒤 빈 상자만 남는 요소를 찾습니다.
function inspect(
  node: unknown,
  keeps: (value: string) => boolean,
  binding: SourceBinding,
  hasMedia: boolean,
): Inspection {
  if (typeof node === "string")
    return node.trim() ? { text: true, kept: keeps(node) } : none;
  if (typeof node === "number") return { text: true, kept: false };
  if (Array.isArray(node))
    return merge(node.map((item) => inspect(item, keeps, binding, hasMedia)));
  if (!React.isValidElement(node)) return none;
  // 렌더러가 넘긴 사례 설명입니다. 원본 JSX가 아니므로 입력 내용으로 봅니다.
  if (typeof node.type === "string") return { text: false, kept: true };
  const props = node.props as Record<string, unknown>;
  const tag =
    node.type === BoundElement
      ? (props.kind as string)
      : (node.type as { sourceTag?: string }).sourceTag;
  const own = node.type === BoundElement ? (props.sourceProps as Record<string, unknown>) : props;
  if (tag) {
    if (removedTags.has(tag)) return none;
    if (tag === "img") return { text: false, kept: hasMedia };
    if (tag === "h1") return { text: true, kept: true };
    const field = own["data-portfolio-field"];
    if (typeof field === "string" && binding.section)
      return { text: true, kept: true };
  }
  // 자식이 없는 함수 컴포넌트(아이콘 등)는 입력 내용을 담지 않습니다.
  return "children" in own
    ? inspect(own.children, keeps, binding, hasMedia)
    : none;
}
function BoundElement({
  kind,
  sourceProps,
}: {
  kind: string;
  sourceProps: Record<string, unknown>;
}) {
  const binding = useContext(SourceBindingContext);
  if (!binding) throw new Error("수집 컴포넌트의 데이터 연결이 필요합니다.");
  const { children, ...props } = sourceProps;
  props["data-source-native"]="true";
  const values: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object")
      Object.values(value).forEach(collect);
  };
  collect(binding);
  const keeps = (value: string) =>
    value.trim() === "" ||
    labels.has(value.trim()) ||
    values.some((v) => v === value || v.includes(value.trim()));
  const clean = (value: unknown): React.ReactNode => {
    if (typeof value === "string") return keeps(value) ? value : null;
    if (typeof value === "number") return null;
    if (Array.isArray(value)) return React.Children.toArray(value.map(clean));
    return value as React.ReactNode;
  };
  if (removedTags.has(kind)) return null;
  for (const key of Object.keys(props)) {
    if (
      key.startsWith("on") ||
      key === "dangerouslySetInnerHTML" ||
      key === "action" ||
      key === "srcSet"
    )
      delete props[key];
  }
  const scoped = (value: string) => `${binding.namespace || "source"}-${value}`;
  if (typeof props.id === "string") props.id = scoped(props.id);
  for (const key of ["fill", "stroke", "filter", "mask", "clipPath"])
    if (typeof props[key] === "string")
      props[key] = (props[key] as string).replace(
        /url\(#([^)]*)\)/g,
        (_match, value: string) => `url(#${scoped(value)})`,
      );
  if (
    kind === "use" &&
    typeof props.href === "string" &&
    props.href.startsWith("#")
  )
    props.href = `#${scoped(props.href.slice(1))}`;
  const media =
    binding.section?.media || binding.sections.flatMap((s) => s.media);
  // 원본에 글자가 있었지만 입력 내용이 하나도 남지 않으면 샘플 상자이므로 출력하지 않습니다.
  // 제목과 입력 슬롯은 아래에서 입력 값으로 채우므로 판정하지 않습니다.
  if (
    kind !== "h1" &&
    !(typeof props["data-portfolio-field"] === "string" && binding.section)
  ) {
    const state = inspect(children, keeps, binding, media.length > 0);
    if (state.text && !state.kept) return null;
    // 원본에서 글자 없이 만든 장식입니다. 검증이 샘플 잔여 요소와 구분할 수 있게 표시합니다.
    if (!state.text && !state.kept && (kind === "div" || kind === "span"))
      props["data-source-decoration"] = "true";
  }
  if (kind === "img") {
    const image = media.find((m) => m.src === props.src) || media[0];
    if (!image) return null;
    props.src = image.src;
    props.alt = image.alt;
    props.loading = "lazy";
  }
  if (props.style && typeof props.style === "object") {
    const style = { ...props.style } as Record<string, unknown>;
    for (const [k, v] of Object.entries(style))
      if (typeof v === "string" && /url\(/i.test(v)) {
        style[k] = /^url\(["']?#/.test(v)
          ? v.replace(
              /url\(["']?#([^"')]+)["']?\)/g,
              (_match, value: string) => `url(#${scoped(value)})`,
            )
          : media[0]
            ? binding.section
              ? `url("${media[0].src}")`
              : `linear-gradient(rgba(4,8,12,.64),rgba(4,8,12,.56)),url("${media[0].src}")`
            : "none";
      }
    props.style = style;
  }
  let tag = kind,
    body = clean(children);
  const readable = (value: React.ReactNode): boolean => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.some(readable);
    if (React.isValidElement(value)) {
      const p = value.props as {
        children?: React.ReactNode;
        sourceProps?: { children?: React.ReactNode };
      };
      return readable(p.sourceProps?.children ?? p.children);
    }
    return false;
  };
  if (kind === "h1") {
    tag = binding.section ? "h2" : "h1";
    body = binding.section?.title || binding.profile.name;
    props["data-personal-heading"] = "true";
  }
  if (typeof props["data-portfolio-field"] === "string" && binding.section) {
    const field = props["data-portfolio-field"] as string;
    if (field === "title") body = binding.section.title;
    else if (field === "summary") body = binding.section.summary;
    else {
      const [index, part] = field.split(".");
      const detail = binding.section.details[Number(index)];
      body = detail ? detail[part === "label" ? "label" : "text"] : null;
    }
  }
  if (kind === "a") {
    if (!readable(body)) return null;
    const labelOf=(value:React.ReactNode):string=>{
      if(typeof value==='string')return value;
      if(Array.isArray(value))return value.map(labelOf).join('');
      if(React.isValidElement(value)){const p=value.props as {children?:React.ReactNode;sourceProps?:{children?:React.ReactNode}};return labelOf(p.sourceProps?.children??p.children);}
      return '';
    };
    const label=labelOf(body).trim(),target=binding.sections.find(section=>section.title===label);
    if(target){props.href=`#section-${target.id}`;props['data-portfolio-nav']='true';}
    else if(label===binding.profile.name){props.href='#intro';props['data-portfolio-nav']='true';}
    if (
      typeof props.href !== "string" ||
      !/^#(?:intro|work|section-[a-zA-Z0-9-]+|source-[a-zA-Z0-9-]+|contact)$/.test(
        props.href,
      )
    ) {
      delete props.href;
      return body ? <span {...props}>{body}</span> : null;
    }
  }
  if (kind === "button") {
    // 모션 시연용 버튼과 로그인 동작은 제공하지 않습니다. 입력에 있는 목차로 연결합니다.
    if (!readable(body)) return null;
    tag = "a";
    props.href = binding.section ? `#section-${binding.section.id}` : "#work";
    delete props.type;
  }
  if(tag==='a'&&/(?:^|\s)(?:bg-white|bg-\[#(?:fff|ffffff)\])(?:\s|$)/i.test(String(props.className)))props['data-light-control']='true';
  if (["p", "small", "strong"].includes(kind) && !readable(body)) return null;
  if (
    kind === "span" &&
    /text-|font-/.test(String(props.className)) &&
    !readable(body)
  )
    return null;
  if (kind === "h1" && !binding.section)
    // 이름과 자기 정의를 한 판으로 묶어 배경 이미지 위에서 블러 판을 함께 씌웁니다.
    return (
      <div className="sp-source-nameplate">
        {React.createElement(tag, props, body)}
        <p className="sp-definition sp-source-definition">
          {binding.profile.headline}
        </p>
      </div>
    );
  return React.createElement(
    tag,
    props,
    ...(Array.isArray(body) ? body : [body]),
  );
}
export function jsx(
  type: React.ElementType | string,
  props: Record<string, unknown>,
  key?: string,
) {
  if (Array.isArray(props.children))
    props = { ...props, children: React.Children.toArray(props.children) };
  return typeof type === "string"
    ? reactJsx(BoundElement, { kind: type, sourceProps: props }, key)
    : reactJsx(type, props, key);
}
export function jsxs(
  type: React.ElementType | string,
  props: Record<string, unknown>,
  key?: string,
) {
  if (Array.isArray(props.children))
    props = { ...props, children: React.Children.toArray(props.children) };
  return typeof type === "string"
    ? reactJsxs(BoundElement, { kind: type, sourceProps: props }, key)
    : reactJsxs(type, props, key);
}
