/* 작업대 서버에서 열린 덱의 편집 바에 내보내기를 연결합니다. */
(() => {
  const scriptURL=document.currentScript.src;
  if (window.__deckExportUI || new URLSearchParams(location.search).has('export') || new URLSearchParams(location.search).has('preview')) return;
  window.__deckExportUI = true;
  const attach = () => {
    const bar = document.querySelector('.de-bar');
    if (!bar || !window.deckEditor?.serialize) return false;
    const button = document.createElement('button');
    button.className = 'de-btn';
    button.setAttribute('aria-label', '내보내기');
    button.title = '내보내기';
    button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M5 13v7h14v-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:34px;padding:0';
    button.type = 'button';
    button.setAttribute('data-deck-editor', '');
    bar.insertBefore(button, bar.querySelector('.de-save'));
    const dialog = document.createElement('dialog');
    dialog.setAttribute('data-deck-editor', '');
    dialog.setAttribute('aria-labelledby', 'deck-export-title');
    dialog.className = 'deck-export-dialog';
    dialog.innerHTML = `<form>
      <h2 id="deck-export-title">내보내기</h2>
      <label for="deck-export-format">파일 형식</label>
      <select id="deck-export-format"><option value="pdf">PDF</option><option value="pptx">PowerPoint (.pptx)</option></select>
      <p>게시된 제안서를 다운로드합니다. 브라우저에서 수정한 내용은 포함되지 않습니다. 개별 글자·도형 편집과 애니메이션·영상 재생은 포함되지 않습니다.</p>
      <p class="export-status" role="status" aria-live="polite"></p>
      <div class="export-progress" hidden><progress aria-label="변환 진행률" max="100"></progress><span class="export-percent"></span></div>
      <a class="export-download" hidden>파일 다운로드</a>
      <div class="export-actions"><button type="button" class="export-close">닫기</button><button type="submit">내보내기</button></div>
    </form>`;
    const style = document.createElement('style');
    style.setAttribute('data-deck-editor', '');
    style.textContent = `.deck-export-dialog{position:fixed!important;inset:0!important;margin:auto!important;transform:none!important;height:fit-content;max-height:calc(100dvh - 48px);overflow:auto;width:420px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:24px;border:1px solid #dce2e9;border-radius:16px;background:#fff;color:#253044;font-family:system-ui,sans-serif;box-shadow:0 16px 60px #0002}
    .deck-export-dialog::backdrop{background:#17203366}
    .deck-export-dialog h2{font:600 20px system-ui;margin:0 0 24px}
    .deck-export-dialog label{font-size:14px}
    .deck-export-dialog select{display:block;width:100%;margin:8px 0 16px;padding:10px;border:1px solid #dce2e9;border-radius:8px;background:#fff;color:#253044;font:14px system-ui}
    .deck-export-dialog p{font:13px/1.6 system-ui;color:#596579;white-space:pre-wrap;overflow-wrap:anywhere}
    .deck-export-dialog .export-progress{display:flex;align-items:center;gap:12px;margin:16px 0}
    .deck-export-dialog .export-progress[hidden]{display:none}
    .deck-export-dialog progress{appearance:none;-webkit-appearance:none;flex:1;width:0;height:8px;border:0;border-radius:99px;overflow:hidden;background:#e8edf3;accent-color:#2f5d8a}
    .deck-export-dialog progress::-webkit-progress-bar{background:#e8edf3;border-radius:99px}
    .deck-export-dialog progress::-webkit-progress-value{background:#2f5d8a;border-radius:99px;transition:width .2s ease}
    @media(prefers-reduced-motion:reduce){.deck-export-dialog progress::-webkit-progress-value{transition:none}}
    .deck-export-dialog progress::-moz-progress-bar{background:#2f5d8a;border-radius:99px}
    .deck-export-dialog .export-percent{min-width:38px;text-align:right;font:12px system-ui;font-variant-numeric:tabular-nums;color:#596579}
    .deck-export-dialog a{font:13px system-ui;color:#2f5d8a}
    .deck-export-dialog .export-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
    .deck-export-dialog button{padding:9px 16px;border:1px solid #dce2e9;border-radius:8px;background:#fff;color:#253044;cursor:pointer;font:13px system-ui}
    .deck-export-dialog button[type=submit]{background:#253044;color:white;border-color:#253044}
    .deck-export-dialog button:disabled{opacity:.5;cursor:default}`;
    document.head.append(style);
    document.body.append(dialog);
    const form = dialog.querySelector('form'), format = dialog.querySelector('select');
    const status = dialog.querySelector('.export-status'), link = dialog.querySelector('a');
    const submit = dialog.querySelector('[type=submit]');
    const progressBox=dialog.querySelector('.export-progress'), progressBar=dialog.querySelector('progress'), percent=dialog.querySelector('.export-percent');
    let busy = false;
    button.onclick = () => dialog.showModal();
    dialog.querySelector('.export-close').onclick = () => dialog.close();
    // 덱의 전역 단축키가 대화상자 입력과 충돌하지 않게 합니다.
    dialog.addEventListener('keydown', e => e.stopPropagation());
    form.onsubmit = async e => {
      e.preventDefault();
      if (busy) return;
      busy=true; submit.disabled=format.disabled=true; link.hidden=true;
      progressBox.hidden=true;
      try {
        const kind=format.value;
        const url=new URL('../downloads/project-proposal.'+kind,document.currentScript?.src||scriptURL);
        link.href=url.href;link.download='프로젝트-제안서.'+kind;
        link.textContent=link.download+' 다운로드';link.hidden=false;
        status.textContent='게시된 제안서 다운로드';link.click();
      } finally {busy=false;submit.disabled=format.disabled=false;}

    };
    return true;
  };
  if (!attach()) {
    const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),30000);
  }
})();
