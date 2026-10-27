import type { CareerCategory, CareerPropertyDefinitionV2, CareerPropertyValueV2, CareerRecord, CareerRecordStatus, CareerViewConfiguration } from "@expresso/contracts";

import { propertyOptions } from "@/features/career-editor/properties/property-editors";

/**
 * 저장된 뷰의 필터 · 정렬 · 그룹 · 타임라인 계산.
 * 서버 `services/backend/src/modules/career/view-query.ts`와 같은 규칙을 화면에서 먼저 적용한다.
 * 규칙이 갈리면 저장은 400으로 거절되고 화면은 다른 결과를 보인다.
 */

export type CareerViewType = CareerViewConfiguration["type"];
export type FilterOperator = "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "is_empty" | "is_not_empty";
export interface FilterLeaf { propertyId: string; operator: FilterOperator; operand: CareerPropertyValueV2 | null }
export interface FilterGroup { operator: "and" | "or"; filters: FilterNode[] }
export type FilterNode = FilterLeaf | FilterGroup;
export type ViewDraft = Omit<CareerViewConfiguration, "id" | "categoryId" | "version" | "order" | "createdAt" | "updatedAt">;

export const VIEW_TYPE_LABELS: Record<CareerViewType, string> = { table: "테이블", list: "목록", gallery: "갤러리", board: "보드", timeline: "타임라인" };
export const VIEW_TYPE_ICONS: Record<CareerViewType, string> = { table: "table", list: "list-bullets", gallery: "squares-four", board: "kanban", timeline: "calendar-blank" };
const ALL_TYPES: readonly CareerViewType[] = ["table", "list", "gallery", "board", "timeline"];
/** 화면 정의서 05–05e의 카테고리별 기본 탭과 순서. */
const OFFERED: Record<string, readonly CareerViewType[]> = {
  experience: ["table", "board", "timeline"], project: ["gallery", "table", "timeline"],
  education_history: ["timeline", "table", "gallery"], certification_award: ["table", "gallery"],
  academic_writing: ["list", "timeline"], activity_leadership: ["table", "timeline"], skill_tool: ["board", "table"],
};

export const STATUS_LABELS: Record<CareerRecordStatus, string> = { draft: "초안", organized: "정리됨", verified: "검증됨" };
const STATUSES: readonly CareerRecordStatus[] = ["draft", "organized", "verified"];
/** 값이 없는 그룹의 키. `TableView`의 그룹과 같은 값을 쓴다. */
export const EMPTY_GROUP = "__empty__";

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "같음", neq: "같지 않음", contains: "포함", not_contains: "포함하지 않음",
  gt: "초과", gte: "이상", lt: "미만", lte: "이하", is_empty: "비어 있음", is_not_empty: "비어 있지 않음",
};
const EMPTY_OPERATORS: readonly FilterOperator[] = ["is_empty", "is_not_empty"];
export const MAX_FILTER_LEAVES = 20;
export const MAX_SORTS = 10;

export function activeDefinitions(category: CareerCategory): CareerPropertyDefinitionV2[] {
  return (category.propertySchemaV2 ?? []).filter((item) => item.deletedAt === null).sort((left, right) => left.order - right.order);
}

export function definitionById(category: CareerCategory, propertyId: string | null | undefined): CareerPropertyDefinitionV2 | null {
  if (!propertyId) return null;
  return activeDefinitions(category).find((item) => item.id === propertyId) ?? null;
}

export function dateDefinitions(category: CareerCategory): CareerPropertyDefinitionV2[] {
  return activeDefinitions(category).filter((item) => item.type === "date");
}

export function availableViewTypes(category: CareerCategory): CareerViewType[] {
  return ALL_TYPES.filter((type) => type !== "timeline" || dateDefinitions(category).length > 0);
}

/**
 * 속성 종류별 연산자. 서버 `validateFilterOperator`와 같은 집합에서, 화면이 값을 입력받을 수
 * 있는 것만 남긴다. 관계 · 파일 · 수식은 값 입력이 없어 빈 값 여부만 고른다.
 * 생성 · 수정 시각은 서버가 Date와 문자열을 비교하게 되어 필터에서 뺀다.
 */
export function operatorsFor(definition: CareerPropertyDefinitionV2): FilterOperator[] {
  switch (definition.type) {
    case "number": case "date": return ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"];
    case "text": case "title": case "url": case "email": case "phone": return ["contains", "not_contains", "eq", "neq", "is_empty", "is_not_empty"];
    case "multi_select": return ["contains", "not_contains", "is_empty", "is_not_empty"];
    case "select": return ["eq", "neq", "is_empty", "is_not_empty"];
    case "checkbox": return ["eq", "neq"];
    default: return ["is_empty", "is_not_empty"];
  }
}

export function filterableDefinitions(category: CareerCategory): CareerPropertyDefinitionV2[] {
  return activeDefinitions(category).filter((item) => !(item.system && (item.type === "created_time" || item.type === "updated_time")));
}

export function needsOperand(operator: FilterOperator): boolean {
  return !EMPTY_OPERATORS.includes(operator);
}

/** 입력란의 값을 서버가 받는 operand 모양으로 만든다. 값이 없으면 null(조건 무시). */
export function operandFor(definition: CareerPropertyDefinitionV2, input: string | boolean): CareerPropertyValueV2 | null {
  if (typeof input === "boolean") return definition.type === "checkbox" ? { type: "checkbox", value: input } : null;
  const text = input.trim();
  if (!text) return null;
  switch (definition.type) {
    case "title": return { type: "title", value: text.slice(0, 300) };
    case "text": return { type: "text", value: text };
    case "url": case "email": case "phone": return { type: definition.type, value: text.slice(0, 2_000) };
    case "number": { const value = Number(text); return Number.isFinite(value) ? { type: "number", value } : null; }
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { type: "date", value: { start: text, end: null, timezone: null } } : null;
    case "select": return { type: "select", value: text };
    case "multi_select": return { type: "multi_select", value: [text] };
    case "checkbox": return { type: "checkbox", value: text === "true" };
    default: return null;
  }
}

/** operand를 입력란 값으로 되돌린다. */
export function operandText(operand: CareerPropertyValueV2 | null): string {
  if (!operand) return "";
  const value = operand.value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  if (value && typeof value === "object" && "start" in value) return String(value.start).slice(0, 10);
  return value === null || value === undefined ? "" : String(value);
}

export function defaultLeaf(definition: CareerPropertyDefinitionV2): FilterLeaf {
  const operator = operatorsFor(definition)[0]!;
  return { propertyId: definition.id, operator, operand: definition.type === "checkbox" ? { type: "checkbox", value: true } : null };
}

export function isGroup(node: unknown): node is FilterGroup {
  return Boolean(node && typeof node === "object" && "filters" in node && Array.isArray((node as FilterGroup).filters));
}

/** 저장된 필터를 최상위 묶음 하나로 읽는다. 조건 하나만 저장된 예전 모양도 받는다. */
export function filterRoot(filter: unknown): FilterGroup {
  if (isGroup(filter)) return { operator: filter.operator === "or" ? "or" : "and", filters: filter.filters as FilterNode[] };
  if (filter && typeof filter === "object" && "propertyId" in filter) return { operator: "and", filters: [filter as FilterLeaf] };
  return { operator: "and", filters: [] };
}

export function leafCount(node: FilterNode | null): number {
  if (!node) return 0;
  return isGroup(node) ? node.filters.reduce((count, child) => count + leafCount(child), 0) : 1;
}

/** 빈 묶음을 지우고, 조건이 하나도 없으면 null. 계약은 묶음마다 조건 1개 이상을 요구한다. */
export function normalizeFilter(root: FilterGroup): FilterGroup | null {
  const prune = (group: FilterGroup): FilterGroup | null => {
    const filters = group.filters.flatMap((child): FilterNode[] => {
      if (!isGroup(child)) return [child];
      const pruned = prune(child);
      return pruned ? [pruned] : [];
    });
    return filters.length ? { operator: group.operator, filters } : null;
  };
  return prune(root);
}

/** 저장된 필터가 지금 카테고리에 없는 속성을 가리키면 그 조건을 뺀다. */
export function dropMissingProperties(filter: unknown, category: CareerCategory): FilterGroup | null {
  const ids = new Set(filterableDefinitions(category).map((item) => item.id));
  const walk = (group: FilterGroup): FilterGroup => ({ operator: group.operator, filters: group.filters.flatMap((child): FilterNode[] => isGroup(child) ? [walk(child)] : ids.has(child.propertyId) ? [child] : []) });
  return normalizeFilter(walk(filterRoot(filter)));
}

function unwrap(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value) && "value" in value ? (value as { value: unknown }).value : value;
}

/** 서버 `fieldExpression`과 같은 자리에서 값을 읽는다. 날짜는 시작 날짜로 비교한다. */
export function fieldValue(record: CareerRecord, definition: CareerPropertyDefinitionV2): unknown {
  if (definition.type === "title") return record.title;
  if (definition.type === "created_time" && definition.system) return record.createdAt ?? record.updatedAt;
  if (definition.type === "updated_time" && definition.system) return record.updatedAt;
  const source = definition.type === "formula" || definition.type === "rollup" ? record.computedProperties?.[definition.key] : record.properties[definition.key];
  const value = unwrap(source);
  if (definition.type === "date" && value && typeof value === "object" && "start" in value) return (value as { start: unknown }).start;
  return value;
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function matchesLeaf(record: CareerRecord, leaf: FilterLeaf, category: CareerCategory): boolean {
  const definition = definitionById(category, leaf.propertyId);
  if (!definition) return true;
  const value = fieldValue(record, definition);
  if (leaf.operator === "is_empty") return isEmptyValue(value);
  if (leaf.operator === "is_not_empty") return !isEmptyValue(value);
  const operand = unwrap(leaf.operand);
  const target = operand && typeof operand === "object" && !Array.isArray(operand) && "start" in operand ? (operand as { start: unknown }).start : operand;
  if (target === null || target === undefined) return true;
  if (leaf.operator === "contains" || leaf.operator === "not_contains") {
    const included = Array.isArray(target)
      ? Array.isArray(value) && target.some((item) => value.includes(item))
      : typeof target === "string" && (String(value ?? "").toLocaleLowerCase("ko").includes(target.toLocaleLowerCase("ko")) || (Array.isArray(value) && value.includes(target)));
    return leaf.operator === "contains" ? included : !included;
  }
  if (leaf.operator === "eq") return JSON.stringify(value ?? null) === JSON.stringify(target);
  if (leaf.operator === "neq") return JSON.stringify(value ?? null) !== JSON.stringify(target);
  if (isEmptyValue(value)) return false;
  const left = value as string | number;
  const right = target as string | number;
  if (leaf.operator === "gt") return left > right;
  if (leaf.operator === "gte") return left >= right;
  if (leaf.operator === "lt") return left < right;
  return left <= right;
}

export function matchesFilter(record: CareerRecord, filter: unknown, category: CareerCategory): boolean {
  if (!filter) return true;
  const evaluate = (node: FilterNode): boolean => {
    if (!isGroup(node)) return matchesLeaf(record, node, category);
    return node.operator === "or" ? node.filters.some(evaluate) : node.filters.every(evaluate);
  };
  return isGroup(filter) || (typeof filter === "object" && "propertyId" in filter) ? evaluate(filter as FilterNode) : true;
}

function comparable(value: unknown): string | number | null {
  if (isEmptyValue(value)) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return Array.isArray(value) ? value.map(String).join(" ").toLocaleLowerCase("ko") : String(value).toLocaleLowerCase("ko");
}

export function sortRecords<T extends CareerRecord>(records: readonly T[], view: CareerViewConfiguration, category: CareerCategory): T[] {
  if (!view.sorts.length) {
    if (!view.recordOrder.length) return [...records];
    const rank = new Map(view.recordOrder.map((id, index) => [id, index]));
    return records.map((record, index) => ({ record, index })).sort((left, right) => {
      const leftRank = rank.get(left.record.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.record.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank === rightRank ? left.index - right.index : leftRank - rightRank;
    }).map(({ record }) => record);
  }
  return [...records].sort((left, right) => {
    for (const sort of view.sorts) {
      const definition = definitionById(category, sort.propertyId);
      if (!definition) continue;
      const leftValue = comparable(fieldValue(left, definition));
      const rightValue = comparable(fieldValue(right, definition));
      if (leftValue === rightValue) continue;
      if (leftValue === null) return sort.nulls === "first" ? -1 : 1;
      if (rightValue === null) return sort.nulls === "first" ? 1 : -1;
      const result = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue), "ko");
      if (result) return sort.direction === "asc" ? result : -result;
    }
    return left.id.localeCompare(right.id);
  });
}

/** 제목과 본문 글자에서 찾는다. 대소문자는 가리지 않는다. */
export function matchesSearch(record: CareerRecord, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("ko");
  if (!needle) return true;
  return `${record.title}\n${record.bodyMd}`.toLocaleLowerCase("ko").includes(needle);
}

// ── 그룹 ─────────────────────────────────────────────────────────────

export type Grouping = { kind: "status" } | { kind: "property"; definition: CareerPropertyDefinitionV2 };
export interface GroupColumn { key: string; label: string }

export function groupableDefinitions(category: CareerCategory): CareerPropertyDefinitionV2[] {
  return activeDefinitions(category).filter((item) => item.type === "select" || item.type === "checkbox");
}

/** 그룹 속성이 없거나 묶을 수 없는 속성이면 상태로 묶는다. */
export function groupingFor(view: CareerViewConfiguration, category: CareerCategory): Grouping {
  const definition = definitionById(category, view.groupPropertyId);
  return definition && (definition.type === "select" || definition.type === "checkbox") ? { kind: "property", definition } : { kind: "status" };
}

export function groupKeyOf(record: CareerRecord, grouping: Grouping): string {
  if (grouping.kind === "status") return record.status;
  const value = fieldValue(record, grouping.definition);
  if (grouping.definition.type === "checkbox") return value === true ? "true" : "false";
  return typeof value === "string" && value ? value : EMPTY_GROUP;
}

/** 정의가 가진 모든 그룹 값. 기록이 없는 그룹도 열로 보인다. `groupOrder`에 있는 값이 먼저 온다. */
export function groupColumns(grouping: Grouping, groupOrder: readonly string[]): GroupColumn[] {
  const columns: GroupColumn[] = grouping.kind === "status"
    ? STATUSES.map((status) => ({ key: status, label: STATUS_LABELS[status] }))
    : grouping.definition.type === "checkbox"
      ? [{ key: "true", label: "선택됨" }, { key: "false", label: "선택 안 됨" }]
      : [...propertyOptions(grouping.definition).map((option) => ({ key: option.id, label: option.name })), { key: EMPTY_GROUP, label: `${grouping.definition.name} 없음` }];
  const rank = new Map(groupOrder.map((key, index) => [key, index]));
  return columns.map((column, index) => ({ column, index })).sort((left, right) => (rank.get(left.column.key) ?? groupOrder.length + left.index) - (rank.get(right.column.key) ?? groupOrder.length + right.index)).map(({ column }) => column);
}

/** 그룹 값으로 옮길 때 저장할 속성 값. */
export function groupValue(grouping: Extract<Grouping, { kind: "property" }>, key: string): CareerPropertyValueV2 | null {
  if (grouping.definition.type === "checkbox") return { type: "checkbox", value: key === "true" };
  return key === EMPTY_GROUP ? null : { type: "select", value: key };
}

// ── 타임라인 ─────────────────────────────────────────────────────────

export interface TimelineRange { start: string; end: string | null }

function dateRange(value: unknown): { start: string; end: string | null } | null {
  const range = unwrap(value);
  if (!range || typeof range !== "object" || !("start" in range)) return null;
  const { start, end } = range as { start: unknown; end?: unknown };
  return typeof start === "string" ? { start: start.slice(0, 10), end: typeof end === "string" ? end.slice(0, 10) : null } : null;
}

/** 시작 속성 값의 범위. 종료 속성을 따로 고르면 그 값의 시작 날짜가 종료다. */
export function timelineRange(record: CareerRecord, view: CareerViewConfiguration, category: CareerCategory): TimelineRange | null {
  const start = definitionById(category, view.timeline?.startPropertyId);
  if (!start) return null;
  const range = dateRange(record.properties[start.key]);
  if (!range) return null;
  const endDefinition = definitionById(category, view.timeline?.endPropertyId);
  const end = endDefinition ? dateRange(record.properties[endDefinition.key])?.start ?? null : range.end;
  return { start: range.start, end: end && end >= range.start ? end : null };
}

/** 축 범위(`axisStart` · `axisEnd`)와 겹치는 기록만 남긴다. */
export function withinAxis(range: TimelineRange, view: CareerViewConfiguration): boolean {
  const axisStart = view.timeline?.axisStart;
  const axisEnd = view.timeline?.axisEnd;
  if (axisEnd && range.start > axisEnd) return false;
  if (axisStart && (range.end ?? range.start) < axisStart) return false;
  return true;
}

// ── 뷰 만들기 ────────────────────────────────────────────────────────

/** 종류를 바꿀 때 그 종류에 필요한 설정을 채운다. 타임라인은 첫 날짜 속성을 시작으로 잡는다. */
export function withType<T extends ViewDraft>(view: T, type: CareerViewType, category: CareerCategory): T {
  const definitions = activeDefinitions(category);
  const date = dateDefinitions(category)[0];
  const startValid = view.timeline && definitionById(category, view.timeline.startPropertyId)?.type === "date";
  return {
    ...view,
    type,
    gallery: view.gallery ?? (type === "gallery" ? { coverPropertyId: null, previewPropertyIds: definitions.filter((item) => item.type !== "title").slice(0, 3).map((item) => item.id) } : null),
    board: view.board ?? (type === "board" ? { hiddenGroupIds: [], cardOrder: {} } : null),
    timeline: startValid ? view.timeline : type === "timeline" && date ? { startPropertyId: date.id, endPropertyId: null, axisStart: null, axisEnd: null } : null,
  };
}

export function defaultViewDraft(category: CareerCategory, type: CareerViewType, name: string): ViewDraft {
  const ids = activeDefinitions(category).map((item) => item.id);
  return withType({ name, type, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: ids, propertyOrder: ids, columnWidths: {}, gallery: null, board: null, timeline: null }, type, category);
}

/** 이미 쓰는 이름이면 뒤에 번호를 붙인다. */
export function uniqueViewName(base: string, views: readonly Pick<CareerViewConfiguration, "name">[]): string {
  const names = new Set(views.map((view) => view.name));
  if (!names.has(base)) return base;
  for (let index = 2; ; index += 1) if (!names.has(`${base} ${index}`)) return `${base} ${index}`;
}

export function isLocalView(view: Pick<CareerViewConfiguration, "id">): boolean {
  return view.id.startsWith("local-");
}

/** 저장된 뷰가 없는 카테고리에 보일 기본 탭. 처음 바꿀 때 모두 저장한다. */
export function localDefaultViews(category: CareerCategory): CareerViewConfiguration[] {
  const offered = (OFFERED[category.key] ?? [category.defaultView]).filter((type) => availableViewTypes(category).includes(type));
  const types = offered.length ? offered : ["table" as const];
  const now = new Date(0).toISOString();
  return types.map((type, order) => ({ ...defaultViewDraft(category, type, VIEW_TYPE_LABELS[type]), id: `local-${type}`, categoryId: category.id, version: 1, order, createdAt: now, updatedAt: now }));
}

/** PATCH · POST 본문. 계약이 받는 칸만 보낸다. */
export function viewBody(view: ViewDraft): ViewDraft {
  return { name: view.name, type: view.type, filter: view.filter, sorts: view.sorts, groupPropertyId: view.groupPropertyId, groupOrder: view.groupOrder, recordOrder: view.recordOrder, visiblePropertyIds: view.visiblePropertyIds, propertyOrder: view.propertyOrder, columnWidths: view.columnWidths, gallery: view.gallery, board: view.board, timeline: view.timeline };
}

/** 카드에 보일 값. 선택 값은 옵션 이름으로, 날짜는 `YYYY.MM.DD`로 바꾼다. */
export function propertyLabel(record: CareerRecord, definition: CareerPropertyDefinitionV2): string | null {
  const value = fieldValue(record, definition);
  if (isEmptyValue(value)) return null;
  if (definition.type === "select" || definition.type === "multi_select") {
    const names = new Map(propertyOptions(definition).map((option) => [option.id, option.name]));
    const ids = Array.isArray(value) ? value : [value];
    return ids.map((id) => names.get(String(id)) ?? null).filter(Boolean).join(", ") || null;
  }
  if (definition.type === "checkbox") return value === true ? definition.name : null;
  if (definition.type === "date") return formatDate(String(value));
  if (Array.isArray(value)) return value.map((item) => item && typeof item === "object" && "title" in item ? String(item.title) : String(item)).join(", ");
  return typeof value === "object" ? null : String(value);
}

export function formatDate(value: string): string {
  return value.slice(0, 10).replaceAll("-", ".");
}
