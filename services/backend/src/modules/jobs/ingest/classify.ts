/**
 * 모아 온 공고를 걸러 내고 갈래를 붙인다.
 *
 * **규칙이지 판단이 아니다.** 제목과 부서 이름의 낱말만 본다 — 본문을 읽어
 * 직군을 가리는 것은 모델이 할 일이고, 여기서 흉내 내면 틀린 분류가 사실처럼
 * 남는다. 그래서 **읽히지 않으면 null**이고, null인 공고는 들이지 않는다.
 *
 * 1차 타깃이 소프트웨어 개발이라 개발·데이터 갈래만 저장한다. 넓힐 때는
 * `TARGET_FAMILIES`를 늘리고 다시 수집하면 된다 — 원문은 바깥에 그대로 있다.
 */

/** 06 카테고리 칩이 이 값으로 묶는다. 화면에 그대로 나가는 글자다. */
export const FAMILIES = [
  "백엔드",
  "프론트엔드",
  "모바일",
  "데이터",
  "인프라 · 플랫폼",
  "ML · AI",
  "보안",
  "QA",
  "개발 그 외",
] as const;

export type JobFamily = (typeof FAMILIES)[number];

/** 지금 들이는 갈래. 늘리면 다음 수집부터 들어온다. */
export const TARGET_FAMILIES: readonly JobFamily[] = FAMILIES;

/**
 * 앞에서부터 맞는 것을 고른다 — 순서가 곧 우선순위다.
 *
 * "Machine Learning Platform Engineer"는 ML이면서 플랫폼이다. 둘 중 하나를
 * 골라야 한다면 더 좁은 쪽이 낫다: 그 사람이 찾는 말이 그쪽이다.
 */
const FAMILY_RULES: { family: JobFamily; pattern: RegExp }[] = [
  { family: "ML · AI", pattern: /\b(machine learning|ml engineer|ml scientist|deep learning|nlp|computer vision|llm|generative ai|research scientist)\b|머신\s?러닝|딥\s?러닝|인공지능/i },
  { family: "데이터", pattern: /\b(data engineer|data scientist|data analy|analytics engineer|bi engineer|data platform|데이터)\b|데이터\s?(엔지니어|사이언|분석)/i },
  { family: "보안", pattern: /\b(security engineer|appsec|infosec|penetration|보안)\b/i },
  { family: "QA", pattern: /\b(qa engineer|quality assurance|sdet|test engineer|automation engineer)\b|품질\s?보증/i },
  { family: "인프라 · 플랫폼", pattern: /\b(sre|site reliability|devops|infrastructure|platform engineer|cloud engineer|network engineer|systems engineer|인프라|플랫폼\s?엔지니어)\b/i },
  { family: "모바일", pattern: /\b(ios|android|mobile engineer|mobile developer|flutter|react native)\b|모바일\s?(개발|엔지니어)/i },
  { family: "프론트엔드", pattern: /\b(frontend|front-end|front end|web engineer|ui engineer)\b|프론트\s?엔드/i },
  { family: "백엔드", pattern: /\b(backend|back-end|back end|server engineer|server developer|api engineer)\b|백\s?엔드|서버\s?(개발|엔지니어)/i },
  // 위에 안 걸렸지만 개발자인 것들. 마지막에 둔다.
  { family: "개발 그 외", pattern: /\b(software engineer|software developer|swe|full ?stack|game (client|server)|graphics engineer|embedded|firmware|compiler|architect)\b|소프트웨어\s?(개발|엔지니어)|개발자/i },
];

/**
 * 개발 직무가 아닌데 개발 낱말이 들어간 제목을 막는다.
 *
 * "Sales Engineer" · "Solutions Engineer"는 영업이고, "설비보전 엔지니어"는
 * 시설이다. `engineer`만 보고 들이면 목록이 다시 흐려진다.
 */
const NOT_SOFTWARE = /\b(sales engineer|solutions? engineer|solution architect|customer engineer|field engineer|industrial|mechanical|civil|chemical|facilit|maintenance|hvac)\b|설비|보전|정비|시설|생산\s?기술|품질\s?관리(?!\s?자동화)/i;

/**
 * 지원할 수 있는 자리가 아닌 것.
 *
 * 인재풀 등록과 내부 템플릿이다. 실측에서 쿠팡 보드의 94건이 여기였다 —
 * `zz-Evergreen Requisition`(인재풀)과 `z-Test & Templates Only`. 목록에
 * 세우면 눌러 본 사람이 지원할 수 없는 자리를 만난다.
 */
const NOT_AN_OPENING = /^(zz-|z-Test)|evergreen requisition|templates only/i;
const TALENT_POOL = /인재\s?풀|talent pool|인재풀\s?등록/i;

export function isOpening(input: {
  title: string;
  team: string | null;
  location: string | null;
}): boolean {
  if (TALENT_POOL.test(input.title)) return false;
  for (const value of [input.team, input.location]) {
    if (value && NOT_AN_OPENING.test(value)) return false;
  }
  return true;
}

/** 읽히지 않으면 null. 짐작해서 붙이지 않는다. */
export function classifyFamily(title: string, team: string | null): JobFamily | null {
  const subject = `${title} ${team ?? ""}`;
  if (NOT_SOFTWARE.test(subject)) return null;
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(subject)) return rule.family;
  }
  return null;
}

/**
 * 지역 표기를 하나로 모은다.
 *
 * 국내는 광역시·도까지, 국외는 나라까지다. 국내 구직자에게 필요한 만큼만
 * 잡는다 — "Bengaluru"와 "Hyderabad"를 갈라 봐야 여기서 고를 일이 없다.
 *
 * `country`를 함께 적는 이유는 **화면이 나라 단위로 고르기** 때문이다. 국내는
 * 지역이 광역시·도라 `서울`·`경기`가 다 다른 값인데, 고르는 사람에게 필요한
 * 첫 갈래는 "국내냐 국외냐"다. 지역과 나라를 두 표로 나눠 두면 하나를 고칠 때
 * 다른 하나가 조용히 어긋나므로 한 줄에 같이 적는다.
 */
const REGION_RULES: { region: string; country: string; pattern: RegExp }[] = [
  { region: "서울", country: "한국", pattern: /\bseoul\b|서울/i },
  { region: "경기", country: "한국", pattern: /\b(gyeonggi|seongnam|pangyo|bundang|suwon|yongin|goyang)\b|경기|성남|판교|분당|수원|용인/i },
  { region: "인천", country: "한국", pattern: /\bincheon\b|인천/i },
  { region: "부산", country: "한국", pattern: /\bbusan\b|부산/i },
  { region: "대전", country: "한국", pattern: /\bdaejeon\b|대전/i },
  { region: "대구", country: "한국", pattern: /\bdaegu\b|대구/i },
  { region: "광주", country: "한국", pattern: /\bgwangju\b|광주/i },
  { region: "제주", country: "한국", pattern: /\bjeju\b|제주/i },
  // 도시를 못 읽었지만 한국인 경우. 위 규칙 다음에 와야 한다.
  { region: "한국 그 외", country: "한국", pattern: /\b(south korea|korea|republic of korea|kr)\b|대한민국|한국/i },
  { region: "일본", country: "일본", pattern: /\b(japan|tokyo|osaka|kyoto)\b|일본|도쿄/i },
  { region: "대만", country: "대만", pattern: /\b(taiwan|taipei|taoyuan|kaohsiung)\b|대만|타이베이/i },
  { region: "싱가포르", country: "싱가포르", pattern: /\bsingapore\b|싱가포르/i },
  { region: "중국", country: "중국", pattern: /\b(china|shanghai|beijing|shenzhen)\b|중국|상하이/i },
  { region: "인도", country: "인도", pattern: /\b(india|bengaluru|bangalore|hyderabad|gurgaon|mumbai|delhi)\b|인도/i },
  { region: "미국", country: "미국", pattern: /\b(usa|united states|u\.s\.|california|washington|new york|seattle|mountain view|menlo park|san mateo|san francisco|riverside|austin|texas)\b|미국/i },
  { region: "캐나다", country: "캐나다", pattern: /\bcanada|toronto|vancouver\b/i },
  { region: "영국", country: "영국", pattern: /\b(united kingdom|london|uk)\b|영국/i },
  { region: "독일", country: "독일", pattern: /\b(germany|berlin|munich)\b|독일/i },
  { region: "호주", country: "호주", pattern: /\b(australia|sydney|melbourne)\b|호주/i },
  { region: "베트남", country: "베트남", pattern: /\b(vietnam|hanoi|ho chi minh)\b|베트남/i },
  { region: "네덜란드", country: "네덜란드", pattern: /\b(netherlands|amsterdam)\b|네덜란드/i },
  { region: "아일랜드", country: "아일랜드", pattern: /\b(ireland|dublin)\b|아일랜드/i },
  { region: "폴란드", country: "폴란드", pattern: /\b(poland|warsaw|krakow)\b|폴란드/i },
];

/**
 * 지역이 어느 나라인가. 모르는 지역은 그대로 돌려준다.
 *
 * 표를 여기 두는 이유는 지역을 만드는 곳과 나라로 묶는 곳이 **같은 표**를 봐야
 * 하기 때문이다. 새 지역을 넣으면서 나라를 안 적으면 타입이 먼저 막는다.
 */
export const COUNTRY_OF_REGION: Readonly<Record<string, string>> = Object.fromEntries(
  REGION_RULES.map((rule) => [rule.region, rule.country]),
);

export function countryOf(region: string): string {
  return COUNTRY_OF_REGION[region] ?? region;
}

/** 그 나라에 속한 지역들. 국가 필터가 `location_region`으로 걸릴 때 쓴다. */
export function regionsOf(country: string): string[] {
  return REGION_RULES.filter((rule) => rule.country === country).map((rule) => rule.region);
}

/** 원격 근무는 지역이 아니라 근무 형태다. 여기서 다루지 않는다. */
export function normalizeRegion(location: string | null): string | null {
  if (!location) return null;
  for (const rule of REGION_RULES) {
    if (rule.pattern.test(location)) return rule.region;
  }
  return null;
}
