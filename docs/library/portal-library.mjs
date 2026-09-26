import { TYPES, itemType, typeLabel, TYPE_DESCRIPTIONS, isLibraryHome, matchesType, RIGHTS, PAGE_SIZE, validateCatalog, parseLibraryRoute, libraryRoute, selectItems } from './catalog-core.mjs';

import {ACQUISITION, ROLES, applyAcquisitions, validateDetail} from './acquisition-core.mjs';
import {SELECTION, applyCuration} from './curation-core.mjs';
import {applyExamples} from './examples-core.mjs';
import {componentClassification} from './component-types.mjs';
import {collectionIcon} from './collection-icons.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rightsLabel = item => item.sourceSite==='expresso'?'자체 작성':RIGHTS[item.rightsStatus];
const number = value => value.toLocaleString('ko-KR');
const link = (url, label) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
let catalogPromise;
const readJSON = path => fetch(new URL(path,import.meta.url)).then(response=>{if(!response.ok)throw new Error(`자료 요청 실패 (HTTP ${response.status})`);return response.json();});
const getCatalog = () => catalogPromise ||= Promise.all([readJSON('./catalog.json'),readJSON('./acquisitions.json'),readJSON('./curation.json'),readJSON('./examples.json')])
  .then(([base,acquired,curation,examples])=>applyExamples(applyCuration(applyAcquisitions(validateCatalog(base),acquired),curation),examples)).catch(error=>{catalogPromise=null;throw error;});

class ExpressoLibrary extends HTMLElement {
  static observedAttributes = ['route'];
  connectedCallback() {
    // DC가 원본 템플릿을 읽기 전에 내용을 바꾸면 React가 예제 DOM까지 소유하게 됩니다.
    if (this.closest('x-dc')) return;
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
      if(button?.hasAttribute('data-play-video')) this.playVideo(button);
      if(button?.dataset.copy) this.copyMaterial(button);
      if(button?.hasAttribute('data-detail-retry')) this.loadDetail(this.data.items.find(i=>i.id===this.state.id),true);
      if(button?.hasAttribute('data-show-code')) this.showCode(button);
    };
    this.onchange = event => {
      if (event.target.name === 'page') this.navigate({page:Number(event.target.value), id:''});
      if (event.target.name === 'source') this.navigate({source:event.target.value, category:'', family:'', id:'', page:1});
      if (['role','availability','selection'].includes(event.target.name)) this.navigate({[event.target.name]:event.target.value,id:'',page:1});
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
    const home = isLibraryHome(this.getAttribute('route') || '#/library');
    const componentHub = state.type==='components' && !state.id;
    if(home || componentHub) { this.renderHome(componentHub ? state : null); return; }
    const results = selectItems(data, state);
    const sources = new Map(data.sources.map(source => [source.id, source]));
    const selectedSource = sources.get(state.source);
    const filtered = ['q','source','category','role','availability','selection','family'].some(key=>state[key]);
    const categories = [...new Set(data.items.filter(i => matchesType(i,state.type) && (!state.source || i.sourceSite === state.source)).flatMap(i => i.categories))].sort();
    const route = patch => escape(libraryRoute({...state, ...patch}));
    const selected = data.items.find(i => i.id === state.id);
    const changedSelection = this.lastSelection !== state.id;
    this.querySelector('dialog')?.close();
    this.innerHTML = `
      <header class="lib-heading">
        <div><p class="lib-eyebrow">PORTFOLIO LIBRARY <span>03 · 후보 선별·실행 예제</span></p>
          <h1>포트폴리오 라이브러리</h1><p>컴포넌트 후보와 디자인 자료의 출처를 한곳에서 확인합니다.</p></div>
        <a class="lib-report" href="./portfolio-library-examples.md">실행 예제 보고서 ↗</a>
      </header>
      <div class="lib-summary">
        <div><strong>${number(data.items.length)}</strong><span>발견 항목</span></div>
        <div><strong>${number(data.items.filter(i=>i.preview).length)}</strong><span>미리보기 연결</span></div>
        <div><strong>${number(data.items.filter(i=>i.acquisitionStatus==='source_ready').length)}</strong><span>소스·자산 확보</span></div>
        <p>원본 예제와 공식 참고 이미지를 함께 확인합니다.<br>제품 등록·실제 경력 콘텐츠 검증은 후속 단계입니다.</p>
      </div>
      <nav class="lib-breadcrumb" aria-label="라이브러리 탐색 경로"><a href="#/library">← 유형 선택</a><span aria-hidden="true">/</span><span aria-current="page">${typeLabel(state.type)}</span></nav>
      <div class="lib-layout">
        <aside class="lib-sidebar" aria-label="수집 출처">
          <div class="lib-side-title">원본 사이트 <span>${data.sources.length}</span></div>
          <a href="${route({source:'',category:'',family:'',id:'',page:1})}" ${!state.source ? 'aria-current="true"' : ''}><span>모든 사이트</span><small>${number(data.items.length)}</small></a>
          ${data.sources.map(source => `<a href="${route({source:source.id,category:'',family:'',id:'',page:1})}" ${state.source === source.id ? 'aria-current="true"' : ''}><span>${escape(source.name)}</span><small>${number(source.discoveredCount)}</small></a>`).join('')}
          <p class="lib-side-note">항목 수에는 스타일 변형과 공급자 목록이 포함됩니다. 실제 사용 가능한 컴포넌트 수는 검증 후 집계합니다.</p>
        </aside>
        <main class="lib-main">
          <div class="lib-controls">
            <form data-search role="search"><label class="lib-sr" for="lib-query">라이브러리 검색</label><input type="search" id="lib-query" name="q" value="${escape(state.q)}" placeholder="이름, 식별자, 출처 검색"><button type="submit">검색</button></form>
            <label class="lib-mobile-source">사이트<select name="source" id="lib-source" aria-label="사이트"><option value="">모든 사이트</option>${data.sources.map(s=>`<option value="${s.id}" ${s.id===state.source?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label>
            <label>분류<select name="category" id="lib-category" aria-label="분류"><option value="">모든 분류</option>${categories.map(c=>`<option value="${escape(c)}" ${c===state.category?'selected':''}>${escape(c)}</option>`).join('')}</select></label>
          </div>
          <div class="lib-extra-filters"><label>포트폴리오 역할<select name="role" aria-label="포트폴리오 역할"><option value="">모든 역할</option>${Object.entries(ROLES).map(([id,name])=>`<option value="${id}" ${state.role===id?'selected':''}>${name}</option>`).join('')}</select></label><label>확보 상태<select name="availability" aria-label="확보 상태">${[['','전체 자료'],['preview','미리보기 있음'],['example','실행 예제 있음'],['video','참고 영상 있음'],['source','소스·자산 확보'],['waiting','확인 대기']].map(([id,name])=>`<option value="${id}" ${state.availability===id?'selected':''}>${name}</option>`).join('')}</select></label><label>후보 선별<select name="selection" aria-label="후보 선별"><option value="">전체 항목</option>${Object.entries(SELECTION).map(([id,name])=>`<option value="${id}" ${state.selection===id?'selected':''}>${name}</option>`).join('')}</select></label><a href="${route({q:'',source:'',category:'',role:'',availability:'',selection:'',family:'',page:1,id:''})}">필터 초기화</a></div>
          ${state.family?`<p class="lib-meta">이름 계열: ${escape(state.family)} · 구조가 같은지는 검토 전입니다. <a href="${route({family:'',page:1})}">계열 필터 해제</a></p>`:''}
          ${TYPE_DESCRIPTIONS[state.type]?`<p class="lib-meta">${TYPE_DESCRIPTIONS[state.type]}</p>`:''}
          <div class="lib-result-heading"><h2>${selectedSource ? escape(selectedSource.name) : typeLabel(state.type)} <span>${number(results.total)}개</span></h2>
            <span>기초 수집 ${escape(data.generatedAt.slice(0,10))} · 선별 ${escape(data.curation.reviewedAt)}</span></div>
          ${results.total ? `<div class="lib-grid">${results.items.map(item=>this.card(item,sources.get(item.sourceSite),state)).join('')}</div>`
            : `<div class="lib-message"><h3>${filtered ? '검색 조건에 맞는 항목이 없습니다' : '아직 목록에 등록된 자료가 없습니다'}</h3><p>${selectedSource ? escape(selectedSource.note) : state.type === 'pages' ? '검증된 컴포넌트를 조합한 페이지 구성은 후속 단계에서 추가합니다.' : '유형·사이트·검색 조건을 바꾸어 확인해 보세요.'}</p><a href="${route({q:'',source:'',category:'',role:'',availability:'',selection:'',family:'',page:1,id:''})}">이 유형의 전체 목록 보기</a></div>`}
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
    this.finishNavigation('list:'+state.type);
  }
  renderHome(componentState=null) {
    this.querySelector('dialog')?.close();this.resizeObserver?.disconnect();
    this.lastSelection='';this.currentDetail=null;
    const state=componentState || parseLibraryRoute('#/library');
    const primary=['sections','content-elements','basic-ui','page-examples'];
    const secondary=['templates','design-references','prompts','motion','icons','diagrams','tools','registries'];
    if(this.data.items.some(i=>itemType(i)==='pages'))secondary.push('pages');
    this.innerHTML=`<header class="lib-heading"><div><p class="lib-eyebrow">PORTFOLIO LIBRARY</p><h1>${componentState?'컴포넌트 둘러보기':'포트폴리오 라이브러리'}</h1><p>필요한 자료의 카드를 선택해 목록과 실행 예제를 살펴보세요.</p></div><a class="lib-report" href="./portfolio-library-examples.md">실행 예제 보고서 ↗</a></header>
      ${componentState?'<nav class="lib-breadcrumb" aria-label="라이브러리 탐색 경로"><a href="#/library">← 모든 유형 보기</a><span aria-hidden="true">/</span><span aria-current="page">컴포넌트</span></nav>':''}
      <main class="lib-home"><section aria-labelledby="lib-assembly-title"><div class="lib-home-title"><div><h2 id="lib-assembly-title">페이지 조립</h2><p>큰 구역부터 세부 요소까지, 필요한 조립 단위로 찾습니다.</p></div>${componentState?'':`<a href="#/library/all">전체 ${number(this.data.items.length)}개 검색 →</a>`}</div>
      ${componentState && ['q','source','category','role','availability','selection','family'].some(key=>state[key])?'<p class="lib-home-filter">기존 검색·필터가 카드별 결과에 적용되어 있습니다. <a href="#/library/components">필터 해제</a></p>':''}
      <div class="lib-collection-grid">${primary.map(type=>this.collectionCard(type,state)).join('')}</div></section>
      ${componentState?'':`<section aria-labelledby="lib-materials-title"><div class="lib-home-title"><div><h2 id="lib-materials-title">디자인과 제작 자료</h2><p>콘텐츠 구성, 시각 참고, 제작 도구를 용도별로 살펴봅니다.</p></div></div><div class="lib-collection-grid lib-collection-secondary">${secondary.map(type=>this.collectionCard(type,state)).join('')}</div></section>`}</main>`;
    this.finishNavigation(componentState?'component-hub':'home');
  }
  finishNavigation(view) {
    if(this.lastView && this.lastView!==view) {
      const heading=this.querySelector('h1');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
      this.scrollIntoView({block:'start',behavior:'instant'});
    }
    this.lastView=view;
  }
  collectionCard(type,state) {
    const items=this.data.items.filter(i=>itemType(i)===type);
    const filtered=selectItems(this.data,{...state,type,page:1,id:''});
    const href=libraryRoute({...state,type,page:1,id:''});
    return `<a class="lib-collection-card" href="${escape(href)}" aria-label="${TYPES[type]} 목록 보기">
      <header><div class="lib-collection-name"><span class="lib-collection-icon">${collectionIcon(type)}</span><h3>${TYPES[type]}</h3></div><span>${number(filtered.total)}개</span></header><p>${TYPE_DESCRIPTIONS[type]}</p><footer><span>${filtered.total!==items.length?`전체 ${number(items.length)}개 · 필터 적용`: items.some(i=>i.preview?.liveUrl)?`실행 예제 ${number(items.filter(i=>i.preview?.liveUrl).length)}개`:`미리보기 ${number(items.filter(i=>i.preview).length)}개`}</span><span class="lib-collection-action" aria-hidden="true">목록 보기 <span class="lib-collection-arrow">${collectionIcon('arrow')}</span></span></footer></a>`;
  }
  card(item, source, state) {
    const type = itemType(item);
    return `<article class="lib-card"><div class="lib-card-top"><span>${TYPES[type]}</span><span>${ACQUISITION[item.acquisitionStatus]}</span></div>
      <h3><a data-item="${item.id}" href="${escape(libraryRoute({...state,id:item.id}))}">${escape(item.title)}</a></h3>
      <p class="lib-card-category">${item.selection!=='pending'?SELECTION[item.selection]+' · ':''}${escape(item.categories.join(' · ') || '분류 확인 예정')}${item.variant ? ' · '+escape(item.variant) : ''}</p>
      <a class="lib-card-preview" aria-label="${escape(item.title)} 미리보기와 상세" href="${escape(libraryRoute({...state,id:item.id}))}">${this.preview(item)}</a><footer><span>${escape(source.name)}</span><span>${rightsLabel(item)}</span></footer></article>`;
  }
  preview(item,large=false) {
    const p=item.preview;
    if(!p) return `<div class="lib-preview-missing ${large?'lib-detail-preview':''}">${escape(item.previewReason||'원본에서 확인')}</div>`;
    if(p.kind==='remote_video' && large) return `<div class="lib-visual lib-large-preview lib-video-preview"><video controls playsinline preload="none" poster="${escape(p.poster)}" src="${escape(p.url)}" aria-label="${escape(item.title)} 참고 영상"></video><span class="lib-preview-label">${escape(p.label)}</span></div>`;
    if(p.kind==='text') return `<div class="lib-visual lib-prompt-preview"><pre>${escape(p.text)}</pre><span class="lib-preview-label">${escape(p.label)}</span></div>`;
    if(p.kind==='local_frame') return `<div class="lib-visual lib-frame-preview ${large?'lib-large-preview':''}" data-loading="true" data-preview-width="${p.width}" data-preview-height="${p.height}"><iframe src="${escape(p.url)}" title="${escape(item.title)} ${escape(p.label)}" sandbox="" loading="lazy" tabindex="-1" width="${p.width}" height="${p.height}" referrerpolicy="no-referrer"></iframe><span class="lib-preview-label">${escape(p.label)} · ${p.width}px</span></div>`;
    return `<div data-loading="true" class="lib-visual ${item.artifactKind==='icon'?'lib-icon-preview':''} ${large?'lib-large-preview':''}"><img src="${escape(large?(p.poster||p.url):p.thumbnailUrl||p.poster||p.url)}" alt="${escape(item.title)} 미리보기" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="lib-preview-label">${escape(p.label)}</span></div>`;
  }
  fitPreviews() {
    this.resizeObserver?.disconnect();
    this.resizeObserver=new ResizeObserver(entries=>{for(const entry of entries){const box=entry.target;const scale=entry.contentRect.width/Number(box.dataset.previewWidth);box.style.setProperty('--preview-scale',scale);if(box.classList.contains('lib-large-preview'))box.style.height=Math.min(520,Number(box.dataset.previewHeight)*scale)+'px';}});
    this.querySelectorAll('[data-preview-width]').forEach(box=>this.resizeObserver.observe(box));
  }
  async loadDetail(item,retry=false) {
    if(!item)return;
    let promise=this.details.get(item.id);
    if(!promise||retry){promise=fetch(item.detailPath).then(r=>{if(!r.ok)throw new Error('상세 요청 실패');return r.json();}).then(data=>validateDetail({...data,...(item.execution||{})},item.id));this.details.set(item.id,promise);}
    try{const data=await promise;if(this.state.id!==item.id)return;const panel=this.querySelector('[data-material-panel]');if(panel){panel.innerHTML=this.materialSection(data);this.currentDetail=data;}}
    catch{if(this.state.id===item.id){const panel=this.querySelector('[data-material-panel]');if(panel)panel.innerHTML='<p role="alert">상세 자료를 불러오지 못했습니다.</p><button data-detail-retry>상세 다시 시도</button>';}}
  }
  materialSection(data) {
    const list=values=>values.map(v=>`<li>${escape(v)}</li>`).join('');
    return `<h3>확보한 자료</h3>${data.framework?`<p>구현 환경: ${escape(data.framework)}</p>`:''}${data.materials.length?`<ul class="lib-material-files">${data.materials.map(m=>`<li><a href="${escape(m.path)}" target="_blank" rel="noopener">${escape(m.label)} ↗</a><small>${number(m.bytes)} bytes · SHA-256 ${m.sha256.slice(0,12)}</small></li>`).join('')}</ul>`:''}
      ${data.prompt?`<p>${escape(data.prompt.purpose)} · v${escape(data.prompt.version)} · 실행 전</p><dl><div><dt>입력 변수</dt><dd>${data.prompt.inputs.map(escape).join(', ')}</dd></div><div><dt>출력</dt><dd>${escape(data.prompt.output)}</dd></div></dl><pre class="lib-code">${escape(data.prompt.body)}</pre><button data-copy="prompt">프롬프트 복사</button>`:''}
      ${data.installation?`<details><summary>설치·의존성·props</summary><pre class="lib-code">${escape(data.installation)}</pre><button data-copy="installation">설치 명령 복사</button><p>npm: ${escape(data.dependencies.join(', ')||'명시 없음')}</p><p>registry: ${escape(data.registryDependencies.join(', ')||'명시 없음')}</p><p>${escape(data.usageNote)}</p>${data.propsDeclarations.length?`<p>소스에서 추출한 타입 선언 · 전체 타입은 원문을 확인하세요.</p><pre class="lib-code">${escape(data.propsDeclarations.join('\n\n'))}</pre>`:''}<button data-show-code>원본 코드 보기</button><pre class="lib-code" data-source-code hidden></pre></details>`:''}
      ${!data.installation && data.materials.some(m=>m.kind==='registry_source')?'<button data-show-code>원본 코드 보기</button><pre class="lib-code" data-source-code hidden></pre>':''}
      ${data.example?`<details><summary>렌더링 예제 입력</summary>${data.example.notes?.length?`<ul>${data.example.notes.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:''}${data.example.inputCode?`<pre class="lib-code">${escape(data.example.inputCode)}</pre>`:''}<p>원본 기본값과 아래 데모 입력을 사용합니다. 실제 사용자 경력 데이터와 구분합니다.</p><pre class="lib-code">${escape(JSON.stringify(data.example.props||{},null,2))}</pre><p>표시 검사: ${escape(data.renderCheck?.status||'미확인')} · 실제 콘텐츠 품질 검사: 미수행</p></details>`:''}
      <details><summary>관찰 근거와 검토 범위</summary><ul>${list(data.observations)}</ul><p>${data.prompt?'모델 실행과 결과 평가는 아직 수행하지 않았습니다.':'역할 분류 근거와 선별 결과는 위 후보 검토를 확인하세요. 반응형·상호작용·실제 경력 콘텐츠의 품질 검증은 후속 단계입니다.'}</p>${data.previewRights?`<p>${escape(data.previewRights)}</p>`:''}${data.evidence?`<p>응답 SHA-256 <code>${escape(data.evidence.sha256)}</code></p>`:''}</details><output class="lib-action-status" role="status"></output>`;
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
    const box=frame.closest('.lib-visual');this.resizeObserver?.unobserve(box);
    box.style.height='min(520px,60vh)';
    frame.style.width='100%';frame.style.height='100%';frame.style.transform='none';
    box.querySelector('.lib-preview-label').textContent='실행 중 · 화면 폭에 맞춤';
    frame.setAttribute('sandbox','allow-scripts');frame.src=button.dataset.live;frame.style.pointerEvents='auto';frame.tabIndex=0;button.disabled=true;button.textContent='실행 예제 표시 중';
  }
  async playVideo(button) {
    const video=this.querySelector('.lib-detail video');if(!video)return;
    if(!video.paused){video.pause();button.textContent='참고 영상 재생';return;}
    video.onpause=video.onended=()=>{button.textContent='참고 영상 재생';};
    video.onplay=()=>{button.textContent='영상 일시 정지';};
    this.querySelector('[data-video-status]').textContent='';
    try{await video.play();}
    catch{button.textContent='다시 재생';this.querySelector('[data-video-status]').textContent='영상을 재생하지 못했습니다. 원본 영상 링크에서 확인하세요.';}
  }

  detail(item, source, state) {
    if (!item) return `<dialog class="lib-detail" aria-labelledby="lib-detail-title"><button data-close aria-label="상세 닫기">닫기</button><h2 id="lib-detail-title">항목을 찾을 수 없습니다</h2><p>목록이 갱신되었거나 잘못된 공유 주소입니다.</p></dialog>`;
    const routeFamily = family => escape(libraryRoute({type:'all',family,page:1}));
    const duplicates = this.data.curation.duplicates.filter(g=>g.itemIds.includes(item.id)).flatMap(g=>g.itemIds).filter(id=>id!==item.id);
    const related = this.data.relations.filter(r=>r.itemIds.includes(item.id)).flatMap(r=>r.itemIds).filter(id=>id!==item.id);
    return `<dialog class="lib-detail" aria-labelledby="lib-detail-title"><header><span>${TYPES[itemType(item)]} / ${escape(source.name)}</span><button data-close aria-label="상세 닫기">닫기 ×</button></header>
      <h2 id="lib-detail-title">${escape(item.title)}</h2><p class="lib-meta">${({listing:'공개 목록의 이름',detail_page:'원본 상세 페이지의 이름',authored:'익스프레소 자체 작성',curated:'검토한 용도에 따른 이름',filename:'원본 파일명',identifier:'식별자에서 표시 이름 생성'})[item.titleSource]||'원본 항목 이름'}</p>
      ${this.preview(item,true)}${item.preview?.liveUrl ? `<div class="lib-detail-links"><button data-live="${escape(item.preview.liveUrl)}">실행 예제 보기</button><a href="${escape(item.preview.liveUrl)}" target="_blank" rel="noopener">새 탭에서 크게 보기 ↗</a></div>` : ''}
      ${item.preview?.kind==='remote_video'?`<div class="lib-detail-links"><button data-play-video>참고 영상 재생</button>${link(item.preview.url,'원본 영상 열기')}</div><p data-video-status role="status"></p>`:''}
      ${item.artifactKind==='component'?`<p class="lib-meta">탐색 분류: ${escape(componentClassification(item).evidence)}${componentClassification(item).provisional?' · 원본 미확보, 임시 분류':''}</p>`:''}
      <dl><div><dt>수집</dt><dd>${ACQUISITION[item.acquisitionStatus]}</dd></div><div><dt>품질 / 제품 연결</dt><dd>미검토 / 미등록</dd></div>
        <div><dt>이용 조건</dt><dd>${rightsLabel(item)}${source.licenseUrl?' · '+link(source.licenseUrl,'확인'):''}</dd></div>
        <div><dt>분류 / 변형</dt><dd>${escape(item.categories.join(' · '))}${item.variant?' / '+escape(item.variant):''}</dd></div>
        <div><dt>공급자 식별자</dt><dd><code>${escape(item.sourceItemId)}</code></dd></div>
        ${item.familyId?`<div><dt>이름 계열</dt><dd><a href="${routeFamily(item.familyId)}">${escape(item.familyId)}</a> · 구조 동일성 미검토</dd></div>`:''}
        <div><dt>원본 판</dt><dd><code>${escape(item.sourceRevision || '목록 응답 해시: 실행 기록 참조')}</code></dd></div>
        <div><dt>발견일</dt><dd>${escape(source.fetchedAt)}</dd></div></dl>
      <section class="lib-source-panel" aria-label="후보 검토"><h3>${SELECTION[item.selection]}</h3><p>${ROLES[item.roles[0]]||'역할 확인 필요'} · 제품 등록 전</p>${item.curation.inputs.length?`<p>입력 후보: ${item.curation.inputs.map(escape).join(', ')}</p>`:''}<ul>${item.curation.constraints.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>${duplicates.length?`<p>원본 코드 본문이 같은 항목 · 의존성 및 실행 동등성 미검증</p><ul>${duplicates.map(id=>{const other=this.data.items.find(i=>i.id===id);return `<li><a href="${escape(libraryRoute({...state,id}))}">${escape(other.title)}</a></li>`;}).join('')}</ul>`:''}</section>
      <p class="lib-role-evidence">${escape(item.roleEvidence)} <span>분류 근거: ${item.roleMethod==='source_review'?'원본 코드 검토':item.roleMethod==='authored'?'자체 작성 목적':'식별자·원본 분류 규칙 (미검토)'}</span></p><section data-material-panel aria-label="확보한 자료"><p role="status">항목 자료를 불러오는 중입니다.</p></section><p>${escape(source.note)}</p><div class="lib-detail-links">${link(item.canonicalUrl,item.sourceSite==='bento'?'목록에서 확인':'공급자에서 확인')}${item.originalUrl?link(item.originalUrl,'원본 사이트'):''}</div>
      <details><summary>발견 위치 ${item.discoveredFrom.length}곳${related.length ? ` · 같은 원본 URL을 참조한 항목 ${related.length}개` : ''}</summary><ul>${item.discoveredFrom.map(u=>`<li>${link(u,u)}</li>`).join('')}</ul>${item.sourceUrls.length > 1 ? `<p>같은 식별자로 발견한 출처 주소</p><ul>${item.sourceUrls.map(u=>`<li>${link(u,u)}</li>`).join('')}</ul>` : ''}
      ${related.length?`<p>원본 URL이 같아도 서로 다른 화면·컴포넌트일 수 있습니다.</p><ul>${[...new Set(related)].map(id=>{const i=this.data.items.find(v=>v.id===id);return `<li><a href="${escape(libraryRoute({...state,type:itemType(i),id}))}">${escape(i.title)} · ${escape(i.sourceSite)}</a></li>`;}).join('')}</ul>`:''}</details>
    </dialog>`;
  }
}
customElements.define('expresso-library', ExpressoLibrary);
