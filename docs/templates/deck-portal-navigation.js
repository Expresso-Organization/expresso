/* 포털에서 연 발표의 작업대 버튼은 슬라이드 라이브러리로 돌아갑니다. */
(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  if (query.has('preview')) return;
  if (query.get('portal') !== '1' && location.hostname !== 'dev.expresso.ai.kr') return;
  const scriptUrl = document.currentScript.src;
  const library = new URL('../Expresso 개발 포털.dc.html#/doc/deck', scriptUrl);
  const embedded = window.parent !== window;
  const goBack = event => {
    if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    if (event) { event.preventDefault(); event.stopImmediatePropagation(); }
    if (embedded) window.parent.postMessage({ type: 'expresso:deck-library' }, location.origin);
    else location.assign(library.href);
  };
  document.querySelectorAll('.deck-controls .home, .overview .back').forEach(link => {
    link.href = library.href;
    link.title = '슬라이드 라이브러리 (H)';
    link.setAttribute('aria-label', '슬라이드 라이브러리');
    if (link.matches('.overview .back')) link.textContent = '← 라이브러리 (H)';
    link.addEventListener('click', goBack, true);
  });
  window.addEventListener('keydown', event => {
    if (event.key.toLowerCase() !== 'h' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]') || document.body.classList.contains('de-editing')) return;
    goBack(event);
  }, true);
})();
