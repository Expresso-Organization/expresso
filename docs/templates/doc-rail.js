/*
 * doc-rail.js — 긴 문서를 읽는 동안 「지금 어디쯤인가」를 오른쪽에 띄운다.
 *
 *   <script src="./templates/doc-rail.js" defer></script>
 *
 * 어느 문서에도 붙는다. 저장소 배관에 기대지 않고, 자기가 붙을 수 있는지
 * 스스로 판단해 안 되면 조용히 물러선다.
 *
 * ── 무엇을 보여 주는가
 *
 * 쪽 번호와 미니맵 둘이다.
 *
 * **쪽 번호**는 `scripts/doc-pdf.mjs` 가 PDF 를 뽑을 때 재어 제목마다
 * `data-page` 로 새겨 둔 값이다. 화면과 인쇄는 줄바꿈이 달라 브라우저가 혼자
 * 세면 실제 PDF 와 어긋난다 — 그래서 세지 않고 **새겨 둔 값을 읽는다.** 제목과
 * 제목 사이는 높이 비율로 잇는다.
 *
 * 새겨 둔 값이 없으면 쪽 칸을 만들지 않고 미니맵만 띄운다. 「대략 몇 쪽」을
 * 지어내면 읽는 사람은 그것을 진짜로 믿는다.
 *
 * **미니맵**은 지면을 그대로 줄인 것이다. 지면을 한 벌 복제해 `transform:
 * scale` 로 줄이고, 보고 있는 자리가 가운데 오도록 밀어 올린다. 창은 그 위에
 * 얹는다. 구조를 막대로 다시 그리지 않는 이유는, 그리는 순간 실제 지면과
 * 어긋나기 시작하고 그 어긋남을 아무도 눈치채지 못하기 때문이다.
 *
 * 문서 전체를 레일 높이에 욱여넣지 않는다. 20만 픽셀을 800픽셀로 누르면
 * 회색 얼룩이 된다. 보고 있는 자리 앞뒤만 담고, 전체 중 어디인지는 쪽 번호와
 * 진행 막대가 말한다.
 *
 * ── 언제 물러서는가
 *
 * · 가로가 좁을 때 · 지면(`main.sheet`)을 못 찾을 때 · 사람이 접었을 때
 * 접은 것은 문서별로 기억한다. 인쇄에는 나가지 않는다.
 */
(function () {
  'use strict';
  if (window.__exDocRail) return;
  window.__exDocRail = true;

  var RAIL_W = 208;        // 펼친 레일 폭
  var FOLD_W = 34;         // 접은 레일 폭
  var GAP = 18;            // 오른쪽 여백
  var MIN_ROOM = 1400;     // 이 아래로는 띄우지 않는다

  var sheet, rail, map, clip, ghost, win, pageNow, barFill, cuts;
  var folded = false, scale = 0, sheetTop = 0, total = 0, pagedAt = '';
  var heads = [];          // { el, page, top }  top 은 지면 기준
  var pageTops = [];       // pageTops[n] = n 쪽이 시작하는 자리(지면 기준)
  var gaps = [];           // 쪽과 쪽 사이에 얹는 띠. 다시 쓴다.
  var KEY = 'ex-doc-rail:' + location.pathname;

  /* ── 붙을 수 있는 문서인가 ─────────────────────────────────────── */
  function boot() {
    sheet = document.querySelector('main.sheet');
    if (!sheet) return;

    total = +(sheet.getAttribute('data-doc-pages') || 0);
    pagedAt = sheet.getAttribute('data-doc-paged-at') || '';
    folded = localStorage.getItem(KEY) === 'folded';

    heads = [].slice.call(sheet.querySelectorAll('[data-page]'))
      .map(function (el) { return { el: el, page: +el.getAttribute('data-page'), top: 0 }; })
      .filter(function (h) { return h.page > 0; });

    build();
    relayout();

    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', debounce(relayout, 150));

    /* 닻 자리는 한 번 재어 두고 쓴다 — 스크롤마다 169개를 다시 재면 버벅인다.
       그런데 지면이 자라면 그 값이 통째로 어긋난다. 비율을 적어 두지 않은
       그림 하나가 늦게 오면 그 아래가 전부 밀리고, 레일은 태연히 틀린 쪽을
       말한다(실제로 31쪽과 65쪽만큼 벌어졌다). 그래서 높이가 바뀌면 다시 잰다. */
    var was = 0;
    if (window.ResizeObserver) {
      new ResizeObserver(debounce(function () {
        if (Math.abs(sheet.offsetHeight - was) < 2) return;
        was = sheet.offsetHeight;
        relayout();
      }, 120)).observe(sheet);
    } else {
      addEventListener('load', relayout);
      if (document.fonts) document.fonts.ready.then(relayout);
    }
  }

  /* ── 레일을 만든다 ─────────────────────────────────────────────── */
  function build() {
    style();

    rail = document.createElement('div');
    rail.className = 'ex-rail';
    rail.innerHTML =
      '<button class="ex-rail-fold" type="button"></button>' +
      (total
        ? '<div class="ex-rail-page"><span class="ex-rail-now">–</span>' +
          '<span class="ex-rail-of">/ ' + total + '쪽</span></div>' +
          '<div class="ex-rail-bar"><i></i></div>'
        : '') +
      '<div class="ex-rail-map"><div class="ex-rail-clip"></div>' +
      '<div class="ex-rail-cuts"></div><div class="ex-rail-win"></div></div>' +
      (pagedAt ? '<div class="ex-rail-note">' + pagedAt + ' 출력 기준</div>' : '');
    document.body.appendChild(rail);

    map = rail.querySelector('.ex-rail-map');
    clip = rail.querySelector('.ex-rail-clip');
    win = rail.querySelector('.ex-rail-win');
    pageNow = rail.querySelector('.ex-rail-now');
    barFill = rail.querySelector('.ex-rail-bar i');
    cuts = rail.querySelector('.ex-rail-cuts');

    rail.querySelector('.ex-rail-fold').addEventListener('click', fold);
    map.addEventListener('click', jump);
  }

  /* 지면을 한 벌 복제해 줄인다. 실제로 띄울 때만 만든다 — 20만 픽셀짜리
     문서를 두 번 앉히는 일이라, 좁은 창이나 PDF 출력에서까지 할 이유가 없다.

     `main` 을 그대로 복제하지 않고 `div` 에 옮겨 담는다. 복제본이 `main` 이면
     `main > section.sec` 으로 훑는 도구가 지면을 두 벌로 세고, 그때 어긋나는
     것은 목차와 쪽 번호다(`scripts/doc-pdf.mjs` 에서 실제로 겪었다).

     복제본은 읽히지도 눌리지도 않아야 한다 — 안의 링크가 탭 이동에 잡히면
     키보드로 읽는 사람이 문서를 두 번 지난다. */
  function makeGhost() {
    ghost = document.createElement('div');
    ghost.className = sheet.className + ' ex-rail-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = sheet.innerHTML;
    [].forEach.call(ghost.querySelectorAll('a,button,input,select,textarea,[tabindex],[id]'),
      function (n) { n.setAttribute('tabindex', '-1'); n.removeAttribute('id'); });
    clip.appendChild(ghost);
  }

  function fold() {
    folded = !folded;
    try { localStorage.setItem(KEY, folded ? 'folded' : ''); } catch (e) { /* 사파리 비공개 */ }
    relayout();
  }

  /* 누른 자리가 창의 가운데로 오도록 옮긴다 */
  function jump(e) {
    var r = map.getBoundingClientRect();
    var y = sheetTop + shownTop() + (e.clientY - r.top) / scale - innerHeight / 2;
    var max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: Math.max(0, Math.min(max, y)), behavior: motion() });
  }

  /* ── 잰다 ──────────────────────────────────────────────────────── */
  function relayout() {
    var room = innerWidth >= MIN_ROOM;
    rail.style.display = room ? '' : 'none';

    // 지면은 가운데 정렬이라 레일이 덮을 수 있다. 레일이 선 만큼 본문을 민다.
    document.body.style.paddingRight = room ? ((folded ? FOLD_W : RAIL_W) + GAP * 2) + 'px' : '';
    rail.classList.toggle('is-folded', folded);
    if (!room || folded) return;

    if (!ghost) makeGhost();

    sheetTop = sheet.getBoundingClientRect().top + scrollY;
    scale = map.clientWidth / sheet.offsetWidth;

    ghost.style.width = sheet.offsetWidth + 'px';
    ghost.style.transform = 'scale(' + scale + ')';
    win.style.height = Math.max(2, Math.round(innerHeight * scale)) + 'px';

    heads.forEach(function (h) {
      h.top = h.el.getBoundingClientRect().top + scrollY - sheetTop;
    });
    buildPageTops();

    draw();
  }

  /* 쪽이 시작하는 자리를 닻 사이에서 뽑는다.

     닻은 제목에만 있어 쪽마다 하나씩 있지는 않다(169개로 205쪽). 닻 둘 사이는
     높이를 쪽수로 나눠 채운다 — 그 구간의 쪽들이 고르게 이어진다고 보는 것이다.
     한 쪽이 그림 한 장으로 차 있으면 조금 어긋나지만, 미니맵에서 그 차이는
     몇 픽셀이다.

     맨 앞 몇 쪽은 표지와 목차라 본문에 자리가 없다(첫 닻이 5쪽이다). 그 쪽들은
     경계를 그리지 않는다 — 없는 자리에 선을 그으면 첫 지면이 잘려 보인다. */
  function buildPageTops() {
    pageTops = [];
    if (!heads.length || !total) return;

    for (var i = 0; i < heads.length; i += 1) {
      var a = heads[i], b = heads[i + 1];
      var toPage = b ? b.page : total + 1;
      var toTop = b ? b.top : sheet.offsetHeight;
      var n = Math.max(1, toPage - a.page);
      for (var k = 0; k < n; k += 1) {
        // 먼저 잡은 자리를 그대로 둔다. 한 쪽에 제목이 둘이면(장 제목과 첫 절)
        // 나중 것으로 덮어쓰게 되고, 그러면 경계가 쪽 한가운데로 내려간다.
        if (pageTops[a.page + k] == null) {
          pageTops[a.page + k] = a.top + (toTop - a.top) * (k / n);
        }
      }
    }
  }

  /* 쪽과 쪽 사이를 띠로 끊는다. 미니맵은 지면을 이어 붙인 한 덩어리라, 끊지
     않으면 어디서 쪽이 바뀌는지 알 수 없다.

     띠는 내용을 밀지 않고 덮는다. 밀려면 지면을 쪽마다 잘라 따로 앉혀야 하고,
     그러려면 복제본이 보이는 쪽 수만큼 필요하다 — 20만 픽셀짜리 문서에 그럴
     수는 없다. 이 배율에서 띠가 가리는 것은 한 줄 남짓이다.

     띠는 만들어 두고 다시 쓴다. 스크롤마다 새로 만들면 한 번에 수백 개가
     생겼다 사라진다. */
  function drawCuts(top, view) {
    var shown = 0;

    for (var n = 2; n <= total; n += 1) {
      var y = pageTops[n];
      if (y == null) continue;
      if (y < top) continue;
      if (y > top + view) break;

      var g = gaps[shown];
      if (!g) {
        g = document.createElement('div');
        g.className = 'ex-rail-cut';
        g.innerHTML = '<i></i><b></b>';
        cuts.appendChild(g);
        gaps[shown] = g;
      }
      g.style.display = '';
      g.style.transform = 'translateY(' + Math.round((y - top) * scale) + 'px)';
      g.lastChild.textContent = n;
      shown += 1;
    }

    for (var j = shown; j < gaps.length; j += 1) gaps[j].style.display = 'none';
  }

  /* ── 따라간다 ──────────────────────────────────────────────────── */
  var ticking = false;
  function onScroll() {
    if (ticking || folded || rail.style.display === 'none') return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; draw(); });
  }

  function draw() {
    var view = scrollY - sheetTop;                       // 지면 기준 창 위치
    var span = Math.max(1, document.documentElement.scrollHeight - innerHeight);

    if (pageNow) {
      pageNow.textContent = pageAt(view + innerHeight * 0.35);
      barFill.style.width = Math.min(100, Math.max(0, scrollY / span * 100)) + '%';
    }

    var t = shownTop();
    ghost.style.marginTop = Math.round(-t * scale) + 'px';
    win.style.transform = 'translateY(' + Math.round((view - t) * scale) + 'px)';
    drawCuts(t, map.clientHeight / scale);
  }

  /* 미니맵이 담는 구간의 맨 위(지면 기준). 문서의 처음과 끝에서는 넘어가지
     않도록 붙인다 — 안 그러면 빈 자리가 생겨 어디가 끝인지 알 수 없다. */
  function shownTop() {
    var view = map.clientHeight / scale;
    var max = Math.max(0, sheet.offsetHeight - view);
    return Math.max(0, Math.min(max, scrollY - sheetTop + innerHeight / 2 - view / 2));
  }

  /* 새겨 둔 쪽 번호 사이를 잇는다. 제목 둘 사이는 높이 비율로 나눈다 —
     한 절이 여러 쪽이면 그 안에서도 번호가 올라가야 한다. */
  function pageAt(at) {
    if (!heads.length) return '–';
    if (at <= heads[0].top) return heads[0].page;

    for (var i = heads.length - 1; i >= 0; i -= 1) {
      if (at < heads[i].top) continue;
      var a = heads[i], b = heads[i + 1];
      if (!b) {
        var restH = Math.max(1, sheet.offsetHeight - a.top);
        var restP = Math.max(0, total - a.page);
        return Math.min(total, a.page + Math.floor((at - a.top) / restH * restP));
      }
      if (b.page <= a.page) return a.page;
      var f = (at - a.top) / Math.max(1, b.top - a.top);
      return a.page + Math.floor(Math.min(1, Math.max(0, f)) * (b.page - a.page));
    }
    return heads[0].page;
  }

  /* ── 잡동사니 ──────────────────────────────────────────────────── */
  function motion() {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }
    catch (e) { return 'smooth'; }
  }
  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  /* ── 모양 ──────────────────────────────────────────────────────
     색은 전부 문서의 토큰에서 가져온다. 여기서 색을 새로 만들지 않는다 —
     양식이 바뀌면 레일도 함께 바뀌어야 한다. 토큰이 없는 문서에 붙을 때를
     위해서만 뒤에 값을 하나씩 달아 둔다. */
  function style() {
    var css = [
      '.ex-rail{position:fixed;right:' + GAP + 'px;top:92px;bottom:24px;width:' + RAIL_W + 'px;',
      '  display:flex;flex-direction:column;gap:10px;z-index:40;box-sizing:border-box;',
      '  background:var(--ex-white,#fff);border:1px solid var(--ex-line-200,#E6EAF0);',
      '  border-radius:14px;padding:12px}',
      '.ex-rail.is-folded{width:' + FOLD_W + 'px;padding:8px 6px}',
      '.ex-rail.is-folded>*:not(.ex-rail-fold){display:none}',

      '.ex-rail-fold{align-self:flex-end;width:20px;height:20px;flex:none;cursor:pointer;',
      '  border:none;background:transparent;padding:0;position:relative}',
      '.ex-rail-fold::before{content:"";position:absolute;inset:4px;border-radius:3px;',
      '  border:1.5px solid var(--ex-slate-400,#8B97A8)}',
      '.ex-rail-fold::after{content:"";position:absolute;top:4px;bottom:4px;right:7px;',
      '  border-left:1.5px solid var(--ex-slate-400,#8B97A8)}',
      '.ex-rail-fold:hover::before,.ex-rail-fold:hover::after{border-color:var(--ex-espresso,#7A3B2E)}',

      '.ex-rail-page{display:flex;align-items:baseline;gap:5px;padding:0 2px;flex:none}',
      '.ex-rail-now{font-family:var(--ex-font-num,var(--ex-font-mono,monospace));font-weight:300;',
      '  font-size:26px;line-height:1;color:var(--ex-espresso,#7A3B2E)}',
      '.ex-rail-of{font-family:var(--ex-font-mono,monospace);font-size:11px;',
      '  color:var(--ex-slate-400,#8B97A8)}',

      '.ex-rail-bar{height:2px;flex:none;border-radius:2px;position:relative;overflow:hidden;',
      '  background:var(--ex-line-200,#E6EAF0)}',
      '.ex-rail-bar i{position:absolute;left:0;top:0;bottom:0;width:0;display:block;',
      '  background:var(--ex-espresso,#7A3B2E)}',

      '.ex-rail-map{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;cursor:pointer;',
      '  border-radius:8px;background:var(--ex-tint-50,#F7F8FA)}',
      '.ex-rail-clip{position:absolute;inset:0;overflow:hidden}',

      // 쪽과 쪽 사이. 띠가 지면을 끊고, 그 위에 다음 쪽 번호를 얹는다.
      '.ex-rail-cuts{position:absolute;inset:0;overflow:hidden;pointer-events:none}',
      '.ex-rail-cut{position:absolute;left:0;right:0;top:0;height:13px;',
      '  margin-top:-6px;background:var(--ex-tint-50,#F7F8FA)}',
      '.ex-rail-cut i{position:absolute;left:0;right:0;top:6px;height:0;display:block;',
      '  border-top:1px solid var(--ex-line-200,#E6EAF0)}',
      '.ex-rail-cut b{position:absolute;right:2px;top:0;font-family:var(--ex-font-mono,monospace);',
      '  font-size:7.5px;font-weight:400;line-height:13px;color:var(--ex-slate-400,#8B97A8)}',
      '.ex-rail-ghost{transform-origin:0 0;pointer-events:none;user-select:none;',
      '  margin:0;box-shadow:none;border:none;background:transparent}',
      '.ex-rail-win{position:absolute;left:0;right:0;top:0;pointer-events:none;',
      '  border:1.5px solid var(--ex-espresso,#7A3B2E);border-radius:3px;',
      '  background:rgba(122,59,46,.06)}',

      '.ex-rail-note{flex:none;font-family:var(--ex-font-mono,monospace);font-size:9px;',
      '  letter-spacing:.04em;color:var(--ex-slate-400,#8B97A8);text-align:right}',

      '@media print{.ex-rail{display:none!important}body{padding-right:0!important}}',
    ].join('\n');
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
