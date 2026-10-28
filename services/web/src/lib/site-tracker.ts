import { createHash } from "node:crypto";

import { SITE_TRACKER_SOURCE_TAG } from "./site-tracker-message";

/**
 * 공개 사이트 iframe 안에서 도는 유일한 스크립트.
 *
 * 하는 일은 셋이다.
 * - 섹션이 화면 절반 이상을 차지하기 시작하거나 벗어날 때 알린다. 시간은 부모가 잰다 —
 *   탭을 닫는 순간 iframe이 보낸 알림은 부모에 닿지 못한다. 섹션은 다른 section 안에
 *   있지 않은 `<section>`이다 — 배포할 때 섹션 목록을 뽑는 규칙과 같다
 *   (`publishing/outline.ts`). 개수가 그 목록과 다르면 섹션은 알리지 않는다.
 * - 스크롤이 90%에 닿으면 끝까지 읽었다고 한 번 알린다.
 * - 메일 · 전화 · 링크드인, 파일, 바깥 링크를 누르면 알린다. 주소 전체가 아니라 종류 ·
 *   호스트 · 파일 이름까지만 보낸다.
 *
 * 요청은 보내지 않는다. `parent.postMessage`로 알리고 부모가 기록한다.
 * 저장된 지면에는 들어가지 않고 내보낼 때마다 붙는다. 그래서 고쳐도 다시 배포할 필요가 없다.
 */
export const SITE_TRACKER_SCRIPT = `(function () {
  var TAG = ${JSON.stringify(SITE_TRACKER_SOURCE_TAG)};
  function post(message) { message.source = TAG; parent.postMessage(message, "*"); }
  var root = document.scrollingElement || document.documentElement;
  var deepest = 0;
  var completed = false;
  function depth() {
    var max = root.scrollHeight - root.clientHeight;
    return max <= 0 ? 1 : Math.min(1, Math.max(0, root.scrollTop / max));
  }
  function measure() {
    var now = depth();
    if (now > deepest) deepest = now;
    if (!completed && deepest >= 0.9) { completed = true; post({ kind: "complete" }); }
  }
  window.addEventListener("scroll", measure, { passive: true });
  setTimeout(measure, 3000);

  var meta = document.querySelector('meta[name="expresso-sections"]');
  var expected = meta ? Number(meta.getAttribute("content")) : -1;
  var sections = Array.prototype.filter.call(document.querySelectorAll("section"), function (element) {
    return !(element.parentElement && element.parentElement.closest("section"));
  });
  var shown = [];
  if (expected > 0 && sections.length === expected && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var index = sections.indexOf(entry.target);
        var visible = entry.isIntersecting && (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5);
        if (shown[index] === visible) return;
        shown[index] = visible;
        post({ kind: "section", index: index, visible: visible, scrollDepth: Math.round(deepest * 1000) / 1000 });
      });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    sections.forEach(function (element) { observer.observe(element); });
  }

  document.addEventListener("click", function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!anchor) return;
    var href = anchor.getAttribute("href") || "";
    if (href.charAt(0) === "#") return;
    var url;
    try { url = new URL(href, document.baseURI); } catch (error) { return; }
    if (url.protocol === "mailto:" || url.protocol === "tel:") return post({ kind: "contact", target: url.protocol.slice(0, -1) });
    if (/(^|\\.)linkedin\\.com$/.test(url.hostname)) return post({ kind: "contact", target: "linkedin" });
    if (anchor.hasAttribute("download") || /\\.(pdf|docx?|pptx?|hwp)$/i.test(url.pathname)) {
      return post({ kind: "download", target: (decodeURIComponent(url.pathname.split("/").pop() || "") || url.hostname).slice(0, 200) });
    }
    if (url.protocol === "http:" || url.protocol === "https:") return post({ kind: "link", target: url.hostname });
  }, true);
})();`;

/** 공개 문서 응답의 `script-src`에 넣는 이 스크립트의 해시. */
export const SITE_TRACKER_SCRIPT_SOURCE = `'sha256-${createHash("sha256").update(SITE_TRACKER_SCRIPT).digest("base64")}'`;

/**
 * 공개할 문서에 추적 스크립트를 붙인다.
 *
 * 스크립트 정책은 문서 안이 아니라 공개 문서 응답의 헤더 하나가 건다(`pageDocumentResponse`). 그 정책이 장면
 * 런타임과 **이 스크립트 하나만**(`SITE_TRACKER_SCRIPT_SOURCE`) 허용한다. 문서 안에 `<meta>` 정책을 더 두면
 * 헤더 정책과 둘 다 걸려 장면 런타임이 막힌다.
 */
export function withSiteTracker(document: string, sectionCount: number): string {
  const withHead = document.replace("<head>", `<head>\n<meta name="expresso-sections" content="${sectionCount}">`);
  const end = withHead.lastIndexOf("</body>");
  const script = `<script>${SITE_TRACKER_SCRIPT}</script>\n`;
  return end === -1 ? `${withHead}${script}` : `${withHead.slice(0, end)}${script}${withHead.slice(end)}`;
}
