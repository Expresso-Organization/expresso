"use client";

import { pageDocument, type GeneratedPage } from "@expresso/contracts";
import { useEffect, useMemo, useRef } from "react";

/**
 * 다듬기 화면의 지면 미리보기. 배포 문서와 같은 `pageDocument()`에 편집용 스크립트 하나만 더한다.
 *
 * - 요소를 누르면 요소 키(`data-xp-key`)와 누른 글자 부분을 부모 창에 알린다. 부분은 렌더러의 부분 선택자 표로 찾는다.
 * - 고른 요소에 테두리를 그리고, 부모가 보낸 임시 CSS(저장 전 글자 모양)를 덧입힌다.
 * - 등장 애니메이션과 전환을 끈다. 배포 문서는 그대로다.
 *
 * `sandbox`에 `allow-same-origin`을 주지 않는다. 이 문서는 고유하지 않은 출처(`null`)에서 돌아 앱의 쿠키 · 저장소에
 * 닿지 못한다. 스크립트는 우리가 넣은 것 하나이고, 지면 HTML은 소독을 지난 렌더 결과다.
 */

const CHANNEL = "xp-editor";

/** iframe 안에서 도는 편집 스크립트. 문자열로 들어가므로 바깥 변수를 쓰지 않는다. */
export const EDITOR_SCRIPT = `(function(){
  var KEY = "data-xp-key", parts = {}, selected = null, color = "currentColor";
  var base = document.createElement("style"), mark = document.createElement("style"), live = document.createElement("style");
  document.head.append(base, live, mark);
  base.textContent = ".xp-page *,.xp-page *::before,.xp-page *::after{animation:none!important;transition:none!important}[" + KEY + "]{cursor:pointer}";
  // 등장 애니메이션은 지면 루트의 data-motion을 신호로 삼는다. 편집 중에는 none으로 둔다.
  var root = document.querySelector(".xp-page");
  if (root) root.setAttribute("data-motion", "none");
  function post(message){ message.source = "${CHANNEL}"; parent.postMessage(message, "*"); }
  function paint(){
    mark.textContent = "[" + KEY + "]:hover{outline:1px dashed " + color + ";outline-offset:4px}"
      + (selected ? "[" + KEY + "=\\"" + selected + "\\"],[" + KEY + "=\\"" + selected + "\\"]:hover{outline:2px solid " + color + ";outline-offset:4px}" : "");
  }
  // 고른 요소의 글자 부분마다 지금 글자 크기(px)를 알린다. 크기 조절이 가장 가까운 단계에서 시작한다.
  function measure(){
    if (!selected) return;
    var element = document.querySelector("[" + KEY + "='" + selected + "']"), list = parts[selected] || {}, sizes = {};
    if (!element) return;
    for (var name in list) {
      var hit = element.querySelector(list[name]);
      if (hit) sizes[name] = parseFloat(getComputedStyle(hit).fontSize);
    }
    post({ type: "measure", key: selected, sizes: sizes });
  }
  document.addEventListener("click", function(event){
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("a")) event.preventDefault();
    var element = target.closest("[" + KEY + "]");
    if (!element) return;
    event.preventDefault();
    var key = element.getAttribute(KEY), part = null, list = parts[key] || {};
    for (var name in list) {
      var hit = target.closest(list[name]);
      if (hit && element.contains(hit)) { part = name; break; }
    }
    post({ type: "select", key: key, part: part });
  }, true);
  window.addEventListener("message", function(event){
    if (event.source !== parent) return;
    var data = event.data || {};
    if (data.source !== "${CHANNEL}") return;
    if (data.parts) parts = data.parts;
    if (data.color) color = data.color;
    if ("css" in data) live.textContent = data.css || "";
    if ("selected" in data) {
      selected = data.selected;
      measure();
      if (data.scroll && selected) {
        var element = document.querySelector("[" + KEY + "=\\"" + selected + "\\"]");
        if (element) element.scrollIntoView({ block: "center" });
      }
    }
    paint();
  });
  post({ type: "ready" });
})();`;

export function EditablePagePreview({
  page,
  title,
  className,
  parts,
  selected,
  scrollRequest,
  draftCss,
  onSelect,
  onMeasure,
}: {
  page: GeneratedPage;
  title: string;
  className: string;
  /** 요소 키 → 글자 부분 이름 → 선택자. */
  parts: Record<string, Record<string, string>>;
  selected: string | null;
  /** 바뀔 때마다 고른 요소로 지면을 굴린다. 목차에서 고를 때 올린다. */
  scrollRequest: number;
  /** 저장하기 전 글자 모양. 저장된 CSS 위에 덧입힌다. */
  draftCss: string;
  onSelect: (key: string, part: string | null) => void;
  /** 고른 요소의 글자 부분별 지금 크기(px). */
  onMeasure?: (key: string, sizes: Record<string, number>) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // iframe이 다시 읽힐 때(새 판) 지금 고른 것과 임시 모양을 다시 보낸다. 받는 쪽 핸들러가 최신 값을 읽도록 둔다.
  const state = useRef({ parts, selected, draftCss, onSelect, onMeasure });
  useEffect(() => { state.current = { parts, selected, draftCss, onSelect, onMeasure }; });

  const srcDoc = useMemo(() => {
    const document = pageDocument({
      html: page.html,
      css: page.css,
      title,
      description: page.rationale,
      ...(page.styleSpec ? { grammar: page.styleSpec } : {}),
    });
    const at = document.lastIndexOf("</body>");
    return `${document.slice(0, at)}<script>${EDITOR_SCRIPT}</script>\n${document.slice(at)}`;
  }, [page.html, page.css, page.rationale, page.styleSpec, title]);

  function send(message: Record<string, unknown>) {
    frame.current?.contentWindow?.postMessage({ source: CHANNEL, ...message }, "*");
  }

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const data = event.data as { source?: string; type?: string; key?: string; part?: string | null; sizes?: Record<string, number> };
      if (data?.source !== CHANNEL) return;
      if (data.type === "ready") {
        // 고른 테두리 색은 편집 화면 CSS가 정한다(`--xp-selection`).
        const color = getComputedStyle(frame.current).getPropertyValue("--xp-selection").trim();
        const current = state.current;
        send({ parts: current.parts, color, css: current.draftCss, selected: current.selected });
      }
      if (data.type === "select" && typeof data.key === "string") state.current.onSelect(data.key, data.part ?? null);
      if (data.type === "measure" && typeof data.key === "string" && data.sizes) state.current.onMeasure?.(data.key, data.sizes);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => { send({ parts }); }, [parts]);
  useEffect(() => { send({ selected }); }, [selected]);
  useEffect(() => { if (scrollRequest > 0) send({ selected: state.current.selected, scroll: true }); }, [scrollRequest]);
  useEffect(() => { send({ css: draftCss }); }, [draftCss]);

  return (
    <iframe
      ref={frame}
      className={className}
      title={`${title} 미리보기`}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
    />
  );
}
