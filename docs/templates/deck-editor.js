/* ===========================================================================
   Deck Editor — HTML 발표 자료를 브라우저에서 고치는 도구
   출처는 ~/.claude/skills/html-presentation/tool/editor.js 입니다. 고칠 일이
   있으면 거기서 고치고 다시 복사해 옵니다.
   ---------------------------------------------------------------------------
   글을 그 자리에서 고치고, 장을 더하거나 지우거나 순서를 바꾸고, 고친 것을
   원본 파일에 그대로 씁니다. 빌드도 서버도 없습니다.

   붙이는 법 — 발표 자료의 </body> 앞에 한 줄:

       <script src="templates/deck-editor.js" defer></script>

   이 파일은 특정 자료에 매여 있지 않습니다. 장을 스스로 찾고, 색과 글꼴은
   그 문서가 :root 에 정의한 토큰에서 읽습니다. 이 양식이든 남의
   HTML 덱이든 같은 방식으로 붙습니다.

   그림(SVG) 안의 글자도 고칩니다. 브라우저가 SVG 글자에는 contenteditable 을
   듣지 않고 `user-modify: read-only` 로 묶어 두기 때문에, 눌렀을 때 그 자리에
   입력칸을 띄우고 다 적으면 글자만 갈아 끼우는 방식으로 엽니다.

   토큰은 **빠른 길**이지 울타리가 아닙니다. 색은 색상환에서 아무 값이나,
   크기는 px 를 직접, 글꼴은 이름을 직접 적을 수 있습니다. 고르는 사람이
   사람이라 도구가 막지 않습니다 — 다만 토큰을 먼저 보여 줘서, 굳이 벗어날
   이유가 없을 때는 자연히 안쪽 값을 고르게 합니다.

   설정은 없어도 되고, 필요하면 이 스크립트보다 **먼저** 둡니다:

       <script>
         window.deckEditorConfig = {
           slides: '.slide',          // 장 선택자. 없으면 스스로 찾습니다
           skip: '.pg, .count',       // 자동으로 채워지는 자리 — 열지 않습니다
           fileName: 'my-deck.html',  // 저장 이름. 없으면 주소에서 가져옵니다
           beforeSave(doc) {},        // 저장 전에 실행 중 흔적을 걷어냅니다
           onStructureChange() {},    // 장을 더하거나 지운 뒤 — 번호·목록 다시
         };
       </script>

   왜 beforeSave 가 필요한가 — 발표 컨트롤러는 실행 중에 지면을 건드립니다.
   무대를 줄이는 transform, 활성 장 표시, 자동으로 만든 목록 같은 것들입니다.
   그 흔적은 자료마다 다르므로 도구가 알 수 없고, 그래서 자료 쪽에서 걷어
   냅니다. 도구는 자기가 만든 것과 편집 흔적만 책임집니다.

   저장은 세 갈래로 물러섭니다. 위쪽이 될수록 손이 덜 갑니다.

     1. 서버에 PUT — 작업대나 scripts/serve-docs.py 로 띄웠으면 자기 주소로
        PUT 을 보냅니다. **창이 뜨지 않고 열어 둔 그 파일이 바로 바뀝니다.**
     2. 파일 손잡이 — 서버가 PUT 을 안 받으면 파일을 한 번 고릅니다. 고른
        손잡이는 IndexedDB 에 남겨 두므로 **다음 번에는 다시 묻지 않습니다**
        (크롬 · 엣지).
     3. 내려받기 — 위 둘이 다 안 되면 파일로 받습니다. 원본을 덮으십시오.

   브라우저는 아무 경로에나 쓰지 못합니다. 그래서 2번에 파일 선택이 한 번
   끼는 것이고, 1번은 그 제약이 없는 로컬 서버에 일을 넘기는 것입니다.
   어느 쪽이든 저장소의 파일이 계속 유일한 출처로 남습니다.
   =========================================================================== */

(() => {
  'use strict';

  /* 축소판은 이 자료를 `?preview` 로 그대로 띄웁니다. 넘겨 보는 자리도 고치는
     자리도 아니므로 도구가 아예 서지 않습니다 — 서면 툴바가 지면을 가리고,
     도구가 다는 자리 표시가 축소판에 그대로 찍힙니다. 컨트롤러도 같은 표시를
     보고 조작 장치를 걷습니다. */
  if (new URLSearchParams(location.search).has('preview')) return;

  const CFG = Object.assign(
    {
      slides: null,
      skip: '.pg, .count, [data-auto]',
      fileName: null,
      beforeSave: null,
      onStructureChange: null,
    },
    window.deckEditorConfig || {},
  );

  const MARK = 'data-deck-editor'; // 도구가 만든 것에는 전부 이 표를 답니다.

  /* ── 장 찾기 ──────────────────────────────────────────────────────────────
     선택자를 주면 그것을 쓰고, 없으면 후보를 훑어 「형제로 둘 이상 나란한
     묶음」을 고릅니다. 장은 언제나 한 부모 밑에 나란히 있기 때문입니다. */
  function findSlides() {
    const tries = CFG.slides
      ? [CFG.slides]
      : ['.slide', 'section.slide', '[data-slide]', '.deck-stage > section', '.slides > section', 'section'];
    for (const sel of tries) {
      const els = [...document.querySelectorAll(sel)];
      if (els.length < 2) continue;
      const parent = els[0].parentElement;
      if (els.every((el) => el.parentElement === parent)) return { list: els, parent, sel };
    }
    return null;
  }

  let found = findSlides();
  if (!found) return; // 장을 못 찾으면 조용히 물러섭니다 — 자료를 망가뜨리지 않습니다.
  let { parent: STAGE } = found;
  const slides = () => [...STAGE.children].filter((el) => el.matches(found.sel));

  /* ── 토큰 읽기 ────────────────────────────────────────────────────────────
     색과 글꼴을 도구가 지어내지 않습니다. 그 문서가 :root 에 적어 둔 것만
     씁니다. 표에 없는 값이 새로 생기지 않게 하는 유일한 장치입니다. */
  function readTokens() {
    const colors = [];
    const fonts = [];
    const seen = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // 다른 출처의 스타일시트는 읽을 수 없습니다.
      }
      for (const rule of rules) {
        if (!rule.selectorText || !/:root|^html$/.test(rule.selectorText)) continue;
        for (const name of rule.style) {
          if (!name.startsWith('--') || seen.has(name)) continue;
          seen.add(name);
          const value = rule.style.getPropertyValue(name).trim();
          if (/^(#[0-9a-f]{3,8}|rgb|hsl|oklch|color\()/i.test(value)) colors.push({ name, value });
          else if (/font/i.test(name) && /[a-z]/i.test(value) && !/^\d/.test(value)) fonts.push({ name, value });
        }
      }
    }
    return { colors, fonts };
  }

  /* 크기도 마찬가지입니다 — 지면에서 실제로 쓰이는 크기만 계단으로 씁니다.
     여기 없는 크기를 새로 만들면 그 자료의 활자 체계가 무너집니다. */
  function readSizes() {
    const set = new Set();
    slides()
      .slice(0, 6)
      .forEach((s) =>
        s.querySelectorAll('*').forEach((el) => {
          if (el.closest('svg')) return;
          const px = Math.round(parseFloat(getComputedStyle(el).fontSize));
          if (px >= 9 && px <= 200) set.add(px);
        }),
      );
    return [...set].sort((a, b) => a - b);
  }

  const TOKENS = readTokens();
  let SIZES = readSizes();

  /* ── 지면 ────────────────────────────────────────────────────────────────*/
  const css = `
    [${MARK}] { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont,
      'Pretendard Variable', Pretendard, 'Segoe UI', sans-serif; }

    .de-selection-layer { position: fixed; inset: 0; z-index: 12000; pointer-events: none; }
    .de-object-box, .de-selection-box, .de-marquee { position: absolute; box-sizing: border-box; }
    .de-object-box { border: 1px solid #526b8a66; }
    .de-selection-box { border: 1.5px solid #526b8a; }
    .de-resize-handle { position:absolute; width:10px; height:10px; padding:0; border:1.5px solid #526b8a; background:white; border-radius:2px; pointer-events:auto; touch-action:none; transform:translate(-50%,-50%); }
    .de-resize-handle:focus-visible { outline:2px solid #526b8a; outline-offset:3px; }
    .de-marquee { border: 1px solid #526b8a; background: #526b8a18; }
    .de-selection-tools { display: inline-flex; align-items: center; gap: 5px; }
    .de-selection-tools[hidden] { display: none; }
    .de-selection-count { font: 11px/1 system-ui,sans-serif; color: #526b8a; white-space: nowrap; }
    body.de-editing .slide { user-select: none; }
    body.de-editing [contenteditable="true"] { user-select: text; }
    body.de-editing .slide :is(image,g,img) { cursor: move; }

    .de-rail, .de-pop { overscroll-behavior: contain; }
    .de-bar {
      position: fixed; left: 50%; top: 16px; transform: translateX(-50%); z-index: 2147483000;
      display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 14px;
      background: rgba(255,255,255,.95); backdrop-filter: blur(12px) saturate(180%);
      border: 1px solid rgba(0,0,0,.10); border-radius: 999px;
      box-shadow: 0 18px 44px rgba(0,0,0,.11); white-space: nowrap; font-size: 12.5px; color: #35455f;
    }
    /* 되돌리기는 본 툴바와 하는 일이 다릅니다 — 지면을 고치는 손이 아니라
       고친 것을 물리는 손이라 따로 세웁니다. */
    .de-undo {
      position: fixed; top: 16px; z-index: 2147483000;
      display: flex; align-items: center; gap: 4px; padding: 6px;
      background: rgba(255,255,255,.95); backdrop-filter: blur(12px) saturate(180%);
      border: 1px solid rgba(0,0,0,.10); border-radius: 999px;
      box-shadow: 0 18px 44px rgba(0,0,0,.11);
    }
    .de-undo .de-btn { min-width: 30px; padding: 0 8px; }
    .de-undo svg { width: 15px; height: 15px; display: block; }
    .de-bar[hidden], .de-rail[hidden], .de-pop[hidden], .de-undo[hidden] { display: none; }
    .de-bar .de-tag { font: 500 10.5px/1 ui-monospace, 'JetBrains Mono', monospace;
      letter-spacing: .14em; color: #9a4030; }
    .de-sep { width: 1px; height: 20px; background: rgba(0,0,0,.10); }
    .de-btn {
      font: inherit; height: 28px; min-width: 28px; padding: 0 11px; border-radius: 999px;
      border: 1px solid rgba(0,0,0,.12); background: #fff; color: #35455f; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    .de-btn:hover { border-color: #16223a; color: #16223a; }
    .de-btn.de-go { background: #16223a; border-color: #16223a; color: #fff; }
    .de-btn.de-go:hover { background: #0b1220; }
    /* 두 문구를 같은 고정 폭 안에서 교차시켜 저장 중에도 툴바가 움직이지 않습니다. */
    .de-btn.de-save { position: relative; width: 82px; min-width: 82px; padding: 0;
      overflow: hidden; transition: background-color 180ms ease-out, border-color 180ms ease-out; }
    .de-save > span { position: absolute; inset: 0; display: flex; align-items: center;
      justify-content: center; transition: opacity 180ms ease-out, transform 180ms ease-out; }
    .de-save-done { opacity: 0; transform: translateY(6px); }
    .de-save.de-saved, .de-save.de-saved:hover { background: #35455f; border-color: #35455f; }
    .de-saved .de-save-idle { opacity: 0; transform: translateY(-6px); }
    .de-saved .de-save-done { opacity: 1; transform: translateY(0); }
    @media (prefers-reduced-motion: reduce) {
      .de-btn.de-save, .de-save > span { transition: none; }
      .de-save > span { transform: none; }
    }
    .de-btn.de-on { border-color: #9a4030; color: #9a4030; }
    .de-btn[disabled] { opacity: .4; cursor: default; }
    .de-num { font: 500 12px/1 ui-monospace, monospace; min-width: 34px; text-align: center; color: #5a6b87; }
    input.de-size {
      width: 46px; height: 26px; border: 1px solid transparent; border-radius: 7px;
      background: none; padding: 0;
    }
    input.de-size:hover { border-color: rgba(0,0,0,.14); }
    input.de-size:focus { outline: none; border-color: #16223a; background: #fff; }
    .de-note { color: #93a2ba; font-size: 11.5px; }
    /* 저장 결과는 툴바 너비에 영향을 주지 않도록 아래에 띄웁니다. */
    .de-bar > .de-note { position: absolute; top: calc(100% + 8px); left: 50%;
      transform: translateX(-50%); padding: 6px 12px; border-radius: 999px;
      background: #fff; color: #35455f; white-space: nowrap; pointer-events: none; }
    .de-bar > .de-note:empty { display: none; }

    .de-pop {
      position: fixed; z-index: 2147483001; background: #fff; border: 1px solid rgba(0,0,0,.10);
      border-radius: 14px; box-shadow: 0 18px 44px rgba(0,0,0,.16); padding: 12px; max-width: 320px;
    }
    .de-pop .de-lab { font: 500 10px/1 ui-monospace, monospace; letter-spacing: .14em;
      color: #93a2ba; margin: 2px 0 9px; }
    .de-swatches { display: grid; grid-template-columns: repeat(8, 26px); gap: 6px; }
    .de-swatch { width: 26px; height: 26px; border-radius: 7px; border: 1px solid rgba(0,0,0,.14);
      cursor: pointer; padding: 0; }
    .de-swatch:hover { outline: 2px solid #16223a; outline-offset: 1px; }
    .de-list { display: grid; gap: 4px; }
    .de-list button { font: inherit; text-align: left; padding: 7px 10px; border-radius: 8px;
      border: 1px solid transparent; background: none; cursor: pointer; color: #35455f; font-size: 13px; }
    .de-list button:hover { background: #eff4fb; }
    .de-free { display: flex; align-items: center; gap: 6px; margin-top: 10px;
      padding-top: 10px; border-top: 1px solid rgba(0,0,0,.08); }
    .de-free input {
      font: inherit; font-size: 12.5px; height: 28px; padding: 0 9px; min-width: 0; flex: 1;
      border: 1px solid rgba(0,0,0,.14); border-radius: 8px; color: #16223a; background: #fff;
    }
    .de-free input[type="color"] { flex: none; width: 34px; padding: 2px; cursor: pointer; }
    .de-free input:focus { outline: none; border-color: #16223a; }

    .de-rail {
      position: fixed; left: 0; top: 0; bottom: 0; width: 236px; z-index: 2147482999;
      background: rgba(255,255,255,.96); backdrop-filter: blur(12px) saturate(180%);
      border-right: 1px solid rgba(0,0,0,.10); overflow-y: auto; padding: 62px 14px 20px;
    }
    .de-card { position: relative; margin-bottom: 12px; cursor: grab; }
    .de-card.de-drag { opacity: .35; }
    .de-card.de-over { outline: 2px solid #9a4030; outline-offset: 3px; border-radius: 8px; }
    .de-thumb {
      width: 204px; height: 114.75px; overflow: hidden; position: relative; border-radius: 7px;
      border: 1px solid rgba(0,0,0,.12); background: #fff;
    }
    .de-card.de-cur .de-thumb { border-color: #9a4030; box-shadow: 0 0 0 2px rgba(154,64,48,.22); }
    .de-thumb > * {
      position: absolute !important; left: 0; top: 0; width: 1920px; height: 1080px;
      transform: scale(.10625); transform-origin: 0 0;
      visibility: visible !important; opacity: 1 !important; display: block !important;
    }
    .de-cap { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 11px; color: #7c8ca6; }
    .de-cap .de-n { font: 500 10px/1 ui-monospace, monospace; color: #93a2ba; }
    .de-cap .de-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .de-ops { position: absolute; right: 5px; top: 5px; display: none; gap: 4px; }
    .de-card:hover .de-ops { display: flex; }
    .de-ops button {
      width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(0,0,0,.12);
      background: rgba(255,255,255,.96); cursor: pointer; font-size: 12px; line-height: 1;
      color: #35455f; padding: 0;
    }
    .de-ops button:hover { border-color: #16223a; }
    .de-ops button.de-del:hover { border-color: #9a4030; color: #9a4030; }

    /* 그림 안의 글자 — 눌러서 고칩니다. 획을 글자 뒤에 깔아 후광만 두릅니다. */
    body.de-editing svg text, body.de-editing svg tspan { cursor: text; }
    body.de-editing svg text:hover, body.de-editing svg tspan:hover {
      paint-order: stroke; stroke: #9a4030; stroke-width: 6px; stroke-opacity: .16;
    }
    .de-svg-input {
      position: fixed; z-index: 2147483002; font-size: 13px; line-height: 1;
      padding: 0 9px; border: 1.5px solid #9a4030; border-radius: 7px;
      background: #fff; color: #16223a; box-shadow: 0 10px 28px rgba(0,0,0,.16);
    }
    .de-svg-input:focus { outline: none; }

    body.de-editing [contenteditable="true"] {
      outline: 1px dashed rgba(154,64,48,.34); outline-offset: 3px; border-radius: 2px;
    }
    body.de-editing [contenteditable="true"]:hover { background: rgba(154,64,48,.05); }
    body.de-editing [contenteditable="true"]:focus {
      outline: 1.5px solid #9a4030; background: rgba(154,64,48,.07);
    }
    body.de-editing .dark [contenteditable="true"],
    body.de-editing .slide.dark [contenteditable="true"] { outline-color: rgba(224,180,134,.42); }
    body.de-editing .slide.dark [contenteditable="true"]:focus { outline-color: #e0b486; }

    @media print { [${MARK}] { display: none !important; } }
  `;
  const style = document.createElement('style');
  style.setAttribute(MARK, '');
  style.textContent = css;
  document.head.appendChild(style);

  const el = (tag, attrs = {}, kids = []) => {
    const node = document.createElement(tag);
    node.setAttribute(MARK, '');
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    kids.forEach((k) => node.appendChild(k));
    return node;
  };

  /* ── 고치기 ──────────────────────────────────────────────────────────────
     글자를 직접 든 요소만 엽니다. 감싸는 상자까지 열면 지우다가 구조가
     통째로 날아갑니다. 자동으로 채워지는 자리(쪽 번호 등)는 건너뜁니다. */
  function fields() {
    return [...STAGE.querySelectorAll('*')].filter((node) => {
      if (node.closest('svg') || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return false;
      if (CFG.skip && node.matches(CFG.skip)) return false;
      return [...node.childNodes].some((nd) => nd.nodeType === 3 && nd.textContent.trim());
    });
  }

  let editing = false;
  let svgInput = null;

  const closeSvgInput = () => {
    if (svgInput) { svgInput.remove(); svgInput = null; }
  };

  /* SVG 안의 글자는 contenteditable 이 듣지 않습니다. 그래서 그 자리에 입력칸을
     띄우고, 다 적으면 글자만 갈아 끼웁니다. 자식 요소를 든 <text> 는 열지
     않습니다 — 통째로 덮으면 안쪽 <tspan> 이 사라집니다. */
  function editSvgText(node) {
    closeSvgInput();
    const box = node.getBoundingClientRect();
    const input = el('input', { class: 'de-svg-input', type: 'text', spellcheck: 'false' });
    input.value = node.textContent;
    input.style.left = Math.max(8, Math.min(window.innerWidth - 200, box.left - 8)) + 'px';
    input.style.top = Math.max(8, box.top - 5) + 'px';
    input.style.minWidth = Math.max(140, box.width + 30) + 'px';
    input.style.height = Math.max(28, box.height + 10) + 'px';
    document.body.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const commit = (keep) => {
      if (done) return;
      done = true;
      if (!keep && node.textContent !== input.value) {
        mark();
        node.textContent = input.value;
        queueSave();
      }
      closeSvgInput();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(false); }
      else if (e.key === 'Escape') { e.preventDefault(); commit(true); }
    });
    input.addEventListener('blur', () => commit(false));
    svgInput = input;
  }

  function openFields() {
    fields().forEach((node) => {
      if (node.parentElement && node.parentElement.closest('[contenteditable="true"]')) return;
      node.setAttribute('contenteditable', 'true');
      node.setAttribute('spellcheck', 'false');
    });
  }
  const closeFields = () =>
    STAGE.querySelectorAll('[contenteditable]').forEach((node) => {
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
    });

  /* 한 칸을 고치는 동안은 브라우저의 되돌리기에 맡기고, 칸을 떠날 때 그
     고침 전체를 한 칸으로 쌓습니다. 들어갈 때 찍어 두었다가 정말 바뀌었을
     때만 올립니다 — 눌러 보기만 한 것은 이력에 남기지 않습니다. */
  let enter = null;
  STAGE.addEventListener('focusin', (e) => {
    const host = e.target.closest?.('[contenteditable="true"]');
    if (host) enter = { host, was: host.innerHTML, all: snapshot() };
  });
  STAGE.addEventListener('focusout', (e) => {
    if (!enter || !e.target.closest?.('[contenteditable="true"]')) return;
    const { host, was, all } = enter;
    enter = null;
    if (host.innerHTML === was) return;
    past.push(all);
    if (past.length > DEPTH) past.shift();
    future.length = 0;
    queueSave();
  });
  /* 오래 치는 동안에도 파일이 따라옵니다 — 칸을 떠나야 저장되면 그 사이에
     창을 닫은 사람이 다 잃습니다. */
  STAGE.addEventListener('input', () => { if (editing) queueSave(); });

  /* 툴바를 누르면 지면의 선택이 풀립니다. 그래서 마지막 선택을 들고 있다가
     되돌려 놓고 적용합니다. */
  let lastRange = null;
  let lastHost = null;
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const start = range.startContainer;
    const host = (start.nodeType === 1 ? start : start.parentElement)?.closest('[contenteditable="true"]');
    if (host) {
      lastRange = range.cloneRange();
      lastHost = host;
    }
  });

  /* 고른 글자에만 겁니다. 고른 것이 없으면 커서가 놓인 덩어리 전체에 겁니다. */
  function apply(prop, value) {
    mark();
    if (!lastHost) return;
    if (!lastRange || lastRange.collapsed) {
      if (value === null) lastHost.style.removeProperty(prop);
      else lastHost.style.setProperty(prop, value);
      return;
    }
    const span = document.createElement('span');
    if (value !== null) span.style.setProperty(prop, value);
    try {
      lastRange.surroundContents(span);
    } catch {
      span.appendChild(lastRange.extractContents());
      lastRange.insertNode(span);
    }
    if (value === null) span.replaceWith(...span.childNodes); // 「기본으로」는 껍데기를 벗깁니다.
    const sel = document.getSelection();
    sel.removeAllRanges();
    const back = document.createRange();
    back.selectNodeContents(span.isConnected ? span : lastHost);
    sel.addRange(back);
    lastRange = back.cloneRange();
  }

  function currentSize() {
    const node = lastHost;
    if (!node) return null;
    return Math.round(parseFloat(getComputedStyle(node).fontSize));
  }
  function stepSize(dir) {
    const now = currentSize();
    if (now === null) return;
    if (!SIZES.length) SIZES = readSizes();
    let i = SIZES.findIndex((s) => s >= now);
    if (i < 0) i = SIZES.length - 1;
    if (SIZES[i] === now) i += dir;
    else if (dir < 0) i -= 1;
    i = Math.max(0, Math.min(SIZES.length - 1, i));
    apply('font-size', SIZES[i] + 'px');
    sizeLabel.value = SIZES[i];
  }

  /* ── 되돌리기 ────────────────────────────────────────────────────────────
     장이 통째로 바뀌는 일(복제 · 삭제 · 순서)까지 되돌려야 하므로 지면 전체를
     찍어 둡니다. 고칠 때마다가 아니라 **한 번의 고침이 끝날 때** 찍습니다 —
     글자를 한 자 칠 때마다 쌓으면 한 문장을 지우는 데 스무 번을 눌러야 합니다.

     글자 칸 안에서는 브라우저의 되돌리기가 먼저입니다. 칸 밖에서 누를 때만
     이 더미를 씁니다. */
  const past = [];
  const future = [];
  const DEPTH = 60;

  const snapshot = () => STAGE.innerHTML;

  /* 바꾸기 **직전**에 부릅니다. */
  function mark() {
    past.push(snapshot());
    if (past.length > DEPTH) past.shift();
    future.length = 0;
  }

  function restore(html, options = {}) {
    finishMove(true);
    const saved = document.createElement('div');
    saved.innerHTML = html;
    const beforeSlides = slides();
    const selectedBefore = [...selected];
    // 같은 개체는 그대로 두고 바뀐 속성·텍스트만 복원합니다. 이벤트, 포커스,
    // 이미지 로딩과 진행 중인 애니메이션을 다시 시작하지 않습니다.
    function sync(live, wanted) {
      if (live.nodeType === Node.TEXT_NODE || live.nodeType === Node.COMMENT_NODE) {
        if (live.nodeValue !== wanted.nodeValue) live.nodeValue = wanted.nodeValue;
        return;
      }
      if (live.nodeType !== Node.ELEMENT_NODE) return;
      if (CFG.skip && live.matches(CFG.skip)) return;
      const isSlide = live.matches(found.sel);
      const active = isSlide && live.classList.contains('active');
      const attrs = new Map([...wanted.attributes].map(a => [a.name, a.value]));
      if (isSlide) {
        const classes = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean));
        classes.delete('active'); if (active) classes.add('active');
        attrs.set('class', [...classes].join(' '));
      }
      for (const attr of [...live.attributes]) {
        if (!attrs.has(attr.name)) live.removeAttribute(attr.name);
      }
      for (const [name, value] of attrs) {
        if (live.getAttribute(name) !== value) live.setAttribute(name, value);
      }
      syncChildren(live, wanted);
    }
    function syncChildren(live, wanted) {
      const targets = [...wanted.childNodes];
      targets.forEach((target, i) => {
        const node = live.childNodes[i];
        if (!node) live.appendChild(target.cloneNode(true));
        else if (node.nodeType !== target.nodeType || node.nodeName !== target.nodeName) live.replaceChild(target.cloneNode(true), node);
        else sync(node, target);
      });
      while (live.childNodes.length > targets.length) live.lastChild.remove();
    }
    syncChildren(STAGE, saved);
    const afterSlides = slides();
    const structural = beforeSlides.length !== afterSlides.length || beforeSlides.some((s,i) => s !== afterSlides[i]);
    if (structural) {
      // 장 추가·삭제에만 컨트롤러의 목록과 번호를 다시 구성합니다.
      hideMove(); closeFields(); changed();
    } else {
      selected = normalize(selectedBefore);
      locateMove();
      if (railOn) buildRail();
    }
    refreshHistory();
    if (options.external) persistHistory();
    else queueSave();
  }

  function undo() {
    finishMove(true);
    if (!past.length) return flash('되돌릴 것이 없습니다');
    future.push(snapshot());
    restore(past.pop());
    flash('되돌렸습니다');
  }

  function redo() {
    finishMove(true);
    if (!future.length) return flash('다시 할 것이 없습니다');
    past.push(snapshot());
    restore(future.pop());
    flash('다시 했습니다');
  }

  /* ── 자동 저장 ───────────────────────────────────────────────────────────
     서버가 PUT 을 받을 때만 돕니다. 파일 선택이나 내려받기로 물러선 자료에서
     자동으로 저장하면 창이 계속 뜹니다. 첫 저장으로 어느 쪽인지 알게 됩니다. */
  let saveTimer = null;
  let saving = false;
  let again = false;

  function queueSave(now) {
    liveLocalRevision++;
    persistHistory();
    if (putWorks === false || location.protocol === 'file:') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(run, now ? 0 : 900);
  }

  async function run() {
    saveTimer = null;
    if (saving) { again = true; return; }
    saving = true;
    const html = serialize();
    const ok = await putToServer(html);
    saving = false;
    if (ok) showSaved();
    else if (putWorks === false) flash('자동 저장 꺼짐 — ⌘S 로 저장하십시오');
    if (again) { again = false; queueSave(true); }
  }

  /* 창을 닫기 전에 남은 것을 밀어 넣습니다. */
  addEventListener('beforeunload', () => {
    if (!saveTimer || putWorks === false) return;
    clearTimeout(saveTimer);
    navigator.sendBeacon?.(location.pathname, new Blob([serialize()], { type: 'text/html' }));
  });

  /* ── 장 다루기 ───────────────────────────────────────────────────────────*/
  const current = () => {
    const list = slides();
    const i = list.findIndex((s) => s.classList.contains('active'));
    return i < 0 ? 0 : i;
  };

  function changed() {
    if (typeof CFG.onStructureChange === 'function') CFG.onStructureChange(slides());
    else if (window.deck) {
      // 컨트롤러가 있으면 번호와 목록을 다시 만들게 합니다.
      window.deck.slides = slides();
      window.deck.stampNumbers?.();
      if (window.deck.mapList) {
        window.deck.mapList.innerHTML = '';
        window.deck.buildMap?.();
      }
      window.deck.show?.(window.deck.i ?? 0);
    }
    buildRail();
    closeFields();
  }

  function duplicate(i, blank) {
    mark();
    const list = slides();
    const copy = list[i].cloneNode(true);
    copy.classList.remove('active');
    copy.querySelectorAll('[contenteditable]').forEach((n) => {
      n.removeAttribute('contenteditable');
      n.removeAttribute('spellcheck');
    });
    if (blank) {
      // 새 장은 「복제한 뒤 글자를 비운 것」입니다. 그래야 그 자료의 뼈대를
      // 그대로 물려받습니다 — 도구가 남의 지면 구조를 지어내지 않습니다.
      copy.setAttribute('data-title', 'New slide');
      [...copy.querySelectorAll('*')].forEach((node) => {
        if (node.closest('svg') || (CFG.skip && node.matches(CFG.skip))) return;
        [...node.childNodes].forEach((nd) => {
          if (nd.nodeType === 3 && nd.textContent.trim()) nd.textContent = '';
        });
      });
    }
    list[i].after(copy);
    changed();
    queueSave();
  }

  function remove(i) {
    const list = slides();
    if (list.length <= 1) return;
    mark();
    list[i].remove();
    changed();
    queueSave();
  }

  function move(from, to) {
    const list = slides();
    if (from === to || to < 0 || to >= list.length) return;
    mark();
    const node = list[from];
    if (from < to) list[to].after(node);
    else list[to].before(node);
    changed();
    queueSave();
  }

  /* ── 썸네일 ──────────────────────────────────────────────────────────────
     장을 복제해 축소해 둡니다. SVG 안의 id 는 문서에서 하나뿐이어야 하므로
     복제본의 id 와 url(#…) 참조를 함께 갈아 끼웁니다. 그러지 않으면 원본의
     클립과 마스크가 썸네일 쪽을 가리켜 지면이 깨집니다. */
  function thumbOf(section, n) {
    const copy = section.cloneNode(true);
    const map = new Map();
    copy.querySelectorAll('[id]').forEach((node) => {
      const from = node.id;
      const to = `de${n}-${from}`;
      map.set(from, to);
      node.id = to;
    });
    if (map.size) {
      copy.querySelectorAll('*').forEach((node) => {
        [...node.attributes].forEach((attr) => {
          if (attr.value.includes('url(#')) {
            node.setAttribute(
              attr.name,
              attr.value.replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${map.get(id) || id})`),
            );
          } else if (attr.name === 'href' || attr.name === 'xlink:href') {
            const id = attr.value.replace('#', '');
            if (map.has(id)) node.setAttribute(attr.name, '#' + map.get(id));
          }
        });
      });
    }
    copy.classList.remove('active');
    copy.removeAttribute('id');
    copy.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
    return copy;
  }

  let dragFrom = null;

  function buildRail() {
    rail.innerHTML = '';
    const list = slides();
    const cur = current();
    list.forEach((section, n) => {
      const card = el('div', { class: 'de-card' + (n === cur ? ' de-cur' : ''), draggable: 'true' });
      const box = el('div', { class: 'de-thumb' });
      box.appendChild(thumbOf(section, n));
      const ops = el('div', { class: 'de-ops' }, [
        el('button', { title: 'New slide after', text: '＋', onclick: (e) => (e.stopPropagation(), duplicate(n, true)) }),
        el('button', { title: 'Duplicate', text: '⧉', onclick: (e) => (e.stopPropagation(), duplicate(n, false)) }),
        el('button', { class: 'de-del', title: 'Delete', text: '×', onclick: (e) => (e.stopPropagation(), remove(n)) }),
      ]);
      const cap = el('div', { class: 'de-cap' }, [
        el('span', { class: 'de-n', text: String(n + 1).padStart(2, '0') }),
        el('span', { class: 'de-t', text: section.dataset.title || section.dataset.kind || '' }),
      ]);
      card.append(box, ops, cap);
      card.addEventListener('click', () => (window.deck?.show ? window.deck.show(n) : section.scrollIntoView()));
      card.addEventListener('dragstart', () => {
        dragFrom = n;
        card.classList.add('de-drag');
      });
      card.addEventListener('dragend', () => {
        dragFrom = null;
        card.classList.remove('de-drag');
        rail.querySelectorAll('.de-over').forEach((c) => c.classList.remove('de-over'));
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('de-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('de-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('de-over');
        if (dragFrom !== null) move(dragFrom, n);
      });
      rail.appendChild(card);
    });
  }

  /* ── 저장 ────────────────────────────────────────────────────────────────*/
  let handle = null;
  let putWorks = null; // null = 아직 모름, true/false = 확인됨

  /* 고른 파일 손잡이는 남겨 둡니다 — 자료마다 하나씩, 주소를 열쇠로.
     이게 없으면 창을 열 때마다 파일을 다시 고르게 됩니다. */
  const store = {
    open: () =>
      new Promise((res, rej) => {
        const req = indexedDB.open('deck-editor', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      }),
    async get(key) {
      try {
        const db = await store.open();
        return await new Promise((res) => {
          const req = db.transaction('handles').objectStore('handles').get(key);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        const db = await store.open();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(value, key);
      } catch {
        /* 남기지 못해도 저장 자체는 됩니다. */
      }
    },
  };

  async function usable(h) {
    if (!h || !h.queryPermission) return false;
    const opts = { mode: 'readwrite' };
    if ((await h.queryPermission(opts)) === 'granted') return true;
    return (await h.requestPermission(opts)) === 'granted'; // 누른 직후라 물어볼 수 있습니다.
  }

  function serialize() {
    const doc = document.documentElement.cloneNode(true);
    doc.querySelectorAll(`[${MARK}]`).forEach((node) => node.remove()); // 도구가 만든 것
    doc.querySelectorAll('[contenteditable]').forEach((node) => {
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
    });
    doc.querySelectorAll('[draggable]').forEach((node) => node.removeAttribute('draggable'));
    const body = doc.querySelector('body');
    if (body) body.classList.remove('de-editing');
    /* 클래스를 다 걷어낸 자리에 class="" 만 남기지 않습니다. */
    doc.querySelectorAll('[class=""]').forEach((node) => node.removeAttribute('class'));
    /* </html> 뒤에 붙인 줄바꿈은 다시 읽을 때 body 끝으로 밀려 들어옵니다.
       걷어내지 않으면 저장할 때마다 빈 줄이 한 줄씩 쌓입니다. */
    while (body && body.lastChild && body.lastChild.nodeType === 3 && !body.lastChild.textContent.trim()) {
      body.lastChild.remove();
    }
    if (typeof CFG.beforeSave === 'function') CFG.beforeSave(doc);
    return '<!DOCTYPE html>\n' + doc.outerHTML + '\n';
  }

  const fileName = () =>
    CFG.fileName || decodeURIComponent(location.pathname.split('/').pop() || '') || 'deck.html';

  /* 1. 서버가 PUT 을 받으면 여기서 끝납니다 — 창이 뜨지 않습니다. */
  async function putToServer(html) {
    if (putWorks === false || location.protocol === 'file:') return false;
    try {
      const res = await fetch(location.pathname, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: html,
      });
      putWorks = res.ok;
      if (!res.ok && putWorks !== null) {
        console.info('[deck-editor] 서버가 PUT 을 받지 않습니다 — 파일 선택으로 갑니다.', res.status);
      }
      return res.ok;
    } catch {
      putWorks = false;
      return false;
    }
  }

  async function save() {
    const html = serialize();

    if (await putToServer(html)) {
      showSaved();
      return;
    }

    try {
      if (!handle) handle = await store.get(location.pathname);
      if (handle && !(await usable(handle))) handle = null;
      if (!handle && window.showSaveFilePicker) {
        handle = await window.showSaveFilePicker({
          suggestedName: fileName(),
          types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }],
        });
        await store.set(location.pathname, handle); // 다음부터는 묻지 않습니다.
      }
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(html);
        await writable.close();
        showSaved();
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // 사용자가 취소한 것입니다.
      console.warn('[deck-editor] 파일에 직접 쓰지 못해 내려받기로 갑니다.', err);
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Downloaded — replace the original');
  }

  let savedTimer = null;
  function showSaved() {
    clearTimeout(savedTimer);
    saveBtn.classList.add('de-saved');
    saveBtn.setAttribute('aria-label', '저장됨');
    savedTimer = setTimeout(() => {
      saveBtn.classList.remove('de-saved');
      saveBtn.setAttribute('aria-label', '저장 ⌘S');
    }, 1600);
  }

  let flashTimer = null;
  function flash(text) {
    note.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      note.textContent = '';
    }, 2600);
  }

  /* ── 툴바 ────────────────────────────────────────────────────────────────*/
  const pop = el('div', { class: 'de-pop', hidden: '' });
  document.body.appendChild(pop);

  function openPop(anchor, label, body) {
    pop.innerHTML = '';
    pop.appendChild(el('div', { class: 'de-lab', text: label }));
    pop.appendChild(body);
    pop.hidden = false;
    const rect = anchor.getBoundingClientRect();
    pop.style.left = Math.max(12, Math.min(window.innerWidth - pop.offsetWidth - 12, rect.left - 40)) + 'px';
    pop.style.top = rect.bottom + 8 + 'px';
  }
  const closePop = () => {
    pop.hidden = true;
  };
  document.addEventListener('mousedown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.de-bar')) closePop();
  });

  function colorPop(anchor) {
    const wrap = el('div');
    const grid = el('div', { class: 'de-swatches' });
    TOKENS.colors.forEach((tok) => {
      grid.appendChild(
        el('button', {
          class: 'de-swatch',
          title: `${tok.name} · ${tok.value}`,
          style: `background:${tok.value}`,
          onclick: () => {
            apply('color', `var(${tok.name})`);
            closePop();
          },
        }),
      );
    });
    wrap.appendChild(grid);
    if (!TOKENS.colors.length) {
      wrap.appendChild(el('div', { class: 'de-note', text: 'No :root color tokens in this document.' }));
    }

    /* 토큰 밖의 색도 씁니다 — 고르는 사람이 사람이라 도구가 막지 않습니다. */
    const picker = el('input', { type: 'color', value: '#16223a', title: 'Pick any color' });
    const hex = el('input', { type: 'text', placeholder: '#16223a · rgb(…) · name', spellcheck: 'false' });
    const put = (value) => {
      if (!value) return;
      apply('color', value);
      closePop();
    };
    picker.addEventListener('input', () => (hex.value = picker.value));
    picker.addEventListener('change', () => put(picker.value));
    hex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        put(hex.value.trim());
      }
    });
    wrap.appendChild(el('div', { class: 'de-free' }, [picker, hex]));
    wrap.appendChild(
      el('div', { class: 'de-list', style: 'margin-top:8px' }, [
        el('button', { text: 'Reset to default', onclick: () => (apply('color', null), closePop()) }),
      ]),
    );
    openPop(anchor, `COLOR · ${TOKENS.colors.length} TOKENS + CUSTOM`, wrap);
  }

  function fontPop(anchor) {
    const list = el('div', { class: 'de-list' });
    TOKENS.fonts.forEach((tok) => {
      const b = el('button', {
        text: tok.name.replace(/^--/, ''),
        onclick: () => {
          apply('font-family', `var(${tok.name})`);
          closePop();
        },
      });
      b.style.fontFamily = tok.value;
      list.appendChild(b);
    });
    if (!TOKENS.fonts.length) {
      list.appendChild(el('div', { class: 'de-note', text: 'No :root font tokens in this document.' }));
    }
    const wrap = el('div', {}, [list]);

    const name = el('input', { type: 'text', placeholder: "Georgia, 'Noto Serif KR', serif", spellcheck: 'false' });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && name.value.trim()) {
        e.preventDefault();
        apply('font-family', name.value.trim());
        closePop();
      }
    });
    wrap.appendChild(el('div', { class: 'de-free' }, [name]));
    wrap.appendChild(
      el('div', { class: 'de-list', style: 'margin-top:8px' }, [
        el('button', { text: 'Reset to default', onclick: () => (apply('font-family', null), closePop()) }),
      ]),
    );
    openPop(anchor, `FONT · ${TOKENS.fonts.length} TOKENS + CUSTOM`, wrap);
  }

  /* 계단(문서가 실제로 쓰는 크기)은 −/＋ 로, 그 밖의 값은 여기에 직접 적습니다. */
  const sizeLabel = el('input', {
    class: 'de-num de-size',
    type: 'text',
    value: '',
    placeholder: '—',
    title: 'Type a px value, then Enter',
    spellcheck: 'false',
  });
  sizeLabel.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const px = parseFloat(sizeLabel.value);
    if (Number.isFinite(px) && px > 0) apply('font-size', px + 'px');
    sizeLabel.blur();
  });
  /* 굽은 화살표 한 쌍. 되돌리기는 왼쪽, 다시 하기는 그 거울입니다. */
  const arrow = (flip) =>
    `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"${flip ? ' style="transform: scaleX(-1)"' : ''}>`
    + '<path d="M4 8h9.5a5.5 5.5 0 0 1 0 11H8" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M8 4 4 8l4 4" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const undoBtn = el('button', { class: 'de-btn', title: '되돌리기 ⌘Z', 'aria-label': '되돌리기' });
  const redoBtn = el('button', { class: 'de-btn', title: '다시 하기 ⇧⌘Z', 'aria-label': '다시 하기' });
  undoBtn.innerHTML = arrow(false);
  redoBtn.innerHTML = arrow(true);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  const note = el('span', { class: 'de-note', text: '' });
  const rail = el('aside', { class: 'de-rail', hidden: '' });
  document.body.appendChild(rail);
  // 목록 스크롤은 유지하고 발표 컨트롤러의 전역 휠 전환까지 전달하지 않습니다.
  window.addEventListener('wheel', (e) => {
    if (e.target instanceof Element && e.target.closest('.de-rail, .de-pop')) e.stopImmediatePropagation();
  }, { capture: true, passive: true });


  const railBtn = el('button', { class: 'de-btn', title: 'Slides (S)', text: '▤ Slides', onclick: () => toggleRail() });
  const editBtn = el('button', { class: 'de-btn', title: 'Edit (E)', text: '✎ Edit', onclick: () => toggleEdit() });

  const saveBtn = el('button', {
    class: 'de-btn de-go de-save', 'aria-label': '저장 ⌘S', onclick: () => save(),
  }, [
    el('span', { class: 'de-save-idle', 'aria-hidden': 'true', text: '저장 ⌘S' }),
    el('span', { class: 'de-save-done', 'aria-hidden': 'true', text: '✓ 저장됨' }),
  ]);

  const bar = el('div', { class: 'de-bar' }, [
    el('span', { class: 'de-tag', text: 'EDITOR' }),
    railBtn,
    editBtn,
    el('span', { class: 'de-sep' }),
    el('button', { class: 'de-btn', text: 'Font', onclick: (e) => fontPop(e.currentTarget) }),
    el('button', { class: 'de-btn', text: '−', title: 'Smaller', onclick: () => stepSize(-1) }),
    sizeLabel,
    el('button', { class: 'de-btn', text: '＋', title: 'Larger', onclick: () => stepSize(1) }),
    el('button', { class: 'de-btn', text: 'Color', onclick: (e) => colorPop(e.currentTarget) }),
    el('span', { class: 'de-sep' }),
    saveBtn,
    note,
  ]);
  document.body.appendChild(bar);

  const undoBar = el('div', { class: 'de-undo' }, [undoBtn, redoBtn]);
  document.body.appendChild(undoBar);

  /* 본 툴바는 가운데 정렬이라 폭이 바뀝니다. 그 왼쪽에 12px 을 띄워 따라붙되,
     자리가 모자라면 아래로 내려갑니다 — 좁은 창에서 두 알약이 겹치면 둘 다
     눌리지 않습니다. */
  function placeUndo() {
    const r = bar.getBoundingClientRect();
    const w = undoBar.offsetWidth;
    const room = r.left - w - 24 >= 0;
    undoBar.style.left = (room ? r.left - w - 12 : 12) + 'px';
    undoBar.style.top = (room ? r.top : r.bottom + 8) + 'px';
  }
  addEventListener('resize', placeUndo);
  new ResizeObserver(placeUndo).observe(bar);
  placeUndo();

  function refreshHistory() {
    undoBtn.disabled = !past.length;
    redoBtn.disabled = !future.length;
  }
  setInterval(refreshHistory, 400);
  refreshHistory();

  function refreshSize() {
    if (document.activeElement === sizeLabel) return; // 적는 중에는 건드리지 않습니다.
    const px = currentSize();
    sizeLabel.value = px === null ? '' : px;
  }
  document.addEventListener('selectionchange', refreshSize);

  function toggleEdit(force) {
    editing = force === undefined ? !editing : force;
    document.body.classList.toggle('de-editing', editing);
    editBtn.classList.toggle('de-on', editing);
    closeFields();
    if (!editing) { finishMove(true); hideMove(); closeSvgInput(); textTarget = null; }
  }

  let railOn = false;
  function toggleRail(force) {
    railOn = force === undefined ? !railOn : force;
    rail.hidden = !railOn;
    railBtn.classList.toggle('de-on', railOn);
    if (railOn) buildRail();
  }

  STAGE.addEventListener('dblclick', (e) => {
    if (!editing) return;
    const node = e.target.closest && e.target.closest('tspan, text');
    if (!node || node.children.length) return;
    e.preventDefault();
    editSvgText(node);
  });

  /* 붙여 넣기는 글자만 받습니다. 남의 서식이 들어오면 지면이 깨집니다. */
  STAGE.addEventListener('paste', (e) => {
    if (!editing) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text.replace(/\r?\n/g, ' '));
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        save();
      } else if (e.key === 'z' || e.key === 'Z') {
        /* 글자 칸 안에서는 브라우저의 되돌리기가 맞습니다 — 한 자씩 물러섭니다.
           칸 밖에서 누를 때만 장 단위로 되돌립니다. */
        if (document.activeElement && document.activeElement.isContentEditable) return;
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      return;
    }
    if (document.activeElement && document.activeElement.isContentEditable) {
      if (e.key === 'Escape') toggleEdit(false);
      return; // 고치는 중에는 화살표가 글자 사이를 움직입니다.
    }
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      toggleEdit();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      toggleRail();
    } else if (e.key === 'Escape') {
      closePop();
      toggleRail(false);
    }
  });

  /* 발표 컨트롤러가 화살표·휠·터치를 잡고 있으면 고치는 동안 장이 넘어갑니다.
     자료 쪽에서 막아 두는 것이 가장 깨끗하지만, 안 되어 있어도 여기서 한 번
     더 막습니다 — 캡처 단계라 컨트롤러보다 먼저 받습니다. */
  const swallow = (e) => {
    if (!document.body.classList.contains('de-editing')) return;
    if (e.type === 'keydown' && !/^Arrow|^Page|^Home$|^End$|^ $/.test(e.key)) return;
    if (document.activeElement && document.activeElement.isContentEditable) e.stopPropagation();
  };
  ['keydown', 'wheel'].forEach((type) => document.addEventListener(type, swallow, true));

  /* ── 개체 선택·이동·그룹화 ────────────────────────────────────────────────
     한 번 클릭은 선택, 더블클릭은 글자 편집입니다. 그룹은 식별자로 연결하므로
     HTML 배치와 SVG 좌표계를 바꾸지 않고 함께 선택·이동할 수 있습니다. */
  const selectionLayer = el('div', { class: 'de-selection-layer' });
  document.body.appendChild(selectionLayer);
  const groupBtn = el('button', { class: 'de-btn', text: '그룹', title: '그룹화 ⌘G / Ctrl+G', onclick: () => groupSelection(false) });
  const ungroupBtn = el('button', { class: 'de-btn', text: '그룹 해제', title: '그룹 해제 ⇧⌘G / Ctrl+Shift+G', onclick: () => groupSelection(true) });
  const selectedLabel = el('span', { class: 'de-selection-count', 'aria-live': 'polite' });
  const selectionTools = el('span', { class: 'de-selection-tools', hidden: '' }, [selectedLabel, groupBtn, ungroupBtn]);
  bar.insertBefore(selectionTools, saveBtn);
  let selected = [], drag = null, textTarget = null;
  const activeSlide = () => slides()[current()];
  const moveAttrs = ['transform', 'style', 'data-de-move-base', 'data-de-move-x', 'data-de-move-y'];
  function endText() { document.activeElement?.blur(); closeFields(); closeSvgInput(); textTarget = null; }
  function hideMove() { selected = []; selectionLayer.replaceChildren(); selectionTools.hidden = true; }
  function normalize(nodes) {
    const unique = [...new Set(nodes)].filter(n => n?.isConnected && activeSlide()?.contains(n));
    return unique.filter(n => !unique.some(parent => parent !== n && parent.contains(n)));
  }
  function members(node) {
    const id = node.dataset.deGroup;
    return id ? [...activeSlide().querySelectorAll('[data-de-group]')].filter(n => n.dataset.deGroup === id) : [node];
  }
  function movable(target) {
    if (!(target instanceof Element) || !STAGE.contains(target)) return null;
    if (CFG.skip && target.closest(CFG.skip)) return null;
    const explicit = target.closest('[data-movable]');
    if (explicit) return explicit;
    const svg = target.closest('svg');
    if (svg) {
      if (svg.classList.contains('bg') || target.closest('defs, marker, mask, clipPath')) return null;
      const group = target.closest('g');
      return group || target.closest('text, image, rect, circle, ellipse, path, polygon, polyline, line');
    }
    const block = target.closest('img, video, canvas, h1, h2, h3, h4, p, li, [contenteditable="true"]');
    if (block) return block;
    // 독립 인라인 문구도 편집하되, 버튼과 레이아웃을 감싼 요소는 제외합니다.
    const inline = target.closest('span, b, strong, em, small');
    if (!inline || inline.closest('button, a, [role="button"]') || !inline.textContent.trim()) return null;
    if (inline.querySelector('div, section, aside, svg, img, button, input, textarea')) return null;
    return inline;
  }
  function locateMove() {
    if (!editing) { hideMove(); return; }
    selected = normalize(selected);
    const focusDir=selectionLayer.contains(document.activeElement)?document.activeElement.dataset.resize:null;
    selectionLayer.replaceChildren();
    selectionTools.hidden = !selected.length;
    selectedLabel.textContent = selected.length + '개 선택';
    groupBtn.disabled = selected.length < 2;
    ungroupBtn.disabled = !selected.some(n => n.dataset.deGroup);
    const boxes = selected.map(n => n.getBoundingClientRect());
    if (boxes.length) {
      const left = Math.min(...boxes.map(r => r.left)), top = Math.min(...boxes.map(r => r.top));
      const right = Math.max(...boxes.map(r => r.right)), bottom = Math.max(...boxes.map(r => r.bottom));
      boxes.forEach(r => selectionLayer.appendChild(el('div', { class: 'de-object-box', style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` })));
      const box = el('div', { class: 'de-selection-box', style: `left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px` });
      const handles = [['nw',0,0,'왼쪽 위'],['n',50,0,'위'],['ne',100,0,'오른쪽 위'],['e',100,50,'오른쪽'],['se',100,100,'오른쪽 아래'],['s',50,100,'아래'],['sw',0,100,'왼쪽 아래'],['w',0,50,'왼쪽']];
      handles.forEach(([dir,x,y,label]) => box.appendChild(el('button', {class:'de-resize-handle',type:'button','data-resize':dir,'aria-label':label+' 크기 조절',title:label+' 크기 조절 · 모서리 비율 유지 · Shift 자유 조절',style:`left:${x}%;top:${y}%;cursor:${dir==='n'||dir==='s'?'ns':dir==='e'||dir==='w'?'ew':dir==='nw'||dir==='se'?'nwse':'nesw'}-resize`})));
      selectionLayer.appendChild(box);
      if(focusDir && !drag) box.querySelector('[data-resize="'+focusDir+'"]')?.focus({preventScroll:true});
    }
    if (drag?.kind === 'marquee' && drag.moved) {
      const r = drag.rect;
      selectionLayer.appendChild(el('div', { class: 'de-marquee', style: `left:${r.left}px;top:${r.top}px;width:${r.right-r.left}px;height:${r.bottom-r.top}px` }));
    }
  }
  function movementState(node) {
    const svg = node instanceof SVGElement && node.tagName.toLowerCase() !== 'svg';
    const x = Number(node.dataset.deMoveX || 0), y = Number(node.dataset.deMoveY || 0);
    const base = node.dataset.deMoveBase ?? (svg ? (node.getAttribute('transform') || '') : (node.style.translate || 'none'));
    const matrix = svg ? node.parentElement.getScreenCTM?.() : null;
    const scale = STAGE.getBoundingClientRect().width / (STAGE.offsetWidth || STAGE.getBoundingClientRect().width);
    return { node, svg, x, y, base, inverse: matrix?.inverse(), scale,
      attrs: Object.fromEntries(moveAttrs.map(key => [key, node.getAttribute(key)])) };
  }
  function placeMoved(state, x, y) {
    const { node, svg, base } = state;
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    node.dataset.deMoveBase = base; node.dataset.deMoveX = x; node.dataset.deMoveY = y;
    if (svg) node.setAttribute('transform', `translate(${x} ${y}) ${base}`.trim());
    else {
      const terms = base === 'none' ? ['0px', '0px'] : base.split(/\s+/);
      node.style.translate = `calc(${terms[0]} + ${x}px) calc(${terms[1] || '0px'} + ${y}px)${terms[2] ? ' ' + terms[2] : ''}`;
    }
  }
  function rememberMove(before) {
    past.push(before); if (past.length > DEPTH) past.shift(); future.length = 0;
    refreshHistory(); queueSave();
  }
  function candidates() {
    const root = activeSlide(), list = [...root.querySelectorAll('h1,h2,h3,h4,p,li,img,video,canvas,[data-movable]')].filter(n => !n.closest('svg'));
    root.querySelectorAll('span,b,strong,em,small').forEach(node => {
      if (!node.closest('svg') && movable(node) === node) list.push(node);
    });
    root.querySelectorAll('svg:not(.bg)').forEach(svg => {
      [...svg.children].filter(n => /^(g|text|image|rect|circle|ellipse|path|polygon|polyline|line)$/i.test(n.tagName)).forEach(n => list.push(n));
    });
    return normalize(list.filter(n => !(CFG.skip && n.matches(CFG.skip))));
  }
  function finishMove(cancel) {
    if (!drag) return;
    const ended = drag; drag = null;
    if (cancel) {
      ended.states?.forEach(state => moveAttrs.forEach(key => state.attrs[key] === null ? state.node.removeAttribute(key) : state.node.setAttribute(key, state.attrs[key])));
      selected = ended.selection;
    } else if ((ended.kind === 'move' || ended.kind === 'resize') && ended.moved) rememberMove(ended.before);
    if (selectionLayer.hasPointerCapture(ended.id)) selectionLayer.releasePointerCapture(ended.id);
    if (STAGE.hasPointerCapture(ended.id)) STAGE.releasePointerCapture(ended.id);
    locateMove();
  }
  function beginResize(handle, x, y, id) {
    endText();
    const states = selected.map(n => {
      const state = movementState(n), r = n.getBoundingClientRect();
      const values = getComputedStyle(n).scale.split(/\s+/);
      return { ...state, rect: r, screen: state.svg ? n.getScreenCTM() : null,
        parentInverse: state.svg ? n.parentElement.getScreenCTM().inverse() : null,
        scaleX: values[0] === 'none' ? 1 : Number(values[0]), scaleY: values[0] === 'none' ? 1 : Number(values[1] || values[0]) };
    });
    const bounds = { left: Math.min(...states.map(s=>s.rect.left)), top: Math.min(...states.map(s=>s.rect.top)), right: Math.max(...states.map(s=>s.rect.right)), bottom: Math.max(...states.map(s=>s.rect.bottom)) };
    drag = { kind:'resize', handle, sx:x, sy:y, id, states, bounds, before:snapshot(), selection:[...selected], moved:false };
  }
  function resizeTo(x, y, freeRatio) {
    const d=drag, b=d.bounds, h=d.handle, dx=x-d.sx, dy=y-d.sy;
    const w=b.right-b.left, height=b.bottom-b.top;
    if (!w || !height) return;
    let nw=Math.max(16,w+(h.includes('e')?dx:h.includes('w')?-dx:0));
    let nh=Math.max(16,height+(h.includes('s')?dy:h.includes('n')?-dy:0));
    if (h.length===2 && !freeRatio) {
      const factor=Math.max(16/Math.min(w,height),Math.abs(nw/w-1)>Math.abs(nh/height-1)?nw/w:nh/height);
      nw=w*factor; nh=height*factor;
    }
    const left=h.includes('w')?b.right-nw:b.left, top=h.includes('n')?b.bottom-nh:b.top;
    const fx=nw/w, fy=nh/height;
    const world=new DOMMatrix([fx,0,0,fy,left-fx*b.left,top-fy*b.top]);
    d.states.forEach(state=>{
      const n=state.node;
      if (state.svg) {
        const asDOM = m => new DOMMatrix([m.a,m.b,m.c,m.d,m.e,m.f]);
        const m=asDOM(state.parentInverse).multiply(world).multiply(asDOM(state.screen));
        const value=`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
        n.setAttribute('transform',value);
        n.dataset.deMoveBase=value; n.dataset.deMoveX='0'; n.dataset.deMoveY='0';
      } else {
        // 처음 상태에서 다시 계산해 연속 입력으로 배율 오차가 쌓이지 않게 합니다.
        state.attrs.style===null?n.removeAttribute('style'):n.setAttribute('style',state.attrs.style);
        n.style.scale=`${state.scaleX*fx} ${state.scaleY*fy}`;
        const r=n.getBoundingClientRect();
        const desiredX=left+(state.rect.left-b.left)*fx, desiredY=top+(state.rect.top-b.top)*fy;
        placeMoved(state,state.x+(desiredX-r.left)/state.scale,state.y+(desiredY-r.top)/state.scale);
      }
    });
    d.moved=true;locateMove();
  }
  selectionLayer.addEventListener('pointerdown',e=>{
    const handle=e.target.closest('[data-resize]');
    if (!handle || e.button!==0 || !selected.length) return;
    e.preventDefault();e.stopPropagation();
    beginResize(handle.dataset.resize,e.clientX,e.clientY,e.pointerId);
    selectionLayer.setPointerCapture(e.pointerId);
  });
  selectionLayer.addEventListener('pointermove',e=>{
    if (drag?.kind!=='resize' || drag.id!==e.pointerId) return;
    if (!(e.buttons & 1)) { finishMove(false); return; }
    e.preventDefault();resizeTo(e.clientX,e.clientY,e.shiftKey);
  });
  selectionLayer.addEventListener('pointerup',()=>{if(drag?.kind==='resize')finishMove(false);});
  selectionLayer.addEventListener('pointercancel',()=>{if(drag?.kind==='resize')finishMove(true);});
  selectionLayer.addEventListener('lostpointercapture',()=>{if(drag?.kind==='resize')finishMove(true);});

  STAGE.addEventListener('pointerdown', e => {
    if (!editing || e.button !== 0 || e.target.closest('[' + MARK + ']')) return;
    if (textTarget?.contains(e.target)) return;
    endText();
    e.preventDefault(); e.stopPropagation();
    const hit = movable(e.target), prior = [...selected];
    if (hit) {
      const batch = members(hit);
      if (e.shiftKey) {
        const remove = batch.every(n => selected.includes(n));
        selected = normalize(remove ? selected.filter(n => !batch.includes(n)) : [...selected, ...batch]);
        if (remove) { locateMove(); return; }
      } else if (!selected.includes(hit)) selected = normalize(batch);
      drag = { kind: 'move', states: selected.map(movementState), before: snapshot(), selection: prior };
    } else {
      if (!e.shiftKey) selected = [];
      drag = { kind: 'marquee', candidates: candidates(), additive: e.shiftKey ? prior : [], selection: prior };
    }
    Object.assign(drag, { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false });
    locateMove();
  }, true);
  STAGE.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    // pointerup을 놓쳤더라도 버튼을 놓은 포인터 이동은 개체를 움직이지 않습니다.
    if (!(e.buttons & 1)) { finishMove(false); return; }
    const dx = e.clientX-drag.sx, dy = e.clientY-drag.sy;
    if (!drag.moved && Math.hypot(dx,dy) < 3) return;
    e.preventDefault(); e.stopPropagation();
    if (!drag.moved) STAGE.setPointerCapture(e.pointerId);
    drag.moved = true;
    if (drag.kind === 'move') {
      drag.states.forEach(state => {
        const m = state.inverse;
        placeMoved(state, state.x+(m ? m.a*dx+m.c*dy : dx/state.scale), state.y+(m ? m.b*dx+m.d*dy : dy/state.scale));
      });
    } else {
      drag.rect = { left: Math.min(drag.sx,e.clientX), right: Math.max(drag.sx,e.clientX), top: Math.min(drag.sy,e.clientY), bottom: Math.max(drag.sy,e.clientY) };
      const r = drag.rect;
      const enclosed = drag.candidates.filter(n => { const b=n.getBoundingClientRect(); return b.width && b.height && b.left>=r.left && b.right<=r.right && b.top>=r.top && b.bottom<=r.bottom; });
      selected = normalize([...drag.additive,...enclosed.flatMap(members)]);
    }
    locateMove();
  }, true);
  // 선택 직후 생긴 핸들이 pointerup을 받거나 포인터가 무대 밖으로 나가도
  // 창의 캡처 단계에서 항상 드래그를 종료합니다.
  window.addEventListener('pointerup', e => { if (drag?.id === e.pointerId) finishMove(false); }, true);
  window.addEventListener('pointercancel', e => { if (drag?.id === e.pointerId) finishMove(true); }, true);
  window.addEventListener('blur', () => finishMove(true));
  STAGE.addEventListener('pointerup', () => finishMove(false), true);
  STAGE.addEventListener('pointercancel', () => finishMove(true), true);
  STAGE.addEventListener('lostpointercapture', () => finishMove(true), true);
  STAGE.addEventListener('dblclick', e => {
    if (!editing) return;
    const node = movable(e.target);
    if (!node || node instanceof SVGElement || !node.matches('h1,h2,h3,h4,p,li,span,b,strong,em,small,[contenteditable]')) return;
    e.preventDefault(); hideMove(); textTarget = node;
    node.setAttribute('contenteditable','true'); node.setAttribute('spellcheck','false'); node.focus();
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  function groupSelection(ungroup) {
    finishMove(false); selected = normalize(selected);
    if (ungroup ? !selected.some(n => n.dataset.deGroup) : selected.length < 2) return;
    const before = snapshot();
    if (ungroup) selected.forEach(n => delete n.dataset.deGroup);
    else { const id = 'group-' + crypto.randomUUID(); selected.forEach(n => { n.dataset.deGroup = id; }); }
    rememberMove(before); locateMove();
  }
  window.addEventListener('keydown', e => {
    if (!editing || e.target.closest?.('input,textarea,[contenteditable="true"]')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault(); e.stopImmediatePropagation(); groupSelection(e.shiftKey); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finishMove(true); hideMove(); return; }
    const delta = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[e.key];
    if (!delta || !selected.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const before = snapshot(), step = e.shiftKey ? 10 : 1;
    selected.forEach(n => {
      const state=movementState(n), m=state.inverse;
      const dx=delta[0]*step, dy=delta[1]*step;
      placeMoved(state,state.x+(m ? (m.a*dx+m.c*dy)*state.scale : dx),state.y+(m ? (m.b*dx+m.d*dy)*state.scale : dy));
    });
    rememberMove(before); locateMove();
  }, true);
  STAGE.addEventListener('dragstart', e => { if (editing && !textTarget?.contains(e.target)) e.preventDefault(); });
  addEventListener('resize', locateMove); addEventListener('scroll',locateMove,true);
  setInterval(locateMove,180);

  /* 기록은 문서별 IndexedDB에 보관합니다. HTML에는 히스토리를 넣지 않습니다.
     기준 문서와 다른 외부 수정본에는 과거 기록을 적용하지 않습니다. */
  const historyKey = location.pathname;
  let historyDB = null, historyRevision = 0, historyScheduled = false;
  const historyInitial = snapshot();
  function canonicalHistory(html) {
    const root = document.createElement('div'); root.innerHTML = html;
    root.querySelectorAll('[contenteditable],[spellcheck],[draggable]').forEach(n => {
      n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); n.removeAttribute('draggable');
    });
    root.querySelectorAll(found.sel).forEach(n => n.classList.remove('active'));
    if (CFG.skip) root.querySelectorAll(CFG.skip).forEach(n => { n.textContent = ''; });
    root.querySelectorAll('[class=""]').forEach(n => n.removeAttribute('class'));
    return root.innerHTML;
  }
  function packHistory(value, base) {
    let prefix=0, suffix=0;
    while(prefix<value.length && prefix<base.length && value[prefix]===base[prefix]) prefix++;
    while(suffix<value.length-prefix && suffix<base.length-prefix && value[value.length-1-suffix]===base[base.length-1-suffix]) suffix++;
    return [prefix,suffix,value.slice(prefix,value.length-suffix)];
  }
  const unpackHistory = (part,base) => base.slice(0,part[0])+part[2]+(part[1]?base.slice(-part[1]):'');
  function persistHistory() {
    historyRevision++;
    if (historyScheduled) return;
    historyScheduled=true;
    queueMicrotask(() => {
      historyScheduled=false;
      if (!historyDB) return;
      const base=snapshot();
      const undoEntries=enter && enter.host.innerHTML!==enter.was ? [...past,enter.all].slice(-DEPTH) : past;
      try {
        const tx=historyDB.transaction('documents','readwrite');
        tx.objectStore('documents').put({version:1,base,past:undoEntries.map(s=>packHistory(s,base)),future:future.map(s=>packHistory(s,base))},historyKey);
        tx.onerror=()=>console.warn('발표 편집 히스토리 저장 실패: 현재 탭의 실행 취소는 유지됩니다.');
      } catch(err) { console.warn('발표 편집 히스토리 저장 실패',err); }
    });
  }
  function loadHistory() {
    const revision=historyRevision;
    const request=indexedDB.open('html-presentation-history',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('documents');
    request.onerror=()=>console.warn('발표 편집 히스토리 저장소를 열지 못했습니다.');
    request.onsuccess=()=>{
      historyDB=request.result;
      historyDB.onversionchange=()=>{historyDB.close();historyDB=null;};
      const read=historyDB.transaction('documents','readonly').objectStore('documents').get(historyKey);
      read.onsuccess=()=>{
        if(historyRevision!==revision){persistHistory();return;}
        const saved=read.result;
        if(!saved || saved.version!==1) return;
        if(canonicalHistory(saved.base)!==canonicalHistory(historyInitial)) return;
        past.push(...saved.past.map(p=>unpackHistory(p,saved.base)).slice(-DEPTH));
        future.push(...saved.future.map(p=>unpackHistory(p,saved.base)).slice(-DEPTH));
        refreshHistory();
      };
    };
  }
  loadHistory();
  addEventListener('pagehide',persistHistory);

  /* 파일 변경은 같은 DOM에 반영합니다. 키 입력·드래그·저장 중에는 기다립니다. */
  let liveRevision=null,liveChecking=false,liveLocalRevision=0;
  const liveBusy=()=>saving || saveTimer!==null || drag || svgInput || document.activeElement?.isContentEditable;
  function sourceScripts(root) {
    return [...root.querySelectorAll('script')].filter(n=>!n.hasAttribute(MARK)).map(n=>[n.getAttribute('src')||'',n.textContent]);
  }
  async function checkLiveFile() {
    if (liveChecking || liveBusy() || location.protocol==='file:') return;
    liveChecking=true;
    const localVersion=liveLocalRevision;
    try {
      const head=await fetch(location.pathname,{method:'HEAD',cache:'no-store'});
      const revision=head.headers.get('X-Deck-Revision');
      if(!head.ok || !revision || revision===liveRevision) return;
      const response=await fetch(location.pathname,{cache:'no-store'});
      if(!response.ok) return;
      const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
      if(liveBusy() || localVersion!==liveLocalRevision) return;
      const incoming=STAGE.id?parsed.getElementById(STAGE.id):parsed.querySelector(found.sel)?.parentElement;
      if(!incoming) return;
      const sourceChanged=JSON.stringify(sourceScripts(parsed))!==JSON.stringify(sourceScripts(document));
      const contentChanged=canonicalHistory(incoming.innerHTML)!==canonicalHistory(snapshot());
      const oldStyles=[...document.head.querySelectorAll('style')].filter(n=>!n.hasAttribute(MARK));
      const newStyles=[...parsed.head.querySelectorAll('style')].filter(n=>!n.hasAttribute(MARK));
      const styleChanged=oldStyles.length!==newStyles.length || oldStyles.some((n,i)=>n.textContent!==newStyles[i]?.textContent);
      if(contentChanged) {
        mark(); restore(incoming.innerHTML,{external:true});
      }
      if(styleChanged) {
        newStyles.forEach((style,i)=>{
          if(oldStyles[i]) { if(oldStyles[i].textContent!==style.textContent) oldStyles[i].textContent=style.textContent; }
          else document.head.appendChild(style.cloneNode(true));
        });
        oldStyles.slice(newStyles.length).forEach(n=>n.remove());
      }
      document.title=parsed.title;
      liveRevision=response.headers.get('X-Deck-Revision')||revision;
      if(sourceChanged) {
        // 새 스크립트는 중복 실행하지 않습니다. 내용과 히스토리를 먼저 보관합니다.
        persistHistory();
        setTimeout(()=>{if(!liveBusy() && localVersion===liveLocalRevision) location.reload();else liveRevision=null;},350);
      } else if(contentChanged || styleChanged) {
        locateMove(); flash('파일 변경 반영됨');
      }
    } catch(err) { console.debug('실시간 파일 확인 대기',err); }
    finally { liveChecking=false; }
  }
  setInterval(checkLiveFile,1500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkLiveFile();});
  checkLiveFile();

  window.deckEditor = { save, toggleEdit, toggleRail, serialize };
})();
