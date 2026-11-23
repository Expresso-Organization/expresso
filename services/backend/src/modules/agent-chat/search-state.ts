import { normalizeCountry } from "../jobs/index.js";
import { KOREAN_PLACES_BY_SPECIFICITY, koreanPlace, NEARBY_RADIUS_KM, type AgentJobSearchInput } from "@expresso/contracts";

/** 예전 단일 지역 입력도 알려진 장소들로 나눈다. 모르는 지역은 그대로 검증에 넘긴다. */
export function searchLocations(input: AgentJobSearchInput): string[] | undefined {
  if (input.locations) return [...new Set(input.locations)];
  if (!input.location) return undefined;
  if (koreanPlace(input.location)) return [input.location];
  const found = KOREAN_PLACES_BY_SPECIFICITY.filter(place => input.location!.includes(place.name));
  return found.length ? [...new Set(found.map(place => place.name))] : [input.location];
}

/** 생략한 조건은 유지한다. 빈 배열은 해당 축을 지운다. 새 검색만 reset으로 초기화한다. */
export function mergeSearch(previous: AgentJobSearchInput | undefined, input: AgentJobSearchInput): AgentJobSearchInput {
  if (input.reset) previous = undefined;
  const merged = { ...previous, ...input };
  const locations = searchLocations(input) ?? previous?.locations;
  const families = input.families ?? (input.family ? [input.family] : previous?.families);
  delete merged.location; delete merged.family; delete merged.reset;
  if (locations) merged.locations = locations;
  if (families) merged.families = [...new Set(families)];
  if (!merged.country && locations?.some(place => koreanPlace(place) || /^(서울|경기|인천|부산|대전|대구|광주|울산|세종|제주|강원|충북|충남|전북|전남|경북|경남)$/.test(place))) merged.country = "한국";
  if (merged.country) merged.country = normalizeCountry(merged.country);
  return merged;
}

export function searchConditions(search: AgentJobSearchInput): string[] {
  const locations = search.locations ?? [];
  const mode = search.locationMode ?? "nearby";
  return [search.families?.join(" 또는 "), search.country,
    locations.length ? `${locations.join(" · ")}${mode === "strict" ? "만" : mode === "prefer" ? " 우선" : ` 주변 ${NEARBY_RADIUS_KM}km`}` : null,
    search.experience === undefined ? "경력 조건 미확인" : search.experience === 0 ? "신입 지원 가능" : `경력 ${search.experience}년 기준`, search.technology, search.query,
  ].filter((value): value is string => !!value).map(value => value.slice(0, 120));
}

/** 큰 직군 분류에 다른 역할이 섞여도 구체적으로 요청한 직무는 제목으로 한 번 더 거른다. */
export function roleTerms(families: readonly string[]): string[] {
  const terms = families.map(family => /데이터\s*분석|data\s*analyst/i.test(family) ? ["Data Analyst", "데이터 분석", "데이터분석", "분석가"]
    : /ml|machine\s*learning|머신러닝/i.test(family) ? ["ML Engineer", "Machine Learning", "머신러닝", "ML 엔지니어"] : []);
  return terms.length && terms.every(group => group.length) ? [...new Set(terms.flat())] : [];
}
