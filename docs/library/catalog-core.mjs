import {componentClassification} from './component-types.mjs';
// 정적 포털 목록의 검증·검색·공유 주소를 한 곳에서 처리합니다.
export const TYPES = Object.freeze({
  all: '전체', sections: '섹션', 'content-elements': '콘텐츠 요소',
  'basic-ui': '기본 UI', 'page-examples': '페이지·앱 예제', prompts: '프롬프트',
  'design-references': '디자인 레퍼런스', templates: '콘텐츠 템플릿', tools: '개발 도구',
  motion: '모션', icons: '아이콘', diagrams: '다이어그램', pages: '페이지 구성', registries: '공급자',
});
export const TYPE_OF = Object.freeze({ component: 'components', prompt: 'prompts', reference: 'references',
  motion: 'motion', icon: 'icons', diagram: 'diagrams', page: 'pages', registry: 'registries' });
// 수집 당시 자료 종류는 보존하고, 포털에서는 자료의 용도로 나눕니다.
const REFERENCE_TYPES = Object.freeze({
  watermelon: 'tools', diagram: 'tools',
  'magic-portfolio': 'templates', 'al-folio-core': 'templates',
  'al-folio-cv': 'templates', 'al-folio-distill': 'templates',
});
export function itemType(item) {
  if(item.artifactKind === 'component') return componentClassification(item).type;
  return item.artifactKind === 'reference'
    ? REFERENCE_TYPES[item.sourceSite] || 'design-references'
    : TYPE_OF[item.artifactKind];
}
export const TYPE_DESCRIPTIONS = Object.freeze({
  sections: '히어로·프로젝트 목록·경력·연락처·푸터처럼 페이지의 큰 구역을 구성합니다.',
  'content-elements': '프로젝트 카드·타임라인·차트·미디어·위젯으로 섹션 안에 내용을 배치합니다.',
  'basic-ui': '버튼·입력창·메뉴·대화상자·탭 등 조작과 상태 표현에 쓰는 부품입니다.',
  'page-examples': '랜딩·대시보드·인증 화면 등 페이지 전체의 배치와 동작을 확인합니다.',
  components: '기존 컴포넌트 주소입니다. 유형 카드에서 섹션·콘텐츠 요소·기본 UI·페이지 및 앱 예제로 나누어 볼 수 있습니다.',
  all: '전체 자료를 검색합니다.',
  prompts: '생성·검토 작업에 사용할 프롬프트와 입력 변수를 확인합니다.',
  motion: '움직임과 화면 전환을 공식 참고 영상으로 살펴봅니다.',
  icons: '화면에 사용할 아이콘의 모양과 출처를 확인합니다.',
  diagrams: '구조·흐름·관계를 설명하는 다이어그램 예제를 살펴봅니다.',
  pages: '검증된 부품을 조합한 익스프레소 페이지 구성을 모읍니다.',
  registries: '컴포넌트 공급자와 공식 자료 위치를 찾습니다.',
  'design-references': '히어로·내비게이션·푸터·벤토 등 실제 사이트의 디자인과 배치를 참고합니다.',
  templates: '경력·학력·논문·프로젝트 상세에 어떤 내용을 어떤 순서로 배치할지 확인합니다.',
  tools: 'React 훅·유틸리티·다이어그램 문서 등 구현을 돕는 자료입니다.',
  references: '기존 참고 자료 주소입니다. 디자인 레퍼런스·콘텐츠 템플릿·개발 도구 탭에서 나누어 볼 수 있습니다.',
});
const validType = type => ['references','components'].includes(type) || Object.hasOwn(TYPES, type);
export const typeLabel = type => type === 'references' ? '이전 참고 자료' : type === 'components' ? '전체 컴포넌트' : TYPES[type];
export const RIGHTS = Object.freeze({allowed: '공개 라이선스', reference_only: '참고 전용',
  permission_needed: '이용 범위 확인 필요', unreviewed: '이용 조건 미검토', restricted: '이용 제한'});
export const COVERAGE = Object.freeze({snapshot_complete: '공개 목록 확인', partial: '일부 범위 확인',
  blocked: '접근 제한', permission_needed: '이용 범위 확인 대기'});
export const PAGE_SIZE = 36;
export function safeUrl(value) {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
export function validateCatalog(data) {
  const fail = () => { throw new Error('라이브러리 목록 형식을 확인할 수 없습니다.'); };
  if (data?.schemaVersion !== 1 || !Array.isArray(data.sources) || !Array.isArray(data.items)
    || !Array.isArray(data.relations) || typeof data.generatedAt !== 'string') fail();
  const sources = new Set();
  for (const source of data.sources) {
    if (typeof source.id !== 'string' || sources.has(source.id) || typeof source.name !== 'string'
      || !safeUrl(source.url) || !Object.hasOwn(COVERAGE, source.coverageState)
      || !Number.isSafeInteger(source.discoveredCount) || !Array.isArray(source.nextActions)
      || !Array.isArray(source.categories) || typeof source.note !== 'string'
      || !Object.hasOwn(RIGHTS, source.rightsStatus) || !Array.isArray(source.requestIds)
      || (source.licenseUrl && !safeUrl(source.licenseUrl))) fail();
    for (const task of source.nextActions) if (!safeUrl(task.url) || typeof task.reason !== 'string') fail();
    sources.add(source.id);
  }
  const ids = new Set();
  const counts = {};
  for (const item of data.items) {
    if (typeof item.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)
      || !sources.has(item.sourceSite) || typeof item.title !== 'string' || !item.title.trim()
      || typeof item.sourceItemId !== 'string' || !Object.hasOwn(TYPE_OF, item.artifactKind)
      || !Array.isArray(item.sourceUrls) || !item.sourceUrls.every(safeUrl) || !item.sourceUrls.includes(item.canonicalUrl)
      || !safeUrl(item.canonicalUrl) || (item.originalUrl && !safeUrl(item.originalUrl))
      || !Array.isArray(item.discoveredFrom) || !item.discoveredFrom.length || !item.discoveredFrom.every(safeUrl)
      || !Array.isArray(item.categories) || !item.categories.every(v => typeof v === 'string')
      || !Object.hasOwn(RIGHTS, item.rightsStatus) || item.collectionStatus !== 'discovered'
      || item.reviewStatus !== 'unreviewed' || item.integrationStatus !== 'not_started' || item.preview !== null) fail();
    ids.add(item.id);
    counts[item.sourceSite] = (counts[item.sourceSite] || 0) + 1;
  }
  for (const source of data.sources) if (source.discoveredCount !== (counts[source.id] || 0)) fail();
  for (const relation of data.relations) {
    if (relation.type !== 'same_original_url' || !safeUrl(relation.url)
      || !Array.isArray(relation.itemIds) || relation.itemIds.some(id => !ids.has(id))) fail();
  }
  return data;
}
export function parseLibraryRoute(hash) {
  const [path, query = ''] = String(hash).split('?');
  const parts = path.replace(/^#\/?/, '').split('/');
  const params = new URLSearchParams(query);
  const decode = value => { try { return decodeURIComponent(value || ''); } catch { return ''; } };
  const page = Number(params.get('page'));
  return {
    type: validType(parts[1]) ? parts[1] : 'all',
    id: decode(parts[2]), source: params.get('source') || '', q: params.get('q') || '',
    category: params.get('category') || '', ...Object.fromEntries(['role','availability','selection','family'].filter(k=>params.get(k)).map(k=>[k,params.get(k)])), page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function libraryRoute(state) {
  const type = validType(state.type) ? state.type : 'all';
  let path = '#/library/' + type + (state.id ? '/' + encodeURIComponent(state.id) : '');
  const params = new URLSearchParams();
  for (const key of ['source','category','q','role','availability','selection','family']) if (state[key]) params.set(key, state[key]);
  if (state.page > 1) params.set('page', String(state.page));
  return path + (params.size ? '?' + params.toString() : '');
}
export function matchesType(item,type) {
  if(type==='all') return true;
  if(type==='references') return item.artifactKind==='reference';
  if(type==='components') return item.artifactKind==='component';
  return itemType(item)===type;
}
export function isLibraryHome(hash) {
  return /^#\/library\/?$/.test(String(hash));
}
export function selectItems(data, state) {
  const words = state.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const names = Object.fromEntries(data.sources.map(s => [s.id, s.name]));
  const items = data.items.filter(item => {
    if (!matchesType(item,state.type)) return false;
    if (state.source && item.sourceSite !== state.source) return false;
    if (state.category && !item.categories.includes(state.category)) return false;
    if (state.role && !item.roles?.includes(state.role)) return false;
    if (state.selection && item.selection!==state.selection) return false;
    if (state.family && item.familyId!==state.family) return false;
    if (state.availability === 'preview' && !item.preview) return false;
    if (state.availability === 'example' && !item.preview?.liveUrl) return false;
    if (state.availability === 'video' && item.preview?.kind!=='remote_video') return false;
    if (state.availability === 'source' && item.acquisitionStatus !== 'source_ready') return false;
    if (state.availability === 'waiting' && !['permission_needed','access_blocked'].includes(item.acquisitionStatus)) return false;
    const haystack = [item.title, item.sourceItemId, names[item.sourceSite], ...item.categories].join(' ').toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  });
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  return {total: items.length, page, pages, items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)};
}
