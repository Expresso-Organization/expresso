import { TYPES, TYPE_OF, RIGHTS, COVERAGE, PAGE_SIZE, validateCatalog, parseLibraryRoute, libraryRoute, selectItems } from './catalog-core.mjs';

import {ACQUISITION, ROLES, applyAcquisitions, validateDetail} from './acquisition-core.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rightsLabel = item => item.sourceSite==='expresso'?'자체 작성':RIGHTS[item.rightsStatus];
const number = value => value.toLocaleString('ko-KR');
const link = (url, label) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
let catalogPromise;
const readJSON = path => fetch(new URL(path,import.meta.url)).then(response=>{if(!response.ok)throw new Error(`자료 요청 실패 (HTTP ${response.status})`);return response.json();});
const getCatalog = () => catalogPromise ||= Promise.all([readJSON('./catalog.json'),readJSON('./acquisitions.json')])
  .then(([base,acquired])=>applyAcquisitions(validateCatalog(base),acquired)).catch(error=>{catalogPromise=null;throw error;});

class ExpressoLibrary extends HTMLElement {
  static observedAttributes = ['route'];
  connectedCallback() {
    this.classList.add('ex-library');
    this.setAttribute('data-theme', 'light');
    this.details ||= new Map();
    this.addEventListener('load',event=>{if(['IMG','IFRAME'].includes(event.target.tagName))event.target.closest('.lib-visual')?.removeAttribute('data-loading');},true);
    this.addEventListener('error',event=>{if(event.target.tagName==='IMG' && event.target.closest('.lib-visual')){const frame=event.target.closest('.lib-visual');frame.removeAttribute('data-loading');frame.innerHTML='<span class="lib-image-error">원본 이미지에 연결하지 못했습니다<br>상세에서 출처를 확인하세요.</span>';}},true);
    this.onclick = event => {
      if (event.target.closest('[data-retry]')) this.load();
      if (event.target.closest('[data-close]')) this.navigate({id: ''});
      const button=event.target.closest('button');
      if(button?.dataset.live) this.openLive(button);
      if(button?.dataset.copy) this.copyMaterial(button);
      if(button?.hasAttribute('data-detail-retry')) this.loadDetail(this.data.items.find(i=>i.id===this.state.id),true);
      if(button?.hasAttribute('data-show-code')) this.showCode(button);
    };
    this.onchange = event => {
      if (event.target.name === 'page') this.navigate({page:Number(event.target.value), id:''});
      if (event.target.name === 'source') this.navigate({source:event.target.value, category:'', id:'', page:1});
      if (['role','availability'].includes(event.target.name)) this.navigate({[event.target.name]:event.target.value,id:'',page:1});
      if (event.target.name === 'category') this.navigate({category:event.target.value, id:'', page:1});
    };
    this.onsubmit = event => {
      if (!event.target.matches('[data-search]')) return;
      event.preventDefault();
      this.navigate({q:new FormData(event.target).get('q').trim(), id:'', page:1});
    };
    this.load();
  }
  disconnectedCallback() {
    this.querySelector('dialog')?.close();
    this.resizeObserver?.disconnect();
  }
  attributeChangedCallback() { if (this.isConnected && this.data) this.render(); }
  // 공유 주소는 기존 포털 라우터가 해석한 속성으로 받아 중복 렌더링을 방지합니다.
  get state() { return parseLibraryRoute(this.getAttribute('route') || '#/library'); }
  navigate(patch) { const next = libraryRoute({...this.state, ...patch}); if (location.hash !== next) location.hash = next; else this.render(); }
  async load() {
    this.innerHTML = '<div class="lib-message" role="status"><h1>라이브러리를 불러오는 중입니다</h1><p>수집 목록과 출처를 확인하고 있습니다.</p></div>';
    try { this.data = await getCatalog(); if (this.isConnected) this.render(); }
    catch (error) {
      if (this.isConnected) this.innerHTML = `<div class="lib-message" role="alert"><h1>목록을 불러오지 못했습니다</h1><p>${escape(error.message)}</p><button data-retry>다시 시도</button></div>`;
    }
  }
  render() {
    if (!this.data || !this.isConnected) return;
    const focusId = this.contains(document.activeElement) ? document.activeElement.id : null;
    const state = this.state;
    const data = this.data;
    const results = selectItems(data, state);
    const sources = new Map(data.sources.map(source => [source.id, source]));
    const selectedSource = sources.get(state.source);
    const categories = [...new Set(data.items.filter(i => !state.source || i.sourceSite === state.source).flatMap(i => i.categories))].sort();
    const counts = {};
    for (const item of data.items) counts[TYPE_OF[item.artifactKind]] = (counts[TYPE_OF[item.artifactKind]] || 0) + 1;
    const route = patch => escape(libraryRoute({...state, ...patch}));
    const selected = data.items.find(i => i.id === state.id);
    const changedSelection = this.lastSelection !== state.id;
    this.querySelector('dialog')?.close();
    this.innerHTML = `
      <header class="lib-heading">
        <div><p class="lib-eyebrow">PORTFOLIO LIBRARY <span>02 · 상세 자료 확보</span></p>
          <h1>포트폴리오 라이브러리</h1><p>컴포넌트 후보와 디자인 자료의 출처를 한곳에서 확인합니다.</p></div>
        <a class="lib-report" href="./portfolio-component-collection-stage-2.md">수집 결과 문서 ↗</a>
      </header>
      <div class="lib-summary">
        <div><strong>${number(data.items.length)}</strong><span>발견 항목</span></div>
        <div><strong>${number(data.items.filter(i=>i.preview).length)}</strong><span>미리보기 연결</span></div>
        <div><strong>${number(data.items.filter(i=>i.acquisitionStatus==='source_ready').length)}</strong><span>소스·자산 확보</span></div>
        <p>원본 예제와 공식 참고 이미지를 함께 확인합니다.<br>제품 등록·실제 경력 콘텐츠 검증은 후속 단계입니다.</p>
      </div>
      <nav class="lib-types" aria-label="라이브러리 자료 유형">${Object.entries(TYPES).map(([type,label]) =>
        `<a href="${route({type,id:'',page:1,category:''})}" ${state.type === type ? 'aria-current="page"' : ''}>${label}<span>${number(type === 'all' ? data.items.length : counts[type] || 0)}</span></a>`).join('')}</nav>
      <div class="lib-layout">
        <aside class="lib-sidebar" aria-label="수집 출처">
          <div class="lib-side-title">원본 사이트 <span>${data.sources.length}</span></div>
          <a href="${route({source:'',category:'',id:'',page:1})}" ${!state.source ? 'aria-current="true"' : ''}><span>모든 사이트</span><small>${number(data.items.length)}</small></a>
          ${data.sources.map(source => `<a href="${route({source:source.id,category:'',id:'',page:1})}" ${state.source === source.id ? 'aria-current="true"' : ''}><span>${escape(source.name)}</span><small>${number(source.discoveredCount)}</small></a>`).join('')}
          <p class="lib-side-note">항목 수에는 스타일 변형과 공급자 목록이 포함됩니다. 실제 사용 가능한 컴포넌트 수는 검증 후 집계합니다.</p>
        </aside>
        <main class="lib-main">
          <div class="lib-controls">
            <form data-search role="search"><label class="lib-sr" for="lib-query">라이브러리 검색</label><input type="search" id="lib-query" name="q" value="${escape(state.q)}" placeholder="이름, 식별자, 출처 검색"><button type="submit">검색</button></form>
            <label class="lib-mobile-source">사이트<select name="source" id="lib-source" aria-label="사이트"><option value="">모든 사이트</option>${data.sources.map(s=>`<option value="${s.id}" ${s.id===state.source?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label>
            <label>분류<select name="category" id="lib-category" aria-label="분류"><option value="">모든 분류</option>${categories.map(c=>`<option value="${escape(c)}" ${c===state.category?'selected':''}>${escape(c)}</option>`).join('')}</select></label>
          </div>
          <div class="lib-extra-filters"><label>포트폴리오 역할<select name="role" aria-label="포트폴리오 역할"><option value="">모든 역할</option>${Object.entries(ROLES).map(([id,name])=>`<option value="${id}" ${state.role===id?'selected':''}>${name}</option>`).join('')}</select></label><label>확보 상태<select name="availability" aria-label="확보 상태">${[['','전체 자료'],['preview','미리보기 있음'],['source','소스·자산 확보'],['waiting','확인 대기']].map(([id,name])=>`<option value="${id}" ${state.availability===id?'selected':''}>${name}</option>`).join('')}</select></label><a href="#/library">필터 초기화</a></div>
          ${selectedSource ? this.sourcePanel(selectedSource) : `<details class="lib-coverage"><summary>사이트별 수집 범위와 미처리 내역</summary><div class="lib-source-grid">${data.sources.map(s=>`<a href="${route({source:s.id,category:'',page:1,id:''})}"><strong>${escape(s.name)}</strong><span>${COVERAGE[s.coverageState]}</span><small>${number(s.discoveredCount)}개 · 후속 확인 ${s.nextActions.length}건</small></a>`).join('')}</div></details>`}
          <div class="lib-result-heading"><h2>${selectedSource ? escape(selectedSource.name) : TYPES[state.type]} <span>${number(results.total)}개</span></h2>
            <span>확인일 ${escape(data.generatedAt.slice(0,10))}</span></div>
          ${results.total ? `<div class="lib-grid">${results.items.map(item=>this.card(item,sources.get(item.sourceSite),state)).join('')}</div>`
            : `<div class="lib-message"><h3>${state.q || state.category ? '검색 조건에 맞는 항목이 없습니다' : '아직 목록에 등록된 자료가 없습니다'}</h3><p>${selectedSource ? escape(selectedSource.note) : state.type === 'pages' ? '검증된 컴포넌트를 조합한 페이지 구성은 후속 단계에서 추가합니다.' : '유형·사이트·검색 조건을 바꾸어 확인해 보세요.'}</p><a href="#/library">전체 목록 보기</a></div>`}
          <nav class="lib-pagination" aria-label="라이브러리 페이지"><span>${results.total ? number((results.page-1)*PAGE_SIZE+1) : 0}–${number(Math.min(results.page*PAGE_SIZE,results.total))} / ${number(results.total)}</span>
            <div>${results.page>1?`<a href="${route({page:results.page-1,id:''})}" rel="prev">← 이전</a>`:'<span aria-disabled="true">← 이전</span>'}<label class="lib-page-select"><span class="lib-sr">페이지 선택</span><select name="page" id="lib-page" ${results.pages===1?'disabled':''}>${Array.from({length:results.pages},(_,index)=>`<option value="${index+1}" ${index+1===results.page?'selected':''}>${index+1} 페이지</option>`).join('')}</select><span>/ ${number(results.pages)}</span></label>${results.page<results.pages?`<a href="${route({page:results.page+1,id:''})}" rel="next">다음 →</a>`:'<span aria-disabled="true">다음 →</span>'}</div></nav>
        </main>
      </div>
      ${state.id ? this.detail(selected, selected ? sources.get(selected.sourceSite) : null, state) : ''}`;
    const dialog = this.querySelector('dialog');
    if (dialog) {
      dialog.addEventListener('cancel', event => { event.preventDefault(); this.navigate({id:''}); });
      dialog.showModal();
      if (changedSelection) dialog.querySelector('button')?.focus();
    } else if (this.lastSelection) {
      this.querySelector(`[data-item="${CSS.escape(this.lastSelection)}"]`)?.focus({preventScroll:true});
    } else if (focusId) this.querySelector('#'+CSS.escape(focusId))?.focus({preventScroll:true});
    this.lastSelection = state.id;
    this.fitPreviews();
    if(selected) this.loadDetail(selected);
  }
  sourcePanel(source) {
    return `<section class="lib-source-panel"><div><h3>${escape(source.name)}</h3><span class="lib-badge">${COVERAGE[source.coverageState]}</span></div>
      <p>${escape(source.note)}</p><p class="lib-meta">${escape(source.method)} · ${number(source.discoveredCount)}개 · 분류 주소 ${source.categories.length}개${source.familyCount ? ` · 파일명 계열 ${source.familyCount}개` : ''}</p>
      <details><summary>후속 확인 ${source.nextActions.length}건 · 출처 정보</summary><ul>${source.nextActions.map(task=>`<li>${escape(task.reason)} ${link(task.url,'확인 위치')}</li>`).join('')}</ul>
      ${link(source.url,'공식 출처')} ${source.licenseUrl?link(source.licenseUrl,'이용 조건'):''}${source.revision?`<p class="lib-meta">원본 판 <code>${escape(source.revision)}</code></p>`:''}</details></section>`;
  }
  card(item, source, state) {
    const type = TYPE_OF[item.artifactKind];
    return `<article class="lib-card"><div class="lib-card-top"><span>${TYPES[type]}</span><span>${ACQUISITION[item.acquisitionStatus]}</span></div>
      <h3><a data-item="${item.id}" href="${escape(libraryRoute({...state,id:item.id}))}">${escape(item.title)}</a></h3>
      <p class="lib-card-category">${escape(item.categories.join(' · ') || '분류 확인 예정')}${item.variant ? ' · '+escape(item.variant) : ''}</p>
      <a class="lib-card-preview" aria-label="${escape(item.title)} 미리보기와 상세" href="${escape(libraryRoute({...state,id:item.id}))}">${this.preview(item)}</a><footer><span>${escape(source.name)}</span><span>${rightsLabel(item)}</span></footer></article>`;
  }
  preview(item,large=false) {
    const p=item.preview;
    if(!p) return `<div class="lib-preview-missing ${large?'lib-detail-preview':''}">${escape(item.previewReason||'원본에서 확인')}</div>`;
    if(p.kind==='text') return `<div class="lib-visual lib-prompt-preview"><pre>${escape(p.text)}</pre><span class="lib-preview-label">${escape(p.label)}</span></div>`;
    if(p.kind==='local_frame') return `<div class="lib-visual lib-frame-preview ${large?'lib-large-preview':''}" data-loading="true" data-preview-width="${p.width}" data-preview-height="${p.height}"><iframe src="${escape(p.url)}" title="${escape(item.title)} ${escape(p.label)}" sandbox="" loading="lazy" tabindex="-1" width="${p.width}" height="${p.height}" referrerpolicy="no-referrer"></iframe><span class="lib-preview-label">${escape(p.label)} · ${p.width}px</span></div>`;
    return `<div data-loading="true" class="lib-visual ${item.artifactKind==='icon'?'lib-icon-preview':''} ${large?'lib-large-preview':''}"><img src="${escape(large?p.url:p.thumbnailUrl||p.url)}" alt="${escape(item.title)} 미리보기" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="lib-preview-label">${escape(p.label)}</span></div>`;
  }
  fitPreviews() {
    this.resizeObserver?.disconnect();
    this.resizeObserver=new ResizeObserver(entries=>{for(const entry of entries){const box=entry.target;const scale=entry.contentRect.width/Number(box.dataset.previewWidth);box.style.setProperty('--preview-scale',scale);if(box.classList.contains('lib-large-preview'))box.style.height=Math.min(520,Number(box.dataset.previewHeight)*scale)+'px';}});
    this.querySelectorAll('[data-preview-width]').forEach(box=>this.resizeObserver.observe(box));
  }
  async loadDetail(item,retry=false) {
    if(!item)return;
    let promise=this.details.get(item.id);
    if(!promise||retry){promise=fetch(item.detailPath).then(r=>{if(!r.ok)throw new Error('상세 요청 실패');return r.json();}).then(data=>validateDetail(data,item.id));this.details.set(item.id,promise);}
    try{const data=await promise;if(this.state.id!==item.id)return;const panel=this.querySelector('[data-material-panel]');if(panel){panel.innerHTML=this.materialSection(data);this.currentDetail=data;}}
    catch{if(this.state.id===item.id){const panel=this.querySelector('[data-material-panel]');if(panel)panel.innerHTML='<p role="alert">상세 자료를 불러오지 못했습니다.</p><button data-detail-retry>상세 다시 시도</button>';}}
  }
  materialSection(data) {
    const list=values=>values.map(v=>`<li>${escape(v)}</li>`).join('');
    return `<h3>확보한 자료</h3>${data.materials.length?`<ul class="lib-material-files">${data.materials.map(m=>`<li><a href="${escape(m.path)}" target="_blank" rel="noopener">${escape(m.label)} ↗</a><small>${number(m.bytes)} bytes · SHA-256 ${m.sha256.slice(0,12)}</small></li>`).join('')}</ul>`:''}
      ${data.prompt?`<p>${escape(data.prompt.purpose)} · v${escape(data.prompt.version)} · 실행 전</p><dl><div><dt>입력 변수</dt><dd>${data.prompt.inputs.map(escape).join(', ')}</dd></div><div><dt>출력</dt><dd>${escape(data.prompt.output)}</dd></div></dl><pre class="lib-code">${escape(data.prompt.body)}</pre><button data-copy="prompt">프롬프트 복사</button>`:''}
      ${data.installation?`<details><summary>설치·의존성·props</summary><pre class="lib-code">${escape(data.installation)}</pre><button data-copy="installation">설치 명령 복사</button><p>npm: ${escape(data.dependencies.join(', ')||'명시 없음')}</p><p>registry: ${escape(data.registryDependencies.join(', ')||'명시 없음')}</p><p>${escape(data.usageNote)}</p>${data.propsDeclarations.length?`<p>소스에서 추출한 타입 선언 · 전체 타입은 원문을 확인하세요.</p><pre class="lib-code">${escape(data.propsDeclarations.join('\n\n'))}</pre>`:''}<button data-show-code>원본 코드 보기</button><pre class="lib-code" data-source-code hidden></pre></details>`:''}
      ${data.example?`<details><summary>렌더링 예제 입력</summary><p>원본 기본값과 아래 데모 입력을 사용합니다. 실제 사용자 경력 데이터와 구분합니다.</p><pre class="lib-code">${escape(JSON.stringify(data.example.props||{},null,2))}</pre><p>표시 검사: ${escape(data.renderCheck?.status||'미확인')} · 실제 콘텐츠 품질 검사: 미수행</p></details>`:''}
      <details><summary>관찰 근거와 검토 범위</summary><ul>${list(data.observations)}</ul><p>${data.prompt?'모델 실행과 결과 평가는 아직 수행하지 않았습니다.':'역할 분류는 이름·원본 분류에 따른 후보 판정입니다. 반응형·상호작용·실제 경력 콘텐츠의 품질 검증은 후속 단계입니다.'}</p>${data.previewRights?`<p>${escape(data.previewRights)}</p>`:''}${data.evidence?`<p>응답 SHA-256 <code>${escape(data.evidence.sha256)}</code></p>`:''}</details><output class="lib-action-status" role="status"></output>`;
  }
  async copyMaterial(button) {
    const data=this.currentDetail;const value=button.dataset.copy==='prompt'?data?.prompt?.body:data?.installation;
    if(!value)return;const status=this.querySelector('.lib-action-status');
    try{await navigator.clipboard.writeText(value);if(status)status.textContent='복사했습니다.';}catch{if(status)status.textContent='자동 복사에 실패했습니다. 위 텍스트를 선택해 복사하세요.';}
  }
  async showCode(button) {
    const data=this.currentDetail;const material=data?.materials.find(m=>m.kind==='registry_source');if(!material)return;
    const target=this.querySelector('[data-source-code]');target.hidden=false;target.textContent='원본 코드를 불러오는 중입니다.';
    try{const response=await fetch(material.path);if(!response.ok)throw new Error();const registry=await response.json();target.textContent=registry.files.map(f=>'// '+f.path+'\n'+(f.content||'')).join('\n\n');button.disabled=true;}catch{target.textContent='원본 코드를 불러오지 못했습니다. 파일 링크에서 다시 확인하세요.';}
  }
  openLive(button) {
    const frame=this.querySelector('.lib-detail iframe');if(!frame)return;
    frame.setAttribute('sandbox','allow-scripts');frame.src=button.dataset.live;frame.style.pointerEvents='auto';frame.tabIndex=0;button.disabled=true;button.textContent='실행 예제 표시 중';
  }

  detail(item, source, state) {
    if (!item) return `<dialog class="lib-detail" aria-labelledby="lib-detail-title"><button data-close aria-label="상세 닫기">닫기</button><h2 id="lib-detail-title">항목을 찾을 수 없습니다</h2><p>목록이 갱신되었거나 잘못된 공유 주소입니다.</p></dialog>`;
    const related = this.data.relations.filter(r=>r.itemIds.includes(item.id)).flatMap(r=>r.itemIds).filter(id=>id!==item.id);
    return `<dialog class="lib-detail" aria-labelledby="lib-detail-title"><header><span>${TYPES[TYPE_OF[item.artifactKind]]} / ${escape(source.name)}</span><button data-close aria-label="상세 닫기">닫기 ×</button></header>
      <h2 id="lib-detail-title">${escape(item.title)}</h2><p class="lib-meta">${({listing:'공개 목록의 이름',detail_page:'원본 상세 페이지의 이름',authored:'익스프레소 자체 작성',filename:'원본 파일명',identifier:'식별자에서 표시 이름 생성'})[item.titleSource]||'원본 항목 이름'}</p>
      ${this.preview(item,true)}${item.preview?.liveUrl ? `<button data-live="${escape(item.preview.liveUrl)}">실행 예제 보기</button>` : ''}
      <dl><div><dt>수집</dt><dd>${ACQUISITION[item.acquisitionStatus]}</dd></div><div><dt>품질 / 제품 연결</dt><dd>미검토 / 미등록</dd></div>
        <div><dt>이용 조건</dt><dd>${rightsLabel(item)}${source.licenseUrl?' · '+link(source.licenseUrl,'확인'):''}</dd></div>
        <div><dt>분류 / 변형</dt><dd>${escape(item.categories.join(' · '))}${item.variant?' / '+escape(item.variant):''}</dd></div>
        <div><dt>공급자 식별자</dt><dd><code>${escape(item.sourceItemId)}</code></dd></div>
        ${item.familyId?`<div><dt>변형 계열</dt><dd><code>${escape(item.familyId)}</code></dd></div>`:''}
        <div><dt>원본 판</dt><dd><code>${escape(item.sourceRevision || '목록 응답 해시: 실행 기록 참조')}</code></dd></div>
        <div><dt>발견일</dt><dd>${escape(source.fetchedAt)}</dd></div></dl>
      <p class="lib-role-evidence">${escape(item.roleEvidence)} <span>분류 근거: ${item.roleMethod==='authored'?'자체 작성 목적':'식별자·원본 분류'}</span></p><section data-material-panel aria-label="확보한 자료"><p role="status">항목 자료를 불러오는 중입니다.</p></section><p>${escape(source.note)}</p><div class="lib-detail-links">${link(item.canonicalUrl,item.sourceSite==='bento'?'목록에서 확인':'공급자에서 확인')}${item.originalUrl?link(item.originalUrl,'원본 사이트'):''}</div>
      <details><summary>발견 위치 ${item.discoveredFrom.length}곳${related.length ? ` · 같은 원본 URL을 참조한 항목 ${related.length}개` : ''}</summary><ul>${item.discoveredFrom.map(u=>`<li>${link(u,u)}</li>`).join('')}</ul>${item.sourceUrls.length > 1 ? `<p>같은 식별자로 발견한 출처 주소</p><ul>${item.sourceUrls.map(u=>`<li>${link(u,u)}</li>`).join('')}</ul>` : ''}
      ${related.length?`<p>원본 URL이 같아도 서로 다른 화면·컴포넌트일 수 있습니다.</p><ul>${[...new Set(related)].map(id=>{const i=this.data.items.find(v=>v.id===id);return `<li><a href="${escape(libraryRoute({...state,type:TYPE_OF[i.artifactKind],id}))}">${escape(i.title)} · ${escape(i.sourceSite)}</a></li>`;}).join('')}</ul>`:''}</details>
    </dialog>`;
  }
}
customElements.define('expresso-library', ExpressoLibrary);
