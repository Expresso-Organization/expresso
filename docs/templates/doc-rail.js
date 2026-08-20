/*
 * doc-rail.js — 긴 문서를 읽는 동안 「지금 몇 쪽인가」를 오른쪽에 띄운다.
 *
 *   <script src="./templates/doc-rail.js" defer></script>
 *
 * 어느 문서에도 붙는다. 저장소 배관에 기대지 않고, 자기가 붙을 수 있는지
 * 스스로 판단해 안 되면 조용히 물러선다.
 *
 * ── 쪽 번호
 *
 * `scripts/doc-pdf.mjs` 가 PDF 를 뽑을 때 재어 제목마다 `data-page` 로 새겨 둔
 * 값이다. 화면과 인쇄는 줄바꿈이 달라 브라우저가 혼자 세면 실제 PDF 와
 * 어긋난다 — 그래서 세지 않고 **새겨 둔 값을 읽는다.**
 *
 * 새겨 둔 값이 없으면 아무것도 띄우지 않는다. 「대략 몇 쪽」을 지어내면 읽는
 * 사람은 그것을 진짜로 믿는다.
 *
 * ── 축소판
 *
 * 낱장으로 쌓는다. PDF 뷰어의 쪽 목록과 같은 모양이고, 지금 읽는 쪽에 테를
 * 두른다. 눌러서 그 쪽으로 간다.
 *
 * **카드마다 제 지면을 한 벌씩 갖는다.** 한 벌을 여러 카드가 나눠 볼 방법이
 * 없어서다 — DOM 은 한 요소를 두 곳에 놓지 못한다. 대신 **보이는 만큼만**
 * 만들어 두고 돌려 쓴다. 스크롤할 때 바뀌는 것은 각 카드가 가리키는 자리뿐이고,
 * 복제는 다시 일어나지 않는다. 이 문서(17,006 노드)에서 한 벌이 약 110ms 라,
 * 여섯 벌이면 처음 한 번 0.7초다.
 *
 * 카드의 세로 비율은 A4 가 아니라 **그 쪽이 화면에서 차지하는 만큼**이다. 화면
 * 지면은 820px 폭이고 한 쪽이 약 945px 라 A4 보다 조금 납작하다. A4 로 맞추려면
 * 내용을 잘라야 하는데, 잘린 줄은 어느 쪽에도 나타나지 않게 된다.
 *
 * ── 쪽 경계
 *
 * 닻(`data-page`)은 제목에만 있어 쪽마다 하나씩 있지는 않다(169개로 205쪽).
 * 닻 둘 사이는 높이를 쪽수로 나눠 채운다. 한 쪽에 제목이 둘이면 먼저 잡은
 * 자리를 그대로 둔다 — 나중 것으로 덮으면 경계가 쪽 한가운데로 내려간다.
 *
 * 표지와 목차는 PDF 를 뽑을 때 끼워 넣는 것이라 HTML 에 자리가 없다(첫 닻이
 * 5쪽이다). 그 앞부분은 첫 카드에 함께 담는다 — 빼면 제목이 어느 카드에도
 * 안 나온다.
 *
 * ── 언제 물러서는가
 *
 * · 가로가 좁을 때 · 지면(`main.sheet`)을 못 찾을 때 · 쪽 번호가 없을 때
 * · 사람이 접었을 때. 접은 것은 문서별로 기억한다. 인쇄에는 나가지 않는다.
 */
(function () {
  'use strict';
  if (window.__exDocRail) return;
  window.__exDocRail = true;

  var RAIL_W = 208;        // 펼친 레일 폭
  var FOLD_W = 34;         // 접은 레일 폭
  var EDGE = 18;           // 오른쪽 여백
  var MIN_ROOM = 1400;     // 이 아래로는 띄우지 않는다
  var CARD_GAP = 14;       // 낱장 사이
  var POOL_MAX = 8;        // 만들어 둘 카드 수의 상한

  var sheet, rail, map, deck, pageNow, barFill;
  var folded = false, scale = 0, sheetTop = 0, total = 0, pagedAt = '';
  var heads = [];          // { el, page, top }  top 은 지면 기준
  var pageTops = [];       // pageTops[n] = n 쪽이 시작하는 자리(지면 기준)
  var first = 0;           // 카드를 만드는 첫 쪽. 그 앞은 표지·목차라 자리가 없다.
  var cards = [];          // { el, face, ghost, num, page } — 돌려 쓴다
  var KEY = 'ex-doc-rail:' + location.pathname;

  /* ── 붙을 수 있는 문서인가 ─────────────────────────────────────── */
  function boot() {
    sheet = document.querySelector('main.sheet');
    if (!sheet) return;

    total = +(sheet.getAttribute('data-doc-pages') || 0);
    pagedAt = sheet.getAttribute('data-doc-paged-at') || '';

    heads = [].slice.call(sheet.querySelectorAll('[data-page]'))
      .map(function (el) { return { el: el, page: +el.getAttribute('data-page'), top: 0 }; })
      .filter(function (h) { return h.page > 0; });

    if (!total || !heads.length) return;   // 쪽 번호가 없는 문서다

    first = heads[0].page;
    folded = localStorage.getItem(KEY) === 'folded';

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
      '<div class="ex-rail-page"><span class="ex-rail-now">–</span>' +
      '<span class="ex-rail-of">/ ' + total + '쪽</span></div>' +
      '<div class="ex-rail-bar"><i></i></div>' +
      '<div class="ex-rail-map"><div class="ex-rail-deck"></div></div>' +
      (pagedAt ? '<div class="ex-rail-note">' + pagedAt + ' 출력 기준</div>' : '');
    document.body.appendChild(rail);

    map = rail.querySelector('.ex-rail-map');
    deck = rail.querySelector('.ex-rail-deck');
    pageNow = rail.querySelector('.ex-rail-now');
    barFill = rail.querySelector('.ex-rail-bar i');

    rail.querySelector('.ex-rail-fold').addEventListener('click', fold);
    map.addEventListener('click', jump);
  }

  /* 카드 한 장. 지면을 한 벌 복제해 넣고, 겉에서 한 쪽만큼만 보이게 자른다.

     `main` 을 그대로 복제하지 않고 `div` 에 옮겨 담는다. 복제본이 `main` 이면
     `main > section.sec` 으로 훑는 도구가 지면을 여러 벌로 세고, 그때 어긋나는
     것은 목차와 쪽 번호다(`scripts/doc-pdf.mjs` 에서 실제로 겪었다).

     복제본은 읽히지도 눌리지도 않아야 한다 — 안의 링크가 탭 이동에 잡히면
     키보드로 읽는 사람이 문서를 여러 번 지난다. */
  function makeCard() {
    var el = document.createElement('div');
    el.className = 'ex-rail-card';
    el.innerHTML = '<div class="ex-rail-face"></div><span class="ex-rail-num"></span>';

    var ghost = document.createElement('div');
    ghost.className = sheet.className + ' ex-rail-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = sheet.innerHTML;
    [].forEach.call(ghost.querySelectorAll('a,button,input,select,textarea,[tabindex],[id]'),
      function (n) { n.setAttribute('tabindex', '-1'); n.removeAttribute('id'); });

    var face = el.firstChild;
    face.appendChild(ghost);
    deck.appendChild(el);

    return { el: el, face: face, ghost: ghost, num: el.lastChild, page: 0 };
  }

  function fold() {
    folded = !folded;
    try { localStorage.setItem(KEY, folded ? 'folded' : ''); } catch (e) { /* 사파리 비공개 */ }
    relayout();
  }

  /* ── 자리 계산 ─────────────────────────────────────────────────── */

  /* 쪽이 시작하는 자리를 닻 사이에서 뽑는다. */
  function buildPageTops() {
    pageTops = [];
    for (var i = 0; i < heads.length; i += 1) {
      var a = heads[i], b = heads[i + 1];
      var toPage = b ? b.page : total + 1;
      var toTop = b ? b.top : sheet.offsetHeight;
      var n = Math.max(1, toPage - a.page);
      for (var k = 0; k < n; k += 1) {
        if (pageTops[a.page + k] == null) {
          pageTops[a.page + k] = a.top + (toTop - a.top) * (k / n);
        }
      }
    }
    // 첫 닻 위의 머리말은 첫 카드에 함께 담는다.
    pageTops[first] = 0;
    pageTops[total + 1] = sheet.offsetHeight;

    // 빠진 쪽이 있으면 앞 값을 물려 준다 — 카드 높이가 음수가 되지 않게.
    for (var p = first; p <= total + 1; p += 1) {
      if (pageTops[p] == null) pageTops[p] = pageTops[p - 1];
    }
  }

  function pageH(n) { return Math.max(1, pageTops[n + 1] - pageTops[n]); }

  /* 카드가 쌓인 자리(덱 좌표). 쪽 높이를 줄인 값에 낱장 사이 틈을 더한다. */
  function deckTop(n) {
    return (pageTops[n] - pageTops[first]) * scale + (n - first) * CARD_GAP;
  }

  /* 지면의 어느 자리가 덱에서 어디인지 */
  function toDeck(y) {
    var n = pageOf(y);
    return deckTop(n) + (y - pageTops[n]) * scale;
  }

  function pageOf(y) {
    var lo = first, hi = total;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (pageTops[mid] <= y) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /* ── 잰다 ──────────────────────────────────────────────────────── */
  function relayout() {
    var room = innerWidth >= MIN_ROOM;
    rail.style.display = room ? '' : 'none';

    // 지면은 가운데 정렬이라 레일이 덮을 수 있다. 레일이 선 만큼 본문을 민다.
    document.body.style.paddingRight = room ? ((folded ? FOLD_W : RAIL_W) + EDGE * 2) + 'px' : '';
    rail.classList.toggle('is-folded', folded);
    if (!room || folded) return;

    sheetTop = sheet.getBoundingClientRect().top + scrollY;
    scale = deck.clientWidth / sheet.offsetWidth;

    heads.forEach(function (h) {
      h.top = h.el.getBoundingClientRect().top + scrollY - sheetTop;
    });
    buildPageTops();

    /* 화면에 담기는 카드 수 + 앞뒤 하나씩. 복제는 여기서만 일어난다.

       첫 쪽 높이로 재면 안 된다 — 그 카드만 머리말을 함께 담아 유난히 크고,
       그러면 카드를 서넛만 만들어 아래가 빈다. 평균으로 잡는다. */
    var avg = sheet.offsetHeight / Math.max(1, total - first + 1);
    var need = Math.min(POOL_MAX,
      Math.ceil(map.clientHeight / (avg * scale + CARD_GAP)) + 2);
    while (cards.length < need) cards.push(makeCard());

    draw();
  }

  /* ── 따라간다 ──────────────────────────────────────────────────── */
  var ticking = false;
  function onScroll() {
    if (ticking || folded || rail.style.display === 'none') return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; draw(); });
  }

  function draw() {
    if (!scale) return;

    var view = scrollY - sheetTop;                 // 지면 기준 창 위치
    var eye = view + innerHeight * 0.35;           // 「지금 읽는 자리」
    var now = Math.min(total, Math.max(first, pageOf(eye)));

    pageNow.textContent = now;
    var span = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    barFill.style.width = Math.min(100, Math.max(0, scrollY / span * 100)) + '%';

    // 읽는 자리가 축소판 가운데 오도록 덱을 민다. 처음과 끝에서는 붙인다.
    var full = deckTop(total) + pageH(total) * scale;
    var off = Math.max(0, Math.min(Math.max(0, full - map.clientHeight),
      toDeck(eye) - map.clientHeight / 2));
    deck.style.transform = 'translateY(' + Math.round(-off) + 'px)';

    // 지금 창에 들어오는 쪽들에 카드를 배정한다. 복제는 하지 않는다.
    var start = Math.max(first, now - Math.floor(cards.length / 2));
    if (deckTop(start) - off > 0) start = Math.max(first, pageOf(invDeck(off)));
    start = Math.min(start, Math.max(first, total - cards.length + 1));

    for (var i = 0; i < cards.length; i += 1) {
      var c = cards[i], p = start + i;
      if (p > total) { c.el.style.display = 'none'; continue; }

      var h = Math.round(pageH(p) * scale);
      c.el.style.display = '';
      c.el.style.transform = 'translateY(' + Math.round(deckTop(p)) + 'px)';
      c.el.style.height = h + 'px';
      c.el.classList.toggle('is-now', p === now);

      if (c.page !== p) {
        c.page = p;
        c.num.textContent = p;
        c.ghost.style.width = sheet.offsetWidth + 'px';
        c.ghost.style.transform = 'scale(' + scale + ')';
        c.ghost.style.marginTop = Math.round(-pageTops[p] * scale) + 'px';
      }
    }
  }

  /* 덱 좌표 → 지면 좌표. 틈에 떨어지면 그 다음 쪽의 머리로 본다. */
  function invDeck(dy) {
    var lo = first, hi = total;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (deckTop(mid) <= dy) lo = mid; else hi = mid - 1;
    }
    var into = (dy - deckTop(lo)) / scale;
    return pageTops[lo] + Math.max(0, Math.min(pageH(lo), into));
  }

  /* 누른 쪽의 머리로 간다 */
  function jump(e) {
    var r = map.getBoundingClientRect();
    var off = -parseFloat((deck.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0;
    var y = invDeck(off + (e.clientY - r.top));
    var max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: Math.max(0, Math.min(max, sheetTop + y)), behavior: motion() });
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
      '.ex-rail{position:fixed;right:' + EDGE + 'px;top:92px;bottom:24px;width:' + RAIL_W + 'px;',
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

      // 낱장이 쌓이는 자리
      '.ex-rail-map{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;cursor:pointer;',
      '  border-radius:8px;background:var(--ex-tint-50,#F7F8FA)}',
      '.ex-rail-deck{position:absolute;left:8px;right:8px;top:8px;will-change:transform}',

      // 낱장 하나. 번호는 아래쪽 여백에 얹는다.
      '.ex-rail-card{position:absolute;left:0;right:0;top:0;background:var(--ex-white,#fff);',
      '  border:1px solid var(--ex-line-200,#E6EAF0);border-radius:3px;overflow:hidden;',
      '  box-shadow:0 1px 3px rgba(22,34,58,.10)}',
      '.ex-rail-card.is-now{border-color:var(--ex-espresso,#7A3B2E);',
      '  box-shadow:0 0 0 2px rgba(122,59,46,.18),0 1px 3px rgba(22,34,58,.10)}',
      '.ex-rail-face{position:absolute;inset:0;overflow:hidden;contain:paint}',
      '.ex-rail-ghost{transform-origin:0 0;pointer-events:none;user-select:none;',
      '  margin:0;box-shadow:none;border:none;background:transparent}',
      '.ex-rail-num{position:absolute;right:3px;bottom:2px;z-index:1;',
      '  font-family:var(--ex-font-mono,monospace);font-size:8px;line-height:11px;',
      '  padding:0 3px;border-radius:2px;color:var(--ex-slate-400,#8B97A8);',
      '  background:rgba(255,255,255,.86)}',
      '.ex-rail-card.is-now .ex-rail-num{color:var(--ex-espresso,#7A3B2E)}',

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
