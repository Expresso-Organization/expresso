import { TYPES, TYPE_OF, RIGHTS, COVERAGE, PAGE_SIZE, validateCatalog, parseLibraryRoute, libraryRoute, selectItems } from './catalog-core.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => value.toLocaleString('ko-KR');
const link = (url, label) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
let catalogPromise;
const getCatalog = () => catalogPromise ||= fetch(new URL('./catalog.json', import.meta.url))
  .then(response => { if (!response.ok) throw new Error(`목록 요청 실패 (HTTP ${response.status})`); return response.json(); })
  .then(validateCatalog).catch(error => { catalogPromise = null; throw error; });

class ExpressoLibrary extends HTMLElement {
  static observedAttributes = ['route'];
  connectedCallback() {
    this.classList.add('ex-library');
    this.setAttribute('data-theme', 'light');
    this.onclick = event => {
      if (event.target.closest('[data-retry]')) this.load();
      if (event.target.closest('[data-close]')) this.navigate({id: ''});
    };
    this.onchange = event => {
      if (event.target.name === 'source') this.navigate({source:event.target.value, category:'', id:'', page:1});
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
        <div><p class="lib-eyebrow">PORTFOLIO LIBRARY <span>01 · 목록 탐색</span></p>
          <h1>포트폴리오 라이브러리</h1><p>컴포넌트 후보와 디자인 자료의 출처를 한곳에서 확인합니다.</p></div>
        <a class="lib-report" href="./portfolio-component-collection-stage-1.md">수집 결과 문서 ↗</a>
      </header>
      <div class="lib-summary">
        <div><strong>${number(data.items.length)}</strong><span>발견 항목</span></div>
        <div><strong>${data.sources.length}</strong><span>조사 사이트</span></div>
        <div><strong>0</strong><span>코드 확보 · 제품 등록</span></div>
        <p>현재는 공개 목록을 정리한 단계입니다.<br>미리보기와 코드·프롬프트 원문은 상세 수집에서 연결합니다.</p>
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
          ${selectedSource ? this.sourcePanel(selectedSource) : `<details class="lib-coverage"><summary>사이트별 수집 범위와 미처리 내역</summary><div class="lib-source-grid">${data.sources.map(s=>`<a href="${route({source:s.id,category:'',page:1,id:''})}"><strong>${escape(s.name)}</strong><span>${COVERAGE[s.coverageState]}</span><small>${number(s.discoveredCount)}개 · 후속 확인 ${s.nextActions.length}건</small></a>`).join('')}</div></details>`}
          <div class="lib-result-heading"><h2>${selectedSource ? escape(selectedSource.name) : TYPES[state.type]} <span>${number(results.total)}개</span></h2>
            <span>확인일 ${escape(data.generatedAt.slice(0,10))}</span></div>
          ${results.total ? `<div class="lib-grid">${results.items.map(item=>this.card(item,sources.get(item.sourceSite),state)).join('')}</div>`
            : `<div class="lib-message"><h3>${state.q || state.category ? '검색 조건에 맞는 항목이 없습니다' : '아직 목록에 등록된 자료가 없습니다'}</h3><p>${selectedSource ? escape(selectedSource.note) : state.type === 'pages' ? '검증된 컴포넌트를 조합한 페이지 구성은 후속 단계에서 추가합니다.' : '유형·사이트·검색 조건을 바꾸어 확인해 보세요.'}</p><a href="#/library">전체 목록 보기</a></div>`}
          <nav class="lib-pagination" aria-label="라이브러리 페이지"><span>${results.total ? number((results.page-1)*PAGE_SIZE+1) : 0}–${number(Math.min(results.page*PAGE_SIZE,results.total))} / ${number(results.total)}</span>
            <div>${results.page>1?`<a href="${route({page:results.page-1,id:''})}" rel="prev">← 이전</a>`:'<span aria-disabled="true">← 이전</span>'}<span>${results.page} / ${results.pages}</span>${results.page<results.pages?`<a href="${route({page:results.page+1,id:''})}" rel="next">다음 →</a>`:'<span aria-disabled="true">다음 →</span>'}</div></nav>
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
  }
  sourcePanel(source) {
    return `<section class="lib-source-panel"><div><h3>${escape(source.name)}</h3><span class="lib-badge">${COVERAGE[source.coverageState]}</span></div>
      <p>${escape(source.note)}</p><p class="lib-meta">${escape(source.method)} · ${number(source.discoveredCount)}개 · 분류 주소 ${source.categories.length}개${source.familyCount ? ` · 파일명 계열 ${source.familyCount}개` : ''}</p>
      <details><summary>후속 확인 ${source.nextActions.length}건 · 출처 정보</summary><ul>${source.nextActions.map(task=>`<li>${escape(task.reason)} ${link(task.url,'확인 위치')}</li>`).join('')}</ul>
      ${link(source.url,'공식 출처')} ${source.licenseUrl?link(source.licenseUrl,'이용 조건'):''}${source.revision?`<p class="lib-meta">원본 판 <code>${escape(source.revision)}</code></p>`:''}</details></section>`;
  }
  card(item, source, state) {
    const type = TYPE_OF[item.artifactKind];
    return `<article class="lib-card"><div class="lib-card-top"><span>${TYPES[type]}</span><span>목록 수집</span></div>
      <h3><a data-item="${item.id}" href="${escape(libraryRoute({...state,id:item.id}))}">${escape(item.title)}</a></h3>
      <p class="lib-card-category">${escape(item.categories.join(' · ') || '분류 확인 예정')}${item.variant ? ' · '+escape(item.variant) : ''}</p>
      <div class="lib-preview-missing">미리보기 미확보</div><footer><span>${escape(source.name)}</span><span>${RIGHTS[item.rightsStatus]}</span></footer></article>`;
  }
  detail(item, source, state) {
    if (!item) return `<dialog class="lib-detail" aria-labelledby="lib-detail-title"><button data-close aria-label="상세 닫기">닫기</button><h2 id="lib-detail-title">항목을 찾을 수 없습니다</h2><p>목록이 갱신되었거나 잘못된 공유 주소입니다.</p></dialog>`;
    const related = this.data.relations.filter(r=>r.itemIds.includes(item.id)).flatMap(r=>r.itemIds).filter(id=>id!==item.id);
    return `<dialog class="lib-detail" aria-labelledby="lib-detail-title"><header><span>${TYPES[TYPE_OF[item.artifactKind]]} / ${escape(source.name)}</span><button data-close aria-label="상세 닫기">닫기 ×</button></header>
      <h2 id="lib-detail-title">${escape(item.title)}</h2><p class="lib-meta">${item.titleSource === 'listing' ? '공개 목록의 이름' : '식별자·파일명에서 표시 이름 생성'}</p>
      <div class="lib-preview-missing lib-detail-preview">미리보기 미확보<span>원본을 확보하고 검증한 뒤 연결합니다.</span></div>
      <dl><div><dt>수집</dt><dd>목록 수집 · 상세 자료 미확보</dd></div><div><dt>품질 / 제품 연결</dt><dd>미검토 / 미등록</dd></div>
        <div><dt>이용 조건</dt><dd>${RIGHTS[item.rightsStatus]}${source.licenseUrl?' · '+link(source.licenseUrl,'확인'):''}</dd></div>
        <div><dt>분류 / 변형</dt><dd>${escape(item.categories.join(' · '))}${item.variant?' / '+escape(item.variant):''}</dd></div>
        <div><dt>공급자 식별자</dt><dd><code>${escape(item.sourceItemId)}</code></dd></div>
        ${item.familyId?`<div><dt>변형 계열</dt><dd><code>${escape(item.familyId)}</code></dd></div>`:''}
        <div><dt>원본 판</dt><dd><code>${escape(item.sourceRevision || '목록 응답 해시: 실행 기록 참조')}</code></dd></div>
        <div><dt>발견일</dt><dd>${escape(source.fetchedAt)}</dd></div></dl>
      <p>${escape(source.note)}</p><div class="lib-detail-links">${link(item.canonicalUrl,item.sourceSite==='bento'?'목록에서 확인':'공급자에서 확인')}${item.originalUrl?link(item.originalUrl,'원본 사이트'):''}</div>
      <details><summary>발견 위치 ${item.discoveredFrom.length}곳${related.length ? ` · 같은 원본 URL을 참조한 항목 ${related.length}개` : ''}</summary><ul>${item.discoveredFrom.map(u=>`<li>${link(u,u)}</li>`).join('')}</ul>${item.sourceUrls.length > 1 ? `<p>같은 식별자로 발견한 출처 주소</p><ul>${item.sourceUrls.map(u=>`<li>${link(u,u)}</li>`).join('')}</ul>` : ''}
      ${related.length?`<p>원본 URL이 같아도 서로 다른 화면·컴포넌트일 수 있습니다.</p><ul>${[...new Set(related)].map(id=>{const i=this.data.items.find(v=>v.id===id);return `<li><a href="${escape(libraryRoute({...state,type:TYPE_OF[i.artifactKind],id}))}">${escape(i.title)} · ${escape(i.sourceSite)}</a></li>`;}).join('')}</ul>`:''}</details>
    </dialog>`;
  }
}
customElements.define('expresso-library', ExpressoLibrary);
