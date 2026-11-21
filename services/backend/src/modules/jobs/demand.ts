import { mongoCollections } from "@expresso/database";
import type { DemandItem, DemandKind, GoalDemand } from "@expresso/contracts";
import type { MongoContext } from "../../platform/mongodb.js";
import { classifyFamily, type JobFamily } from "./ingest/classify.js";
import { escapeSearch } from "./mongo-queries.js";

/**
 * 목표의 요건 집계 — 구직 목표와 같은 직군의 실제 공고에 요건이 몇 건 나오는지 센다.
 *
 * AI를 부르지 않는다. 정해 둔 사전의 표현을 공고의 제목과 원문에서 찾아, 공고마다 한 번씩 센다.
 * 세는 것은 「그 표현이 나온 공고의 수」다 — 자격 요건인지 우대 사항인지는 가르지 않는다.
 * 사전에 없는 요건은 세지 못한다. 그래서 결과는 「N건 중 M건에 나옴」으로만 말한다.
 */

/** 표본으로 모으는 열린 공고의 상한. 최근에 올라온 것부터 모은다. */
export const DEMAND_SAMPLE_LIMIT = 200;
/** 한 회사에서 표본에 넣는 공고의 상한. 공고가 많은 회사 하나가 결과를 정하지 않게 한다. */
export const DEMAND_PER_COMPANY = 10;
/** 표본이 이보다 적으면 적다고 밝힌다. 수요 집계(`summarizeDemand`)의 기준과 같다. */
export const DEMAND_SMALL_SAMPLE = 5;
/** 표본의 이 비율 이상에 나온 항목만 낸다. 적어도 2건이어야 한다. */
export const DEMAND_MIN_RATIO = 0.1;
export const DEMAND_ITEM_LIMIT = 14;
/** 종류마다 내는 항목의 상한. 한 종류가 목록을 다 차지하지 않게 한다. */
const KIND_LIMIT: Record<DemandKind, number> = { technology: 7, experience: 4, career: 1, qualification: 2 };

interface Term { id: string; kind: Exclude<DemandKind, "career">; label: string; pattern: RegExp }

/** 영문 · 숫자 낱말로만 찾는다. `java`가 `javascript` 안에서, `sql`이 `mysql` 안에서 잡히지 않는다. */
const word = (...names: string[]) => new RegExp(`(?:^|[^a-z0-9+#])(?:${names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![a-z0-9+#])`);
const tech = (label: string, ...names: string[]): Term => ({ id: `technology:${(names[0] ?? label).replace(/[^a-z0-9+#.]/g, "-")}`, kind: "technology", label, pattern: word(...names) });

/**
 * 기술. 검색 해석기의 사전(`search-parser.ts`의 `TECHNOLOGIES`)에 화면 · 모바일 · 인프라 기술을 더했다.
 * `go`는 영어 문장의 낱말과 겹친다. `golang`이거나 다른 기술과 나란히 적힌 `Go`만 센다.
 */
const TECHNOLOGY_TERMS: Term[] = [
  tech("TypeScript", "typescript"), tech("JavaScript", "javascript"), tech("Python", "python", "파이썬"), tech("Java", "java", "자바"), tech("Kotlin", "kotlin", "코틀린"),
  tech("Scala", "scala"), tech("Rust", "rust"), tech("C++", "c++"), tech("C#", "c#"), tech("Swift", "swift", "swiftui"), tech("Ruby", "ruby"), tech("PHP", "php"),
  { id: "technology:go", kind: "technology", label: "Go", pattern: /(?:^|[^a-z0-9])(?:golang|go\s?언어|go\s?lang)(?![a-z0-9])|[,/·(]\s*go\s*(?=[,/·)])/ },
  tech("SQL", "sql"), tech("PostgreSQL", "postgresql", "postgres"), tech("MySQL", "mysql"), tech("MongoDB", "mongodb", "mongo"), tech("Redis", "redis"),
  tech("Elasticsearch", "elasticsearch", "opensearch"), tech("Kafka", "kafka", "카프카"), tech("Spark", "spark", "pyspark"), tech("Airflow", "airflow"), tech("dbt", "dbt"),
  tech("Flink", "flink"), tech("Hadoop", "hadoop"), tech("BigQuery", "bigquery"), tech("Snowflake", "snowflake"),
  tech("Kubernetes", "kubernetes", "k8s", "쿠버네티스"), tech("Docker", "docker", "도커"), tech("Terraform", "terraform"),
  tech("AWS", "aws", "amazon web services"), tech("GCP", "gcp", "google cloud"), tech("Azure", "azure"), tech("Linux", "linux", "리눅스"),
  tech("Git", "git", "github", "gitlab"), tech("CI/CD", "ci/cd", "cicd", "jenkins", "github actions", "argocd", "argo cd"),
  tech("React", "react", "react.js", "reactjs", "리액트"), tech("Vue", "vue", "vue.js", "vuejs"), tech("Next.js", "next.js", "nextjs"), tech("Node.js", "node.js", "nodejs"),
  tech("Spring", "spring", "spring boot", "springboot", "스프링"), tech("Django", "django"), tech("FastAPI", "fastapi"), tech("NestJS", "nestjs", "nest.js"),
  tech("GraphQL", "graphql"), tech("gRPC", "grpc"), tech("REST API", "rest api", "restful", "rest apis"), tech("MSA", "msa", "microservice", "microservices", "마이크로서비스"),
  tech("iOS", "ios"), tech("Android", "android", "안드로이드"), tech("Flutter", "flutter"), tech("React Native", "react native"),
  tech("PyTorch", "pytorch"), tech("TensorFlow", "tensorflow"), tech("LLM", "llm", "llms", "large language model"), tech("HTML · CSS", "html", "css"),
];

const said = (id: string, kind: Term["kind"], label: string, pattern: RegExp): Term => ({ id: `${kind}:${id}`, kind, label, pattern });
/** 경험. 한국어 공고와 영어 공고의 표현을 함께 둔다. */
const EXPERIENCE_TERMS: Term[] = [
  said("scale", "experience", "대용량 트래픽 · 데이터 처리", /대용량|대규모\s?(트래픽|데이터|서비스|시스템)|high[- ]traffic|large[- ]scale|at scale|high[- ]volume/),
  said("distributed", "experience", "분산 시스템", /분산\s?(시스템|처리|환경|아키텍처)|distributed (system|computing|architecture)/),
  said("incident", "experience", "장애 대응 · 운영", /장애\s?(대응|처리|분석|해결)|온콜|on-?call|incident (response|management)|트러블\s?슈팅|troubleshoot/),
  said("testing", "experience", "테스트 코드 · 자동화", /테스트\s?(코드|자동화)|단위\s?테스트|unit test|test automation|automated test|\btdd\b/),
  said("code-review", "experience", "코드 리뷰", /코드\s?리뷰|code review/),
  said("performance", "experience", "성능 최적화", /성능\s?(최적화|개선|튜닝)|performance (optimi[sz]ation|tuning|improvement)|optimi[sz]e (the )?performance/),
  said("architecture", "experience", "시스템 설계 · 아키텍처", /아키텍처|architecture|시스템\s?설계|system design/),
  said("pipeline", "experience", "데이터 파이프라인", /데이터\s?파이프라인|data pipelines?|\betl\b|\belt\b/),
  said("monitoring", "experience", "모니터링 · 관측", /모니터링|monitoring|observability/),
  said("open-source", "experience", "오픈소스 기여", /오픈\s?소스|open[- ]source/),
  said("leadership", "experience", "리딩 · 멘토링", /리딩|리드\s?경험|팀\s?리드|멘토링|mentor|lead(ing)? (a |the )?(team|project)|leadership/),
  said("agile", "experience", "애자일 방식", /애자일|agile|스크럼|scrum/),
];
/** 자격 — 학위, 전공, 언어, 자격증. */
const QUALIFICATION_TERMS: Term[] = [
  said("bachelor", "qualification", "학사 학위", /학사|대졸|4년제|bachelor|\bbs\b|\bb\.s\.|undergraduate degree/),
  said("graduate", "qualification", "석사 · 박사 학위", /석사|박사|master'?s degree|\bms\b|\bm\.s\.|ph\.?d/),
  said("cs-major", "qualification", "컴퓨터공학 전공", /컴퓨터\s?(공학|과학)|전산\s?(학|관련)|computer science|관련\s?(학과|전공)/),
  said("english", "qualification", "영어 커뮤니케이션", /영어|english|bilingual/),
  said("certificate", "qualification", "자격증", /정보처리기사|sqld|aws certified|자격증|certifications?\b|\bcissp\b|\bcka\b/),
];
export const DEMAND_TERMS: readonly Term[] = [...TECHNOLOGY_TERMS, ...EXPERIENCE_TERMS, ...QUALIFICATION_TERMS];

/** 경력 연차의 구간. `experienceMinYears`(수집과 사실 읽기가 채운 값)로 나눈다. */
const CAREER_BANDS: readonly { id: string; label: string; min: number; max: number }[] = [
  { id: "career:0", label: "신입 지원 가능", min: 0, max: 0 },
  { id: "career:1-2", label: "경력 1~2년 이상", min: 1, max: 2 },
  { id: "career:3-4", label: "경력 3~4년 이상", min: 3, max: 4 },
  { id: "career:5-7", label: "경력 5~7년 이상", min: 5, max: 7 },
  { id: "career:8", label: "경력 8년 이상", min: 8, max: Number.POSITIVE_INFINITY },
];

export interface DemandPosting { title: string; descriptionRaw: string | null; technologies?: readonly string[]; experienceMinYears: number | null }

/** 공고 한 건에서 찾은 항목의 id. 한 공고는 한 항목을 한 번만 센다. */
export function demandHits(posting: DemandPosting): Set<string> {
  const text = `${posting.title}\n${posting.descriptionRaw ?? ""}`.normalize("NFKC").toLocaleLowerCase("en-US");
  const hits = new Set<string>();
  for (const term of DEMAND_TERMS) if (term.pattern.test(text)) hits.add(term.id);
  // 정리된 기술 키워드(공고를 분석했을 때만 있다)는 원문 찾기와 합친다.
  for (const name of posting.technologies ?? []) { const key = ` ${name.normalize("NFKC").toLocaleLowerCase("en-US")} `; for (const term of TECHNOLOGY_TERMS) if (term.pattern.test(key)) hits.add(term.id); }
  if (posting.experienceMinYears !== null) { const band = CAREER_BANDS.find(item => posting.experienceMinYears! >= item.min && posting.experienceMinYears! <= item.max); if (band) hits.add(band.id); }
  return hits;
}

/**
 * 표본의 공고들에서 항목을 세어, 자주 나온 순서로 고른다.
 * 표본의 10% 이상(적어도 2건)에 나온 것만 내고, 종류마다 상한을 둔다. 표본이 적으면(5건 미만) 한 건에 나온 것도 낸다.
 */
export function countDemand(postings: readonly DemandPosting[]): DemandItem[] {
  const counts = new Map<string, number>();
  for (const posting of postings) for (const id of demandHits(posting)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const floor = postings.length < DEMAND_SMALL_SAMPLE ? 1 : Math.max(2, Math.ceil(postings.length * DEMAND_MIN_RATIO));
  const labels = new Map<string, { kind: DemandKind; label: string }>([...DEMAND_TERMS.map(term => [term.id, { kind: term.kind, label: term.label }] as const), ...CAREER_BANDS.map(band => [band.id, { kind: "career" as const, label: band.label }] as const)]);
  const order = [...labels.keys()];
  const ranked = [...counts].filter(([, count]) => count >= floor).sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
  const taken: Record<DemandKind, number> = { technology: 0, experience: 0, career: 0, qualification: 0 };
  const items: DemandItem[] = [];
  for (const [id, count] of ranked) {
    const { kind, label } = labels.get(id)!;
    if (taken[kind] >= KIND_LIMIT[kind] || items.length >= DEMAND_ITEM_LIMIT) continue;
    taken[kind] += 1; items.push({ id, kind, label, count });
  }
  return items;
}

/** 목표의 글에서 찾을 낱말. 직군으로 분류되지 않은 목표는 이 글로 제목 · 원문을 찾는다. */
const searchText = (work: string) => work.normalize("NFKC").replace(/(이|가)?\s*(되고|하고)\s*싶(어요|습니다|다|어)?[.!]?$/u, "").replace(/\s*(개발자|엔지니어|직무|포지션|취업|이직|신입|주니어|시니어)\s*/gu, " ").trim();

/**
 * 목표의 글을 직군으로 옮긴다. 먼저 공고에 직군을 매긴 규칙(`classifyFamily`)을 그대로 쓰고,
 * 그 규칙이 공고 제목의 표현만 알아 놓치는 목표의 말(「ML 엔지니어」 · 「앱 개발」 · 「서버」)은 아래 표로 받는다.
 */
const GOAL_FAMILIES: readonly { family: JobFamily; pattern: RegExp }[] = [
  { family: "ML · AI", pattern: /(^|[^a-z])(ml|ai)([^a-z]|$)|머신\s?러닝|딥\s?러닝|인공지능/i },
  { family: "데이터", pattern: /데이터/ },
  { family: "보안", pattern: /보안/ },
  { family: "QA", pattern: /(^|[^a-z])qa([^a-z]|$)|테스트\s?엔지니어/i },
  { family: "인프라 · 플랫폼", pattern: /데브옵스|devops|(^|[^a-z])sre([^a-z]|$)|인프라|클라우드/i },
  { family: "모바일", pattern: /(^|[^a-z])(ios|android)([^a-z]|$)|안드로이드|모바일|앱\s?개발/i },
  { family: "프론트엔드", pattern: /프론트|웹\s?(개발|퍼블)/ },
  { family: "백엔드", pattern: /백엔드|서버/ },
];
export function goalFamily(work: string): JobFamily | null {
  const direct = classifyFamily(work, null);
  // 「개발 그 외」는 다른 갈래에 안 걸린 개발 직무다. 목표의 말이 아래 표에 걸리면 그쪽이 더 좁다.
  const aliased = GOAL_FAMILIES.find(item => item.pattern.test(work))?.family ?? null;
  return direct && direct !== "개발 그 외" ? direct : aliased ?? direct;
}
/** 신입 · 주니어를 향한 목표인가. 목표의 일과 시기 · 상황의 글에서 읽는다. */
const ENTRY_LEVEL = /신입|주니어|인턴|졸업|취준|첫\s?(직장|취업)|junior|entry[- ]level|new grad/i;

export class GoalDemandService {
  constructor(private readonly db: MongoContext) {}

  /**
   * 구직 목표의 일(`work`)로 표본을 모으고 요건을 센다.
   * 직군으로 분류되면 그 직군의 열린 공고를, 아니면 목표의 글이 제목 · 원문에 나오는 열린 공고를 최근 순으로 모은다.
   * 관심 표시한 공고 중 같은 범위에 드는 것은 마감했어도 표본에 넣는다.
   */
  async forGoal(userId: string, goal: { work: string; timing?: string }, at = new Date()): Promise<GoalDemand> {
    const db = mongoCollections(this.db.db);
    const { work } = goal;
    const family = goalFamily(work);
    const text = searchText(work);
    // 글로 찾을 때 영문 두 글자 이하의 낱말은 다른 낱말 안에서 잡힌다(`ml`이 `html`에서). 그런 목표는 찾지 않고 표본 없음으로 둔다.
    const scope = family ? { jobFamily: family } : text.length >= 3 || /[가-힣]{2,}/.test(text) ? { $or: ["title", "descriptionRaw"].map(field => ({ [field]: { $regex: escapeSearch(text), $options: "i" } })) } : null;
    const projection = { title: 1, descriptionRaw: 1, companyId: 1, experienceMinYears: 1, "requirements.technologies": 1 } as const;
    type Row = { _id: string; title: string; descriptionRaw: string | null; companyId: string | null; experienceMinYears: number | null; requirements?: { technologies?: unknown } };
    const posting = (row: Row) => ({ id: row._id, companyId: row.companyId ?? row._id, title: row.title, descriptionRaw: row.descriptionRaw, experienceMinYears: row.experienceMinYears ?? null, technologies: Array.isArray(row.requirements?.technologies) ? row.requirements.technologies.filter((item): item is string => typeof item === "string") : [] });
    let pool = scope ? (await db.jobPostings.find({ $and: [scope, { $or: [{ expiresAt: null }, { expiresAt: { $gte: at } }] }] }).project<Row>(projection).sort({ createdAt: -1, _id: 1 }).limit(DEMAND_SAMPLE_LIMIT * 3).toArray()).map(posting) : [];
    // 좁히기는 좁힌 뒤에도 표본이 충분할 때만 한다. 좁혀서 다섯 건이 안 되면 넓은 표본이 더 믿을 만하다.
    const narrow = (keep: (item: ReturnType<typeof posting>) => boolean) => { const kept = pool.filter(keep); if (kept.length < DEMAND_SMALL_SAMPLE) return false; pool = kept; return true; };
    const entry = ENTRY_LEVEL.test(`${work} ${goal.timing ?? ""}`) && narrow(item => item.experienceMinYears === null || item.experienceMinYears <= 2);
    const goalText = ` ${work.normalize("NFKC").toLocaleLowerCase("en-US")} `;
    const focusTerm = TECHNOLOGY_TERMS.find(term => term.pattern.test(goalText));
    const focused = !!focusTerm && narrow(item => demandHits(item).has(focusTerm.id));
    // 한 회사의 공고는 최근 것부터 정해진 수까지만 넣는다.
    const perCompany = new Map<string, number>();
    const sample = new Map<string, ReturnType<typeof posting>>();
    for (const item of pool) {
      const seen = perCompany.get(item.companyId) ?? 0;
      if (seen >= DEMAND_PER_COMPANY || sample.size >= DEMAND_SAMPLE_LIMIT) continue;
      perCompany.set(item.companyId, seen + 1); sample.set(item.id, item);
    }
    // 관심 표시한 공고는 사용자가 실제로 보는 자리다. 같은 범위에 들면 마감했어도, 회사 상한을 넘어도 넣는다.
    let interestedCount = 0;
    if (scope) {
      const interested = (await db.interests.find({ userId }).project<{ jobPostingId: string }>({ jobPostingId: 1 }).limit(200).toArray()).map(item => item.jobPostingId);
      if (interested.length) for (const row of await db.jobPostings.find({ $and: [scope, { _id: { $in: interested } }] }).project<Row>(projection).toArray()) { interestedCount += 1; sample.set(row._id, posting(row)); }
    }
    const postings = [...sample.values()];
    return {
      work, family, basis: family ? "family" : "keyword", focus: focused ? focusTerm!.label : null, level: entry ? "entry" : null,
      sampleSize: postings.length, companyCount: new Set(postings.map(item => item.companyId)).size, interestedCount, small: postings.length < DEMAND_SMALL_SAMPLE, items: countDemand(postings),
    };
  }
}
