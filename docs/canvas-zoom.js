/*
 * canvas-zoom.js — 폭이 고정된 캔버스 문서(ERD·기능 지도·마인드맵·로드맵 등)를
 * 줌아웃해서 한눈에 보게 한다. 문서 폭이 창보다 넓으면 처음부터 폭에 맞춰 줄여 띄운다.
 *
 * 방식 — dc-runtime 이 그린 #dc-root 컨테이너에 transform: scale 을 건다.
 *   런타임(React)이 관리하는 것은 #dc-root 의 "자식"이므로 컨테이너 자체의 style 은
 *   리렌더에 지워지지 않는다. transform 된 박스는 스크롤 영역 계산에 그대로 반영되어
 *   스크롤바도 축소된 크기를 따라간다 — 별도 래퍼가 필요 없다.
 *
 * 쓰는 곳 — canvas 모드 문서의 <head> 에서 support.js 다음에 불러온다.
 *   <script src="./canvas-zoom.js"></script>                    처음부터 창 폭에 맞춰 뜬다
 *   <script src="./canvas-zoom.js" data-default="100"></script>  원래 크기로 뜬다
 *   다이어그램은 통째로 보는 것이 요점이라 맞춤이 기본이고, 화면 정의서처럼 실제 크기로
 *   읽는 문서는 100% 로 열고 필요할 때 줄인다. 한 번 바꾼 배율은 문서별로 기억한다.
 *
 * 안 켜는 자리 — 포털은 화면 정의서를 두 가지로 쓴다. 뷰어(iframe#docframe)로 통째로
 *   띄우기도 하고, 위키 카드의 화면 썸네일로도 쓴다. 썸네일은 포털이 그 iframe 을 직접
 *   transform 해서 원하는 화면만 잘라내므로(포털의 fitScreen) 안쪽에서 또 배율을 걸면
 *   어긋난다. 그래서 최상위 문서이거나 뷰어 iframe 일 때만 켠다.
 */
(function () {
  'use strict';
  if (window.__dcCanvasZoom) return;

  // frameElement 는 같은 출처이므로 읽을 수 있다. 못 읽으면 남의 페이지 안이니 켜지 않는다.
  var frameEl;
  try { frameEl = window.frameElement; } catch (e) { return; }
  if (frameEl && frameEl.id !== 'docframe') return;

  window.__dcCanvasZoom = true;
  var me = document.currentScript;

  var MIN = 0.1, MAX = 3, STEP = 1.25;
  var KEY = 'expresso-canvas-zoom:' +
    decodeURIComponent(String(location.pathname)).replace(/^.*\//, '').replace(/\.html$/i, '');

  var root = null;     // #dc-root — 배율을 거는 컨테이너
  var zoom = 1;
  // 'fit' = 창 폭에 맞춤(100% 넘겨 키우지는 않음) | 'manual'
  var mode = (me && me.getAttribute('data-default') === '100') ? 'manual' : 'fit';
  var pctEl = null, fitEl = null, oneEl = null;

  function clamp(z) { return Math.min(MAX, Math.max(MIN, z)); }

  function restore() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'fit') { mode = 'fit'; return; }
      var n = parseFloat(v);
      if (n > 0) { mode = 'manual'; zoom = clamp(n); }
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, mode === 'fit' ? 'fit' : String(Math.round(zoom * 1e4) / 1e4)); } catch (e) {}
  }

  // #dc-root 의 scrollWidth 는 넘쳐나는 내용까지 포함한 "배율 걸기 전" 폭이다.
  // 자기 자신에게 걸린 transform 은 레이아웃 값에 영향을 주지 않으므로 축소 중에도 그대로다.
  function natW() { return (root && root.scrollWidth) || 1; }
  function viewW() { return document.documentElement.clientWidth || window.innerWidth || 1; }
  function viewH() { return document.documentElement.clientHeight || window.innerHeight || 1; }
  function fitZoom() { return clamp(Math.min(1, viewW() / natW())); }

  // ax, ay = 배율이 바뀌어도 제자리에 두고 싶은 화면 좌표. 없으면 화면 중앙.
  function apply(z, ax, ay) {
    z = clamp(z);
    var sx = window.scrollX || document.documentElement.scrollLeft || 0;
    var sy = window.scrollY || document.documentElement.scrollTop || 0;
    if (ax == null) { ax = viewW() / 2; ay = viewH() / 2; }
    var cx = (sx + ax) / zoom, cy = (sy + ay) / zoom;   // 캔버스 좌표계로 환산
    zoom = z;
    paintRoot();
    // 커서 아래를 붙잡아 두는 보정이라 즉시여야 한다 — 애니메이션이 붙으면 배율만 먼저
    // 바뀌고 위치가 뒤늦게 따라와 화면이 흔들린다.
    window.scrollTo({ left: Math.max(0, cx * z - ax), top: Math.max(0, cy * z - ay), behavior: 'auto' });
    paintUI();
  }

  function paintRoot() {
    if (!root) return;
    root.style.transformOrigin = '0 0';
    root.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')';
  }

  // 컨테이너 style 은 런타임이 건드리지 않지만, 혹시 지워지면 되돌린다.
  // 문자열이 아니라 실제 계산된 배율로 비교해야 되돌리기가 무한 반복되지 않는다.
  function guardRoot() {
    if (!root) return;
    var m = /matrix\(\s*([-\d.]+)/.exec(getComputedStyle(root).transform || '');
    var cur = m ? parseFloat(m[1]) : 1;
    if (Math.abs(cur - zoom) > 0.001) paintRoot();
  }

  function refit(pass) {
    if (mode !== 'fit') return;
    var z = fitZoom();
    if (Math.abs(z - zoom) <= 0.0005) return;
    apply(z, 0, 0);
    // 배율이 바뀌면서 세로 스크롤바가 생기거나 사라져 창 폭이 달라졌을 수 있다.
    if ((pass || 0) < 2) requestAnimationFrame(function () { refit((pass || 0) + 1); });
  }

  function setFit() { mode = 'fit'; save(); refit(0); paintUI(); }
  function setZoom(z, ax, ay) { mode = 'manual'; apply(z, ax, ay); save(); }
  function step(f) { setZoom(zoom * f); }

  /* ── 조작 막대 ─────────────────────────────────────────────── */

  function btn(text, title, onClick, wide) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.title = title;
    b.style.cssText = 'box-sizing:border-box;font:inherit;font-size:' + (wide ? '11px' : '15px') +
      ';font-weight:600;line-height:1;color:#35455F;background:transparent;border:none;border-radius:8px;' +
      'padding:' + (wide ? '6px 9px' : '6px 8px') + ';min-width:' + (wide ? '0' : '26px') + ';cursor:pointer;transition:background .15s,color .15s';
    b.addEventListener('mouseenter', function () { if (!b.dataset.on) b.style.background = '#F1F5FB'; });
    b.addEventListener('mouseleave', function () { if (!b.dataset.on) b.style.background = 'transparent'; });
    b.addEventListener('click', function (e) { e.preventDefault(); onClick(); });
    return b;
  }

  function buildUI() {
    var bar = document.createElement('div');
    bar.id = 'dc-zoom-ui';
    bar.setAttribute('data-dc-zoom', '');
    bar.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:2px;' +
      'padding:4px 5px;background:rgba(255,255,255,.94);border:1px solid #E2E9F4;border-radius:12px;' +
      'box-shadow:0 6px 22px rgba(22,34,58,.13);backdrop-filter:saturate(180%) blur(8px);' +
      "font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,monospace;color:#16223A;user-select:none";

    var out = btn('−', '축소  ( - 키 )', function () { step(1 / STEP); });
    pctEl = document.createElement('span');
    pctEl.title = '현재 배율';
    pctEl.style.cssText = 'box-sizing:border-box;min-width:46px;text-align:center;font-size:11px;letter-spacing:.02em;color:#5A6B87';
    var into = btn('＋', '확대  ( + 키 )', function () { step(STEP); });

    var sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:16px;background:#E2E9F4;margin:0 3px';

    fitEl = btn('맞춤', '창 폭에 맞춤  ( 1 키 )  ·  ctrl/⌘ + 휠로도 조절합니다', setFit, true);
    oneEl = btn('100%', '원래 크기  ( 0 키 )', function () { setZoom(1); }, true);

    bar.appendChild(out); bar.appendChild(pctEl); bar.appendChild(into);
    bar.appendChild(sep); bar.appendChild(fitEl); bar.appendChild(oneEl);

    var css = document.createElement('style');
    css.textContent =
      // 가로로 밀다가 끝에 닿으면 사파리가 그 제스처를 뒤로가기/앞으로가기로 가져간다.
      // 캔버스 문서에서는 좌우 이동이 본래 조작이므로 스크롤이 밖으로 새지 않게 막는다.
      'html{overscroll-behavior-x:none}' +
      '@media print{#dc-zoom-ui{display:none!important}}';
    document.head.appendChild(css);
    document.body.appendChild(bar);
  }

  function paintUI() {
    if (!pctEl) return;
    pctEl.textContent = Math.round(zoom * 100) + '%';
    mark(fitEl, mode === 'fit');
    mark(oneEl, mode !== 'fit' && Math.abs(zoom - 1) < 0.005);
  }
  function mark(b, on) {
    if (!b) return;
    if (on) { b.dataset.on = '1'; b.style.background = '#16223A'; b.style.color = '#fff'; }
    else { delete b.dataset.on; b.style.background = 'transparent'; b.style.color = '#35455F'; }
  }

  /* ── 입력 ──────────────────────────────────────────────────── */

  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) {            // 트랙패드 핀치도 ctrlKey 로 들어온다
      e.preventDefault();
      var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      // 핀치는 잘게(한 번에 몇 %), 휠은 한 칸에 1.3배 — 둘 다 같은 식으로 처리한다.
      var f = Math.min(1.3, Math.max(1 / 1.3, Math.exp(-d * 0.0075)));
      setZoom(zoom * f, e.clientX, e.clientY);
      return;
    }
    guardSwipe(e);
  }

  // overscroll-behavior 만으로는 사파리가 가로 스와이프를 뒤로가기로 가져가는 것을
  // 다 막지 못한다. 가로가 우세한 휠은 스크롤을 직접 끝까지 먹인 뒤 남는 만큼을 삼킨다.
  function guardSwipe(e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // 세로 스크롤은 건드리지 않는다
    var el = document.scrollingElement || document.documentElement;
    var max = el.scrollWidth - el.clientWidth;
    var next = el.scrollLeft + e.deltaX;
    if (max > 1 && next >= 0 && next <= max) return;        // 아직 스크롤할 여유가 있다
    if (max > 1) el.scrollLeft = next < 0 ? 0 : max;        // 남은 끝까지는 밀어 준다
    e.preventDefault();
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === '-' || e.key === '_') step(1 / STEP);
    else if (e.key === '+' || e.key === '=') step(STEP);
    else if (e.key === '0') setZoom(1);
    else if (e.key === '1') setFit();
    else return;
    e.preventDefault();
  }

  /* ── 시작 ──────────────────────────────────────────────────── */

  function start() {
    restore();
    buildUI();
    paintRoot();
    if (mode === 'fit') refit(0); else apply(zoom, 0, 0);
    paintUI();

    try {
      new MutationObserver(guardRoot).observe(root, { attributes: true, attributeFilter: ['style'] });
    } catch (e) {}

    // 폰트·이미지가 늦게 붙으면서 폭이 자랄 수 있다 — 잠깐 더 지켜본다.
    [300, 900, 2000].forEach(function (ms) { setTimeout(function () { refit(0); }, ms); });

    window.addEventListener('resize', function () { refit(0); });
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('keydown', onKey);

    // 문서를 접었다 펴면(마인드맵의 "태스크 모두 접기") 캔버스 크기가 바뀐다.
    try {
      var inner = root.firstElementChild;
      if (inner) new ResizeObserver(function () { refit(0); }).observe(inner);
    } catch (e) {}
  }

  // 런타임이 그리기를 끝내야 폭을 잴 수 있다 — #dc-root 에 내용이 붙을 때까지 기다린다.
  function boot(tries) {
    root = document.getElementById('dc-root');
    if (root && root.firstElementChild && root.scrollWidth > 0 && document.body) { start(); return; }
    if (tries > 0) setTimeout(function () { boot(tries - 1); }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(150); });
  } else {
    boot(150);
  }
})();
