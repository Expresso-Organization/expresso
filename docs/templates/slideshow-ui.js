/* 슬라이드 쇼와 편집 바 토글. 저장 파일에는 런타임 도구를 남기지 않습니다. */
(() => {
  const params=new URLSearchParams(location.search);
  if(params.has('preview')||params.has('export')||window.__deckShowUI)return;
  window.__deckShowUI=true;
  const attach=()=>{
    const controls=document.querySelector('.deck-controls'),bar=document.querySelector('.de-bar');
    if(!controls||!bar||!window.deckEditor)return false;
    const icon=path=>`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const style=document.createElement('style');style.setAttribute('data-deck-editor','');document.head.append(style);
    let presenting=!!document.fullscreenElement,editorVisible=true,nativeEntered=!!document.fullscreenElement;
    const show=document.createElement('button');show.type='button';show.className='deck-show-toggle';show.setAttribute('data-deck-editor','');
    const original=document.getElementById('mapBtn');
    if(original) original.after(show);else controls.append(show);
    let toggle=controls.querySelector('.de-editor-toggle');
    if(!toggle){
      toggle=document.createElement('button');toggle.type='button';toggle.className='de-editor-toggle';toggle.setAttribute('data-deck-editor','');
      toggle.onclick=()=>{
        editorVisible=!editorVisible;
        if(!editorVisible){window.deckEditor.toggleEdit(false);window.deckEditor.toggleRail(false);}
        update();
      };
    } else {
      toggle.addEventListener('click',()=>{editorVisible=toggle.getAttribute('aria-pressed')==='true';update();});
    }
    controls.insertBefore(toggle,show);
    toggle.innerHTML=icon('M4 5h16v14H4zM4 10h16M8 7.5h.01M11 7.5h.01');
    const base=`.deck-controls #mapBtn{display:none!important}
      .deck-controls .deck-show-toggle,.deck-controls .de-editor-toggle{display:grid;place-items:center;padding:0}
      .deck-controls .de-editor-toggle[aria-pressed="true"]{color:var(--deck-control-accent,#2f5d8a)}
      .de-bar[hidden],.de-undo[hidden]{display:none!important}`;
    function update(){
      const label=presenting?'슬라이드 쇼 종료':'슬라이드 쇼 시작';show.setAttribute('aria-label',label);show.title=label;show.setAttribute('aria-pressed',String(presenting));
      show.innerHTML=icon(presenting?'M5 4h14v12H5zM9 20h6M12 16v4M9 8h6v4H9z':'M3 4h18v12H3zM9 20h6M12 16v4M10 7l5 3-5 3z');
      toggle.setAttribute('aria-pressed',String(editorVisible));toggle.setAttribute('aria-label',editorVisible?'편집 바 숨기기':'편집 바 표시');toggle.title=toggle.getAttribute('aria-label');
      style.textContent=base+(!editorVisible?'.de-bar,.de-undo,.de-pop{display:none!important}':'')+(presenting?`
        .deck-controls:not(:hover),.de-bar:not(:hover),.de-undo:not(:hover){opacity:0!important}
        .deck-controls:hover,.de-bar:hover,.de-undo:hover{opacity:1!important}
        .deck-controls::before{content:"";position:absolute;inset:-16px -12px -20px;z-index:-1;border-radius:999px}
        .de-bar::before,.de-undo::before{content:"";position:absolute;inset:-18px -12px;z-index:-1;border-radius:999px}
        .deck-progress{opacity:0!important}`:'');
    }
    async function setShow(on){
      presenting=on;
      if(on){window.deckEditor.toggleEdit(false);window.deckEditor.toggleRail(false);window.deck?.toggleMap?.(false);}
      update();
      try{
        if(on&&!document.fullscreenElement)await document.documentElement.requestFullscreen();
        else if(!on&&document.fullscreenElement)await document.exitFullscreen();
      }catch{/* 전체화면 API를 지원하지 않는 브라우저에서도 슬라이드 쇼 도구 숨김을 적용합니다. */}
    }
    show.onclick=()=>setShow(!presenting);
    document.addEventListener('fullscreenchange',()=>{
      if(document.fullscreenElement){nativeEntered=true;presenting=true;}
      else if(nativeEntered){nativeEntered=false;presenting=false;}
      update();
    });
    document.addEventListener('keydown',e=>{
      if(e.target.closest?.('input,textarea,select,[contenteditable="true"],dialog')||e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key.toLowerCase()==='f'){e.preventDefault();e.stopImmediatePropagation();setShow(!presenting);}
      if(e.key==='Escape'&&presenting){e.preventDefault();e.stopImmediatePropagation();setShow(false);}
    },true);
    update();return true;
  };
  if(!attach()){
    const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});
    observer.observe(document.documentElement,{subtree:true,childList:true});
    setTimeout(()=>observer.disconnect(),30000);
  }
})();
