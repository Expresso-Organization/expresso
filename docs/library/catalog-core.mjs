// 정적 포털 목록의 검증·검색·공유 주소를 한 곳에서 처리합니다.
export const TYPES = Object.freeze({
  all: '전체', components: '컴포넌트', prompts: '프롬프트', references: '참고 자료',
  motion: '모션', icons: '아이콘', diagrams: '다이어그램', pages: '페이지 구성', registries: '공급자',
});
export const TYPE_OF = Object.freeze({ component: 'components', prompt: 'prompts', reference: 'references',
  motion: 'motion', icon: 'icons', diagram: 'diagrams', page: 'pages', registry: 'registries' });
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
    type: Object.hasOwn(TYPES, parts[1]) ? parts[1] : 'all',
    id: decode(parts[2]), source: params.get('source') || '', q: params.get('q') || '',
    category: params.get('category') || '', ...(params.get('role') ? {role:params.get('role')} : {}), ...(params.get('availability') ? {availability:params.get('availability')} : {}), page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function libraryRoute(state) {
  const type = Object.hasOwn(TYPES, state.type) ? state.type : 'all';
  let path = '#/library' + (type !== 'all' || state.id ? '/' + type : '') + (state.id ? '/' + encodeURIComponent(state.id) : '');
  const params = new URLSearchParams();
  for (const key of ['source','category','q','role','availability']) if (state[key]) params.set(key, state[key]);
  if (state.page > 1) params.set('page', String(state.page));
  return path + (params.size ? '?' + params.toString() : '');
}
export function selectItems(data, state) {
  const words = state.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const names = Object.fromEntries(data.sources.map(s => [s.id, s.name]));
  const items = data.items.filter(item => {
    if (state.type !== 'all' && TYPE_OF[item.artifactKind] !== state.type) return false;
    if (state.source && item.sourceSite !== state.source) return false;
    if (state.category && !item.categories.includes(state.category)) return false;
    if (state.role && !item.roles?.includes(state.role)) return false;
    if (state.availability === 'preview' && !item.preview) return false;
    if (state.availability === 'source' && item.acquisitionStatus !== 'source_ready') return false;
    if (state.availability === 'waiting' && !['permission_needed','access_blocked'].includes(item.acquisitionStatus)) return false;
    const haystack = [item.title, item.sourceItemId, names[item.sourceSite], ...item.categories].join(' ').toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  });
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  return {total: items.length, page, pages, items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)};
}
