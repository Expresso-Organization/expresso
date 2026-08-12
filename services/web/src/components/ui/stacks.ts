import type { Element, Root, RootContent, Text } from "hast";
import {
  siAndroid,
  siAngular,
  siApacheairflow,
  siApachehadoop,
  siApachekafka,
  siApachespark,
  siCplusplus,
  siCss,
  siDatadog,
  siDjango,
  siDocker,
  siElasticsearch,
  siElixir,
  siFastapi,
  siFigma,
  siFlask,
  siFlutter,
  siGit,
  siGithub,
  siGitlab,
  siGo,
  siGooglecloud,
  siGrafana,
  siGraphql,
  siHtml5,
  siIos,
  siJavascript,
  siJenkins,
  siJira,
  siKotlin,
  siKubernetes,
  siLinux,
  siMongodb,
  siMysql,
  siNextdotjs,
  siNodedotjs,
  siPhp,
  siPostgresql,
  siPrometheus,
  siPytorch,
  siPython,
  siReact,
  siRedis,
  siRuby,
  siRubyonrails,
  siRust,
  siScala,
  siSnowflake,
  siSpring,
  siSvelte,
  siSwift,
  siTailwindcss,
  siTensorflow,
  siTerraform,
  siTypescript,
  siVuedotjs,
} from "simple-icons";

import { VENDOR_LOGOS } from "./logos.vendor";

export type Logo = { hex: string; path: string; box: number };

/** simple-icons는 24×24에 단색 한 장이다. hex에 `#`이 없다. */
function si(icon: { hex: string; path: string }): Logo {
  return { hex: `#${icon.hex}`, path: icon.path, box: 24 };
}

/**
 * 칩이 될 스택들.
 *
 * 목록은 짐작이 아니라 **모아 둔 공고 162건을 세어서** 골랐다. 여기 없는 이름은
 * 그냥 글자로 남는다 — 그게 맞다. 로고가 없거나(SQL·gRPC·dbt) 뜻이 갈리는
 * 이름(Hive·Ray)을 억지로 칩으로 만들면, 칩이 "이건 기술이다"라고 하는 신호가
 * 값싸진다.
 *
 * `match`는 **대소문자를 가린다.** 소문자 `go`·`react`는 영어 동사고, 공고에서
 * 기술을 가리킬 때는 예외 없이 대문자로 적힌다.
 */
const STACKS: {
  slug: string;
  match: string[];
  logo: Logo;
  /** 이름이 기술이 아닐 수도 있을 때. 뒤따르는 글자를 보고 정한다. */
  guard?: (after: string) => boolean;
}[] = [
  // 언어
  { slug: "typescript", match: ["TypeScript"], logo: si(siTypescript) },
  { slug: "javascript", match: ["JavaScript"], logo: si(siJavascript) },
  { slug: "java", match: ["Java"], logo: VENDOR_LOGOS.java },
  { slug: "kotlin", match: ["Kotlin"], logo: si(siKotlin) },
  { slug: "python", match: ["Python"], logo: si(siPython) },
  { slug: "ruby", match: ["Ruby"], logo: si(siRuby) },
  { slug: "go", match: ["Golang", "Go"], logo: si(siGo), guard: goIsTheLanguage },
  { slug: "rust", match: ["Rust"], logo: si(siRust) },
  { slug: "swift", match: ["Swift"], logo: si(siSwift) },
  { slug: "scala", match: ["Scala"], logo: si(siScala) },
  { slug: "cpp", match: ["C++"], logo: si(siCplusplus) },
  { slug: "csharp", match: ["C#"], logo: VENDOR_LOGOS.csharp },
  { slug: "php", match: ["PHP"], logo: si(siPhp) },
  { slug: "elixir", match: ["Elixir"], logo: si(siElixir) },

  // 웹 앞단
  { slug: "react", match: ["React"], logo: si(siReact) },
  { slug: "vue", match: ["Vue.js", "Vue"], logo: si(siVuedotjs) },
  { slug: "angular", match: ["Angular"], logo: si(siAngular) },
  { slug: "svelte", match: ["Svelte"], logo: si(siSvelte) },
  { slug: "next", match: ["Next.js"], logo: si(siNextdotjs) },
  { slug: "node", match: ["Node.js"], logo: si(siNodedotjs) },
  { slug: "tailwind", match: ["Tailwind CSS", "TailwindCSS", "Tailwind"], logo: si(siTailwindcss) },
  { slug: "html", match: ["HTML5", "HTML"], logo: si(siHtml5) },
  { slug: "css", match: ["CSS3", "CSS"], logo: si(siCss) },

  // 웹 뒷단
  { slug: "spring", match: ["Spring Boot", "Spring"], logo: si(siSpring) },
  { slug: "django", match: ["Django"], logo: si(siDjango) },
  { slug: "rails", match: ["Ruby on Rails", "Rails"], logo: si(siRubyonrails) },
  { slug: "flask", match: ["Flask"], logo: si(siFlask) },
  { slug: "fastapi", match: ["FastAPI"], logo: si(siFastapi) },
  { slug: "graphql", match: ["GraphQL"], logo: si(siGraphql) },

  // 저장 · 흐름
  { slug: "postgres", match: ["PostgreSQL", "Postgres"], logo: si(siPostgresql) },
  { slug: "mysql", match: ["MySQL"], logo: si(siMysql) },
  { slug: "mongodb", match: ["MongoDB"], logo: si(siMongodb) },
  { slug: "redis", match: ["Redis"], logo: si(siRedis) },
  { slug: "elasticsearch", match: ["Elasticsearch", "ElasticSearch"], logo: si(siElasticsearch) },
  { slug: "kafka", match: ["Kafka"], logo: si(siApachekafka) },
  { slug: "spark", match: ["Spark"], logo: si(siApachespark) },
  { slug: "airflow", match: ["Airflow"], logo: si(siApacheairflow) },
  { slug: "hadoop", match: ["Hadoop"], logo: si(siApachehadoop) },
  { slug: "snowflake", match: ["Snowflake"], logo: si(siSnowflake) },

  // 인프라
  { slug: "aws", match: ["AWS"], logo: VENDOR_LOGOS.amazonwebservices },
  { slug: "gcp", match: ["Google Cloud", "GCP"], logo: si(siGooglecloud) },
  { slug: "azure", match: ["Azure"], logo: VENDOR_LOGOS.azure },
  { slug: "docker", match: ["Docker"], logo: si(siDocker) },
  { slug: "kubernetes", match: ["Kubernetes", "K8s", "k8s"], logo: si(siKubernetes) },
  { slug: "terraform", match: ["Terraform"], logo: si(siTerraform) },
  { slug: "linux", match: ["Linux"], logo: si(siLinux) },
  { slug: "jenkins", match: ["Jenkins"], logo: si(siJenkins) },
  { slug: "grafana", match: ["Grafana"], logo: si(siGrafana) },
  { slug: "prometheus", match: ["Prometheus"], logo: si(siPrometheus) },
  { slug: "datadog", match: ["Datadog", "DataDog"], logo: si(siDatadog) },

  // 학습
  { slug: "pytorch", match: ["PyTorch"], logo: si(siPytorch) },
  { slug: "tensorflow", match: ["TensorFlow"], logo: si(siTensorflow) },

  // 손안
  { slug: "android", match: ["Android"], logo: si(siAndroid) },
  { slug: "ios", match: ["iOS"], logo: si(siIos) },
  { slug: "flutter", match: ["Flutter"], logo: si(siFlutter) },

  // 곁
  { slug: "git", match: ["Git"], logo: si(siGit) },
  { slug: "github", match: ["GitHub"], logo: si(siGithub) },
  { slug: "gitlab", match: ["GitLab"], logo: si(siGitlab) },
  { slug: "figma", match: ["Figma"], logo: si(siFigma) },
  { slug: "jira", match: ["Jira"], logo: si(siJira) },
];

/**
 * `Go`가 언어인가.
 *
 * 두 글자짜리 영어 단어라, 이름 하나만으로는 정할 수 없다. 실제로 모아 둔
 * 공고에는 회사 가치라며 적어 둔 **"Go Further Together"**가 있다.
 *
 * 그래서 뒤를 본다. 공고에서 언어 Go는 늘 나열 안에 있거나(`Go, gRPC` ·
 * `Java, Go or Python`) 한국어 조사가 붙는다(`Go를` · `Go 기반`). 동사 Go는
 * 영어 단어가 뒤따른다(`Go to` · `Go Further`). 놓치는 쪽이 잘못 붙이는 쪽보다
 * 낫다 — 놓친 칩은 아무도 모르지만, `Go Further`에 고퍼가 붙으면 눈에 띈다.
 */
function goIsTheLanguage(after: string): boolean {
  const rest = after.replace(/^\s+/, "");
  if (rest === "") return true; // 줄 끝이거나 `**Go**`처럼 한 마디가 통째로 Go다
  if (!/^[A-Za-z]/.test(rest)) return true; // `,` `.` `/` `)` 이거나 한국어
  return /^(?:and|or|vs)\b/.test(rest); // `Go or Python`
}

const LOGOS = new Map(STACKS.map((stack) => [stack.slug, stack.logo]));

export function logoOf(slug: string): Logo | undefined {
  return LOGOS.get(slug);
}

const BY_TEXT = new Map(
  STACKS.flatMap((stack) => stack.match.map((text) => [text, stack] as const)),
);

/**
 * 이름 하나가 다른 이름 안에 들어 있는 경우가 많다 — `Java`는 `JavaScript`
 * 안에 있고 `Go`는 `Django` 안에 있다. 그래서 두 겹으로 막는다: 긴 이름을
 * 먼저 시도하고(정렬), 앞뒤가 낱말 경계인지 본다.
 *
 * 오른쪽 경계에서 숫자는 빼 준다 — `Java17` · `Python3`은 그 언어가 맞다.
 */
const PATTERN = new RegExp(
  `(?<![A-Za-z0-9+#_])(?:${[...BY_TEXT.keys()]
    .sort((a, b) => b.length - a.length)
    .map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?![A-Za-z+#_])`,
  "g",
);

/** 칩으로 바꾸지 않는 곳. 링크와 코드 안의 글자는 이미 제 뜻이 있다. */
const OPAQUE = new Set(["a", "code", "pre", "kbd", "samp"]);

/**
 * 본문에 적힌 스택 이름을 칩으로 바꾸는 rehype 플러그인.
 *
 * remark가 아니라 rehype인 이유: 마크다운 단계에서 바꾸면 `**Go**`처럼 강조
 * 안에 든 이름을 만나지 못한다. 마크업이 다 서고 난 뒤 글자 마디만 훑는 게
 * 훨씬 단순하다.
 */
export function rehypeStackChips() {
  return (tree: Root) => {
    walk(tree);
  };
}

function walk(node: Root | Element): void {
  const children: RootContent[] = [];
  let changed = false;
  for (const child of node.children) {
    if (child.type === "element") {
      if (!OPAQUE.has(child.tagName)) walk(child);
      children.push(child);
      continue;
    }
    if (child.type !== "text") {
      children.push(child);
      continue;
    }
    const split = toChips(child.value);
    if (split === null) {
      children.push(child);
      continue;
    }
    children.push(...split);
    changed = true;
  }
  if (changed) node.children = children as Element["children"];
}

export function toChips(value: string): (Text | Element)[] | null {
  const out: (Text | Element)[] = [];
  let cursor = 0;
  for (const hit of value.matchAll(PATTERN)) {
    const text = hit[0];
    const stack = BY_TEXT.get(text);
    if (!stack) continue;
    const at = hit.index;
    if (stack.guard && !stack.guard(value.slice(at + text.length))) continue;
    if (at > cursor) out.push({ type: "text", value: value.slice(cursor, at) });
    out.push({
      type: "element",
      tagName: "span",
      properties: { dataStack: stack.slug },
      children: [{ type: "text", value: text }],
    });
    cursor = at + text.length;
  }
  if (out.length === 0) return null;
  if (cursor < value.length) out.push({ type: "text", value: value.slice(cursor) });
  return out;
}

/**
 * 글에 나온 스택을 **처음 나온 차례로 한 번씩** 모은다.
 *
 * 본문의 칩과 달리 여기서는 겹치는 것을 접는다 — 상단 속성 줄은 "이 공고가
 * 무엇을 쓰는가"를 한눈에 보이는 자리라, Python이 다섯 번 나왔다고 다섯 번
 * 세우면 그 자리의 뜻이 사라진다.
 *
 * 이름은 **공고가 적은 표기 그대로** 들고 나온다(`Golang`이면 `Golang`).
 */
export function findStacks(text: string): { slug: string; text: string }[] {
  const first = new Map<string, string>();
  for (const hit of text.matchAll(PATTERN)) {
    const stack = BY_TEXT.get(hit[0]);
    if (!stack) continue;
    if (stack.guard && !stack.guard(text.slice(hit.index + hit[0].length))) continue;
    if (!first.has(stack.slug)) first.set(stack.slug, hit[0]);
  }
  return [...first].map(([slug, text]) => ({ slug, text }));
}

/**
 * 아무렇게나 적힌 이름을 아는 스택으로 되돌린다.
 *
 * 분석이 뽑아 둔 `job.technologies`는 `postgresql`처럼 소문자 슬러그로 오는데,
 * 우리 표는 사람이 읽는 표기(`PostgreSQL`)로 되어 있다. 점·빈칸·하이픈을 지우고
 * 소문자로 맞춰서 이 둘을 잇는다.
 */
export function resolveStack(name: string): string | null {
  return CANONICAL.get(flatten(name)) ?? null;
}

function flatten(value: string): string {
  return value.toLowerCase().replace(/[\s._-]/g, "");
}

const CANONICAL = new Map(
  STACKS.flatMap((stack) =>
    [stack.slug, ...stack.match].map((name) => [flatten(name), stack.slug] as const),
  ),
);

/** 플러그인이 심어 둔 표시를 읽는다. 아니면 null. */
export function stackSlugOf(properties: Record<string, unknown> | undefined): string | null {
  const slug = properties?.["dataStack"];
  return typeof slug === "string" && LOGOS.has(slug) ? slug : null;
}
