import { createHash } from "node:crypto";

import {
  DesignDocumentModelSchema,
  DesignSystemSpecV2Schema,
  ReferenceLockSchema,
  type DesignDocumentModel,
  type DesignDocumentSection,
  type DesignSampleEntry,
  type DesignSystemSpecV2,
  type ReferenceLock,
  type TokenRole,
} from "@expresso/contracts";

const SAMPLE_ENTRIES: DesignSampleEntry[] = [
  { kind: "hero", label: "Hero", value: "신뢰를 만드는 제품과 시스템을 설계합니다." },
  { kind: "case-study", label: "프로젝트 사례", value: "결제 시스템의 복구 시간을 줄인 과정" },
  { kind: "long-body", label: "긴 본문", value: "문제의 맥락, 선택한 접근, 검증한 결과를 순서대로 설명하는 사례 본문입니다." },
  { kind: "metric", label: "대표 수치", value: "복구 시간 42% 단축" },
  { kind: "before-after", label: "전후 비교", value: "분산된 대응 절차 → 한 화면의 복구 흐름" },
  { kind: "image", label: "이미지 사례", value: "프로젝트 아티팩트 자리" },
  { kind: "no-image", label: "이미지 없는 사례", value: "문제와 성과만으로 완결되는 텍스트 사례" },
  { kind: "tags", label: "기술 태그", value: "TypeScript · MySQL · 운영 자동화" },
  { kind: "quote", label: "인용", value: "중요한 일이 분명하게 읽히도록 만듭니다." },
  { kind: "link-contact", label: "연락 행동", value: "hello@example.com" },
  { kind: "footer", label: "Footer", value: "관찰하고, 설계하고, 검증한 작업" },
];

const COLOR_NAMES = [
  "canvas",
  "surface",
  "elevated",
  "text",
  "muted",
  "border",
  "accent",
  "action",
  "actionText",
] as const;

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function listLine(label: string, values: string[]): string {
  return `${label}: ${values.length > 0 ? values.map(normalizeLine).join(" · ") : "없음"}`;
}

function tokenRoleLine(prefix: string, value: TokenRole): string {
  return `${prefix} ${value.token}: ${normalizeLine(value.role)} — ${normalizeLine(value.usage)}`;
}

function section(id: string, title: string, body: string[]): DesignDocumentSection {
  return { id, title, body: body.map(normalizeLine) };
}

function sourceLines(spec: DesignSystemSpecV2, lock: ReferenceLock | null): string[] {
  const lines = [
    `원본 종류: ${spec.origin.kind}`,
    `원본 이름: ${spec.origin.sourceName ?? "없음"}`,
    `원본 URL: ${spec.origin.sourceUrl ?? "없음"}`,
    `수집 시각: ${spec.origin.capturedAt ?? "없음"}`,
    `출처 표기: ${spec.origin.attribution ?? "없음"}`,
  ];

  if (!lock) return [...lines, "ReferenceLock: 없음"];

  lines.push(
    `ReferenceLock: v${lock.version}`,
    `기준 디자인: ${lock.primaryDirection.designSystemCode} r${lock.primaryDirection.revision}`,
    listLine("적합한 이유", lock.fitReasons),
    listLine("보존할 특징", lock.preserve),
    listLine("빌린 세부 결정", lock.borrowedDetails),
    ...lock.tokenRoles.map((role) => tokenRoleLine("고정 토큰 역할", role)),
    `미디어 전략: ${lock.mediaStrategy.mode} — ${lock.mediaStrategy.fallback}`,
    `Signature Move: ${lock.signatureMove}`,
    listLine("제외 패턴", lock.reject),
  );

  if (lock.sources.length === 0) lines.push("ReferenceLock 출처: 없음");
  for (const [index, source] of lock.sources.entries()) {
    lines.push(
      `ReferenceLock 출처 ${index + 1}: ${source.name}`,
      `출처 ${index + 1} URL: ${source.url ?? "없음"}`,
      `출처 ${index + 1} 수집 시각: ${source.capturedAt ?? "없음"}`,
      `출처 ${index + 1} 관찰 신호: ${source.signal}`,
      `출처 ${index + 1} 표기: ${source.attribution ?? "없음"}`,
    );
  }
  return lines;
}

function assertDeclaredTokenReferences(
  spec: DesignSystemSpecV2,
  referenceLock: ReferenceLock | null,
): void {
  const declared = new Set([
    ...COLOR_NAMES.map((name) => name.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)),
    "display",
    "body",
    "mono",
    "base-unit",
    "element-gap",
    "component-gap",
    "section-gap",
    "content-width",
    "card-radius",
    "control-radius",
    "border-width",
    ...spec.typography.scale.map((step) => `type-${step.name}`),
  ]);
  const references = [
    ...spec.colors.roles.map(({ token }) => token),
    ...spec.rules.tokenRoles.map(({ token }) => token),
    ...Object.values(spec.components).flatMap(({ tokens }) => tokens),
    ...(referenceLock?.tokenRoles.map(({ token }) => token) ?? []),
  ];
  const unknown = references.find((token) => !declared.has(token));
  if (unknown) throw new Error(`Unknown design token reference: ${unknown}`);
}

export function buildDesignDocumentModel(
  input: DesignSystemSpecV2,
  referenceLockInput: ReferenceLock | null = null,
): DesignDocumentModel {
  const spec = DesignSystemSpecV2Schema.parse(input);
  const referenceLock = referenceLockInput
    ? ReferenceLockSchema.parse(referenceLockInput)
    : null;
  assertDeclaredTokenReferences(spec, referenceLock);

  const colorLines = COLOR_NAMES.map((name) => {
    const token = spec.colors[name];
    return `${name}: ${token.value} — ${token.role}`;
  });
  colorLines.push(
    ...spec.colors.roles.map((role) => tokenRoleLine("색상 역할", role)),
  );

  const typographyLines = [
    `Display: ${spec.typography.display.family}, ${spec.typography.display.fallback} — ${spec.typography.display.role}`,
    `Body: ${spec.typography.body.family}, ${spec.typography.body.fallback} — ${spec.typography.body.role}`,
    `Mono: ${spec.typography.mono.family}, ${spec.typography.mono.fallback} — ${spec.typography.mono.role}`,
    ...spec.typography.scale.map(
      (step) => `타입 계단 ${step.name}: ${step.size} / ${step.lineHeight}`,
    ),
    listLine("굵기", spec.typography.weights.map(String)),
    listLine("행간", spec.typography.lineHeights.map(String)),
    listLine("자간", spec.typography.letterSpacing),
    `본문 폭: ${spec.typography.measure}`,
  ];

  const componentLines = Object.entries(spec.components).flatMap(([name, rule]) => [
    `${name}: ${rule.description}`,
    listLine(`${name} 구조`, rule.anatomy),
    listLine(`${name} 토큰`, rule.tokens),
    listLine(`${name} Do`, rule.do),
    listLine(`${name} Don't`, rule.dont),
  ]);

  const sections = [
    section("direction", "디자인 이름과 시각 방향", [
      `이름: ${spec.identity.name}`,
      `설명: ${spec.identity.description}`,
      `시각 방향: ${spec.identity.visualThesis}`,
      listLine("핵심 특징", spec.identity.traits),
      listLine("Signature Move", spec.identity.signatureMoves),
    ]),
    section("colors", "색상 토큰과 역할", colorLines),
    section("typography", "타이포그래피 계단", typographyLines),
    section("components", "컴포넌트 규칙", componentLines),
    section("sample-portfolio", "공통 샘플 포트폴리오", SAMPLE_ENTRIES.map(
      (entry) => `${entry.label}: ${entry.value}`,
    )),
    section("imagery", "이미지 전략", [
      `모드: ${spec.imagery.mode}`,
      `비율: ${spec.imagery.aspectRatio}`,
      `처리: ${spec.imagery.treatment}`,
      `대체 방식: ${spec.imagery.fallback}`,
    ]),
    section("spacing", "간격과 구성", [
      `기본 단위: ${spec.spacing.baseUnit}px`,
      `요소 간격: ${spec.spacing.elementGap}px`,
      `컴포넌트 간격: ${spec.spacing.componentGap}px`,
      `섹션 간격: ${spec.spacing.sectionGap}px`,
      `콘텐츠 폭: ${spec.spacing.contentWidth}px`,
      `구조: ${spec.composition.structure}`,
      `밀도: ${spec.composition.density}`,
      `섹션 리듬: ${spec.composition.sectionRhythm}`,
      `위계: ${spec.composition.hierarchy}`,
      `표면 전략: ${spec.composition.surfaceStrategy}`,
    ]),
    section("shape", "반경, 테두리, 그림자", [
      `카드 반경: ${spec.shape.cardRadius}px`,
      `컨트롤 반경: ${spec.shape.controlRadius}px`,
      `테두리 두께: ${spec.shape.borderWidth}px`,
      `그림자: ${spec.shape.shadowStyle}`,
    ]),
    section("motion", "모션 규칙", [
      `성격: ${spec.motion.personality}`,
      `시간: ${spec.motion.duration}`,
      `감속: ${spec.motion.easing}`,
      `모션 감소: ${spec.motion.reducedMotion}`,
    ]),
    section("rules", "Do와 Don't", [
      ...spec.rules.do.map((value) => `Do: ${value}`),
      ...spec.rules.dont.map((value) => `Don't: ${value}`),
      ...spec.rules.tokenRoles.map((role) => tokenRoleLine("규칙 토큰 역할", role)),
    ]),
    section("source-revision", "출처와 판 정보", sourceLines(spec, referenceLock)),
  ];

  return DesignDocumentModelSchema.parse({
    version: 2,
    spec,
    referenceLock,
    sections,
    sampleEntries: SAMPLE_ENTRIES,
  });
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]<>#])/g, "\\$1");
}

export function renderDesignMarkdown(modelInput: DesignDocumentModel): string {
  const model = DesignDocumentModelSchema.parse(modelInput);
  const lines = [
    `# ${escapeMarkdown(model.spec.identity.name)}`,
    "",
    escapeMarkdown(model.spec.identity.visualThesis),
    "",
  ];

  for (const value of model.sections) {
    lines.push(
      `## ${escapeMarkdown(value.title)}`,
      "",
      ...value.body.map((line) => `- ${escapeMarkdown(line)}`),
      "",
    );
  }
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * WCAG 2.1 상대 휘도. 문서가 적는 명암비를 주장이 아니라 계산으로 만들기 위해 쓴다.
 * 임계값 0.03928은 WCAG 2.1 「relative luminance」 정의를 그대로 따른다.
 */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** 두 색 토큰의 명암비. 계약이 6자리 16진값만 허용하므로 언제나 계산할 수 있다. */
function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** WCAG 2.1 본문 기준. 3:1은 큰 글자에만 통과하므로 따로 적는다. */
function contrastLevel(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "미달";
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

function renderRuleSheet(value: DesignDocumentSection): string {
  return `<details class="rule-sheet"><summary>전체 규칙 보기 <span>${value.body.length}</span></summary><ul class="doc-lines">${value.body.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("")}</ul></details>`;
}

const COLOR_GROUPS = [
  { label: "지면과 표면", names: ["canvas", "surface", "elevated"] },
  { label: "글자와 경계", names: ["text", "muted", "border"] },
  { label: "강조와 행동", names: ["accent", "action", "actionText"] },
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 문서 전체가 쓰는 단 하나의 골격. 왼쪽에 이름표, 오른쪽에 내용, 위에 실선.
 * 값과 설명은 상자에 넣지 않는다. 테두리는 실제로 렌더한 견본에만 두른다.
 */
function row(label: string, body: string, modifier = ""): string {
  return `<div class="row${modifier ? ` ${modifier}` : ""}"><div class="row-label">${label}</div><div class="row-body">${body}</div></div>`;
}

function label(name: string, meta?: string): string {
  return `<strong>${escapeHtml(name)}</strong>${meta ? `<code>${escapeHtml(meta)}</code>` : ""}`;
}

function factList(
  items: { term: string; value: string; note?: string }[],
  monoTerm = true,
): string {
  return `<ul class="facts">${items.map(
    (item) => `<li>${monoTerm ? `<code>${escapeHtml(item.term)}</code>` : `<span class="term">${escapeHtml(item.term)}</span>`}<b>${escapeHtml(item.value)}</b>${item.note ? `<span>${escapeHtml(item.note)}</span>` : ""}</li>`,
  ).join("")}</ul>`;
}

function renderColorRows(spec: DesignSystemSpecV2): string {
  const swatches = (names: readonly string[]) => `<div class="swatch-set">${names.map((name) => {
    const token = spec.colors[name as keyof typeof spec.colors] as { value: string; role: string };
    return `<article class="swatch" data-token="${name}"><i style="background:var(--${name})"></i><strong>${name}</strong><code>${escapeHtml(token.value)}</code><span>${escapeHtml(token.role)}</span></article>`;
  }).join("")}</div>`;

  const pairs = [
    { term: "text / canvas", ratio: contrastRatio(spec.colors.text.value, spec.colors.canvas.value) },
    { term: "muted / canvas", ratio: contrastRatio(spec.colors.muted.value, spec.colors.canvas.value) },
    { term: "text / surface", ratio: contrastRatio(spec.colors.text.value, spec.colors.surface.value) },
    { term: "action-text / action", ratio: contrastRatio(spec.colors.actionText.value, spec.colors.action.value) },
  ];

  return `${COLOR_GROUPS.map((group) => row(label(group.label), swatches(group.names))).join("")}
  ${row(label("측정한 명암비", "WCAG 2.1"), factList(pairs.map(({ term, ratio }) => ({ term, value: formatRatio(ratio), note: contrastLevel(ratio) }))))}`;
}

function renderTypographyRows(spec: DesignSystemSpecV2): string {
  const ramp = spec.typography.scale.map((step) => row(
    label(step.name, `${step.size} / ${step.lineHeight}`),
    `<p class="specimen" style="font-size:var(--type-${step.name});line-height:var(--line-${step.name})">성과가 읽히는 첫 문장</p>`,
  )).join("");

  // 서체는 역할 문장이 길어 값 표가 아니라 줄 세 개로 둔다.
  const families = ([
    ["display", spec.typography.display],
    ["body", spec.typography.body],
    ["mono", spec.typography.mono],
  ] as const).map(([name, font]) => row(
    label(name, `${font.family} · ${font.fallback}`),
    `<p class="note">${escapeHtml(font.role)}</p>`,
    "row-tight",
  )).join("");

  const weights = `<p class="weight-line">${spec.typography.weights.map(
    (weight) => `<span style="font-weight:${weight}">Aa 성과<i>${weight}</i></span>`,
  ).join("")}</p>`;

  const tracking = `<p class="weight-line">${spec.typography.letterSpacing.map(
    (value) => `<span style="letter-spacing:${value}">성과를 읽는 방식<i>${escapeHtml(value)}</i></span>`,
  ).join("")}</p>`;

  return `${ramp}
  ${families}
  ${row(label("굵기"), weights)}
  ${row(label("자간"), tracking)}
  ${row(label("본문 폭", spec.typography.measure), `<p class="measure-proof">${escapeHtml(spec.typography.body.role)}. 본문은 이 폭을 넘지 않게 잡아 한 줄이 눈으로 따라가기 좋은 길이를 유지합니다.</p>`)}`;
}

function renderComponentPreview(name: string): string {
  if (name === "hero") return `<div class="demo demo-hero"><small>PORTFOLIO / 2026</small><strong>성과를 만드는<br>제품을 설계합니다.</strong><span class="act">작업 보기</span></div>`;
  if (name === "metric") return `<div class="demo demo-metric"><strong>42%</strong><span>복구 시간 단축</span><small>Q2 대비 · 12개월</small></div>`;
  if (name === "contact") return `<div class="demo demo-contact"><span class="act">프로젝트 열기 ↗</span><span class="act-quiet">hello@example.com</span></div>`;
  return `<div class="demo demo-case"><small>FEATURED CASE · 01</small><strong>복잡한 운영 흐름을<br>한 화면으로</strong><span>Product design · Engineering</span></div>`;
}

function renderComponentRows(spec: DesignSystemSpecV2): string {
  const controls = row(
    label("행동과 태그", `control-radius ${spec.shape.controlRadius}px`),
    `<div class="frame frame-row"><span class="act">Primary</span><span class="act-secondary">Secondary</span><span class="act-quiet">Text link ↗</span><span class="tag">TypeScript</span></div>`,
  );
  const components = Object.entries(spec.components).map(([name, rule]) => row(
    label(name, rule.tokens.join(" · ")),
    `<div class="frame">${renderComponentPreview(name)}</div><p class="note">${escapeHtml(rule.description)}</p><p class="note muted">${rule.anatomy.map(escapeHtml).join(" · ")}</p>`,
  )).join("");
  return `${controls}${components}`;
}

/** 계약이 선언한 비율을 CSS 값으로. 형식을 벗어나면 비율을 강제하지 않는다. */
function aspectRatio(value: string): string {
  const match = /^(\d+)\s*:\s*(\d+)$/.exec(value.trim());
  return match ? `aspect-ratio:${match[1]} / ${match[2]};` : "";
}

/** 이미지 자리. 선언한 비율과 반경으로 자른 고정 샘플 사진을 넣는다. */
function mediaPlate(spec: DesignSystemSpecV2, note: string, index = 0): string {
  return `<div class="media" style="${aspectRatio(spec.imagery.aspectRatio)}"><img src="${photoUrl(index, 720)}" alt="${escapeHtml(note)}" loading="lazy"></div>`;
}

function renderImageryRows(spec: DesignSystemSpecV2): string {
  return `${row(label("이미지 자리", `${spec.imagery.mode} · ${spec.imagery.aspectRatio}`), `<div class="media-set">${mediaPlate(spec, `이미지 자리 · ${spec.imagery.aspectRatio}`)}</div>`)}
  ${row(label("이미지가 없을 때"), `<p class="note">${escapeHtml(spec.imagery.fallback)}</p>`)}`;
}

function renderSpacingRows(spec: DesignSystemSpecV2): string {
  const steps = [
    { token: "base-unit", value: spec.spacing.baseUnit },
    { token: "element-gap", value: spec.spacing.elementGap },
    { token: "component-gap", value: spec.spacing.componentGap },
    { token: "section-gap", value: spec.spacing.sectionGap },
  ];
  const bars = steps.map((step) => row(
    label(step.token, `${step.value}px`),
    `<span class="bar" style="width:min(100%,${step.value}px)"></span>`,
    "row-tight",
  )).join("");
  return `${bars}
  ${row(label("content-width", `${spec.spacing.contentWidth}px`), `<p class="note mono">본문 폭 ${escapeHtml(spec.typography.measure)}</p>`, "row-tight")}
  ${row(label("위계"), `<p class="note">${escapeHtml(spec.composition.hierarchy)}</p>`)}
  ${row(label("표면 전략"), `<p class="note">${escapeHtml(spec.composition.surfaceStrategy)}</p>`)}
  ${row(label("구성 방식"), `<p class="note mono">${escapeHtml(spec.composition.structure)} · ${escapeHtml(spec.composition.density)}</p>`, "row-tight")}`;
}

function renderShapeRows(spec: DesignSystemSpecV2): string {
  return `${row(label("card-radius", `${spec.shape.cardRadius}px`), `<i class="proof proof-card"></i>`, "row-tight")}
  ${row(label("control-radius", `${spec.shape.controlRadius}px`), `<i class="proof proof-control"></i>`, "row-tight")}
  ${row(label("border-width", `${spec.shape.borderWidth}px`), `<i class="proof proof-border"></i>`, "row-tight")}
  ${row(label("shadow", spec.shape.shadowStyle), `<i class="proof proof-shadow"></i>`, "row-tight")}`;
}

function renderMotionRows(spec: DesignSystemSpecV2): string {
  return `${row(label("reveal", `${spec.motion.duration} · ${spec.motion.easing}`), `<i class="motion motion-rise"></i>`, "row-tight")}
  ${row(label("focus"), `<i class="motion motion-focus"></i>`, "row-tight")}
  ${row(label("reduced"), `<i class="motion motion-still"></i>`, "row-tight")}
  ${row(label("모션 감소"), `<p class="note">${escapeHtml(spec.motion.reducedMotion)}</p>`)}`;
}

function renderRulesRows(spec: DesignSystemSpecV2): string {
  const list = (values: string[]) => `<ul class="rule-list">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
  return `${row(label("Do"), list(spec.rules.do))}
  ${row(label("Don't"), list(spec.rules.dont))}`;
}

function sampleOf(model: DesignDocumentModel, kind: DesignSampleEntry["kind"]): DesignSampleEntry {
  return model.sampleEntries.find((entry) => entry.kind === kind)!;
}

/**
 * 견본에 쓰는 고정 사진. 모든 디자인이 같은 사진을 써야 차이가 디자인에서만 온다.
 * Unsplash 라이선스는 표기를 요구하지 않지만 출처는 문서의 출처 절에 남긴다.
 */
const SAMPLE_PHOTOS = [
  { id: "photo-1518455027359-f3f8164ba6bd", by: "James McDonald" },
  { id: "photo-1505209487757-5114235191e5", by: "Piotr Wilk" },
  { id: "photo-1587522384446-64daf3e2689a", by: "Andres Jasso" },
  { id: "photo-1449247709967-d4461a6a6103", by: "Bench Accounting" },
] as const;

function photoUrl(index: number, width: number): string {
  const photo = SAMPLE_PHOTOS[index % SAMPLE_PHOTOS.length]!;
  return `https://images.unsplash.com/${photo.id}?auto=format&fit=crop&w=${width}&q=70`;
}

/**
 * 웹폰트로 불러올 수 있는 서체. 계약의 서체 이름은 자유 문자열이라 아는 것만
 * 싣는다. 목록에 없으면 링크를 걸지 않고 선언한 대체 서체로 그린다.
 */
const WEB_FONTS: Record<string, string> = {
  Inter: "Inter:wght@400;500;600;700",
};

function fontLink(spec: DesignSystemSpecV2): string {
  const families = [spec.typography.display.family, spec.typography.body.family]
    .map((family) => WEB_FONTS[family])
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  if (families.length === 0) return "";
  const query = families.map((family) => `family=${family}`).join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${query}&display=swap">`;
}

/**
 * 고정 샘플 문안. 모든 디자인이 같은 내용을 쓰고, 차이는 디자인에서만 오게 한다.
 * 기준 문서 6.6 「공통 샘플 포트폴리오」.
 */
const DEMO = {
  role: "Product engineer · Seoul",
  name: "박민재",
  org: "Expresso",
  period: "2023 — 2026",
  project: "결제 시스템의 복구 시간을 줄인 과정",
  problem: "장애 대응 절차가 네 곳에 흩어져 있어 담당자마다 복구 경로가 달랐다",
  action: "복구 흐름을 한 화면으로 합치고 모든 실행에 로그를 남겼다",
  result: "복구 시간 42% 단축 · 동일 장애 재발 0건",
  method: "2025-09 ~ 2026-08 · 운영 로그 1,284건 기준",
  stack: ["TypeScript", "Node 24", "MySQL", "Redis", "BullMQ", "GitHub Actions"],
} as const;

function variant(name: string, body: string, kind?: DesignSampleEntry["kind"], wide = false): string {
  const anchor = kind ? ` data-sample-kind="${kind}"` : "";
  return `<figure class="variant${wide ? " variant-wide" : ""}"${anchor}><div class="frame">${body}</div><figcaption>${escapeHtml(name)}</figcaption></figure>`;
}

function eyebrow(value: string): string {
  return `<small class="v-eyebrow">${escapeHtml(value)}</small>`;
}

function metaRow(items: [string, string][]): string {
  return `<ul class="v-meta">${items.map(
    ([term, value]) => `<li><small>${escapeHtml(term)}</small><span>${escapeHtml(value)}</span></li>`,
  ).join("")}</ul>`;
}

function renderHeroVariants(model: DesignDocumentModel): string {
  const spec = model.spec;
  const hero = sampleOf(model, "hero");
  return [
    variant("큰 문장", `${eyebrow(DEMO.role)}<strong class="v-display">${escapeHtml(hero.value)}</strong><p class="v-lead">문제의 맥락과 선택한 접근, 검증한 결과를 순서대로 남깁니다.</p><div class="v-actions"><span class="act">대표 작업 보기</span><span class="act-quiet">소개 다운로드 ↗</span></div>`, "hero", true),
    variant("좌우 분할", `<div class="v-two"><div>${eyebrow(DEMO.role)}<strong>신뢰를 만드는<br>제품과 시스템</strong></div><div><p class="v-lead">운영에서 반복되던 문제를 구조로 바꾸는 일을 합니다.</p>${metaRow([["기간", DEMO.period], ["소속", DEMO.org], ["분야", "결제 · 플랫폼"]])}</div></div>`),
    variant("대표 수치 중심", `${eyebrow(DEMO.role)}<strong class="v-number">42%</strong><p class="v-lead">복구 시간 단축 · 지난 12개월</p>${metaRow([["재발", "0건"], ["배포 빈도", "3.1x"]])}`),
    variant("이미지 중심", `<div class="v-media-hero">${mediaPlate(spec, `대표 이미지 · ${spec.imagery.aspectRatio}`)}<div>${eyebrow(DEMO.role)}<strong>신뢰를 만드는 제품과 시스템</strong></div></div>`),
  ].join("");
}

function renderProjectVariants(model: DesignDocumentModel): string {
  const spec = model.spec;
  const caseStudy = sampleOf(model, "case-study");
  const noImage = sampleOf(model, "no-image");
  const longBody = sampleOf(model, "long-body");
  return [
    variant("문제-행동-결과", `${eyebrow("Case 01")}<strong>${escapeHtml(caseStudy.value)}</strong><dl class="v-par"><dt>문제</dt><dd>${DEMO.problem}</dd><dt>행동</dt><dd>${DEMO.action}</dd><dt>결과</dt><dd><b>${DEMO.result}</b></dd></dl>`, "no-image"),
    variant("긴 사례 연구", `${eyebrow("Case 02 · Featured")}<strong>${escapeHtml(caseStudy.value)}</strong><p class="v-body">${escapeHtml(longBody.value)}</p><p class="v-body">의사결정의 기준과 검증 방식까지 남겨 다음 작업에서 다시 사용할 수 있게 했습니다.</p>${metaRow([["역할", "설계 · 구현"], ["기간", "5개월"], ["스택", "Node · Redis"]])}<span class="act-quiet">사례 자세히 보기 ↗</span>`, "case-study", true),
    variant("수치 중심", `<div class="v-lead-metric"><strong class="v-number">42%</strong><div>${eyebrow("Case 01")}<strong>${escapeHtml(caseStudy.value)}</strong><p class="v-lead">복구 시간 단축</p></div></div>${metaRow([["재발", "0건"], ["대응 인원", "4 → 1명"], ["기간", "5개월"]])}`),
    variant("여러 프로젝트 비교", `${eyebrow("Selected work")}<table class="v-table v-table-wide"><thead><tr><th>프로젝트</th><th>성과</th><th>스택</th></tr></thead><tbody><tr><td>결제 복구 흐름</td><td><b>42%</b></td><td>Node · Redis</td></tr><tr><td>배포 자동화</td><td><b>3.1x</b></td><td>Actions</td></tr><tr><td>알림 정리</td><td><b>−68%</b></td><td>BullMQ</td></tr></tbody></table>`, undefined, true),
  ].join("");
}

function renderMetricVariants(model: DesignDocumentModel): string {
  const metric = sampleOf(model, "metric");
  const beforeAfter = sampleOf(model, "before-after");
  return [
    variant("큰 숫자 하나", `${eyebrow("Impact")}<strong class="v-number v-number-lg">42%</strong><p class="v-lead">${escapeHtml(metric.value)}</p><small class="v-note">${DEMO.method}</small>`, "metric"),
    variant("전후 비교", `${eyebrow("Before / After")}<div class="v-before"><div><small>이전</small><strong>18분</strong></div><i>→</i><div><small>이후</small><strong class="v-accent">10분</strong></div></div><p class="v-lead">${escapeHtml(beforeAfter.value)}</p><small class="v-note">${DEMO.method}</small>`, "before-after"),
    variant("수치 묶음", `${eyebrow("Metrics")}<div class="v-group"><article><strong>42%</strong><small>복구 시간 단축</small></article><article><strong>0건</strong><small>동일 장애 재발</small></article><article><strong>3.1x</strong><small>배포 빈도</small></article><article><strong>1,284</strong><small>분석한 운영 로그</small></article></div>`),
    variant("막대 비교", `${eyebrow("Recovery time")}<div class="v-bars"><article><small>2024</small><i style="width:100%"></i><b>18분</b></article><article><small>2025</small><i style="width:78%"></i><b>14분</b></article><article><small>2026</small><i class="v-bar-accent" style="width:56%"></i><b>10분</b></article></div><small class="v-note">${DEMO.method}</small>`),
    variant("도넛 또는 게이지", `${eyebrow("Automation")}<div class="v-gauge"><span class="gauge"><i></i></span><div><strong>75%</strong><small>사람 개입 없이 끝난 복구</small></div></div><small class="v-note">${DEMO.method}</small>`),
  ].join("");
}

function renderCareerVariants(): string {
  return [
    variant("세로 타임라인", `${eyebrow("Career")}<ol class="v-timeline"><li><b></b><div><small>2026 · ${DEMO.org}</small><span>플랫폼 리드</span><em>결제 신뢰성 전반</em></div></li><li><b></b><div><small>2024 · ${DEMO.org}</small><span>백엔드 엔지니어</span><em>복구 흐름 통합</em></div></li><li><b></b><div><small>2023 · 이전 조직</small><span>소프트웨어 엔지니어</span><em>결제 정산</em></div></li></ol>`),
    variant("조직별 묶음", `${eyebrow("Organizations")}<article class="v-org"><strong>${DEMO.org}</strong><small>${DEMO.period} · 플랫폼</small><ul class="v-linked"><li>플랫폼 리드 · 2026</li><li>백엔드 엔지니어 · 2024</li></ul></article><article class="v-org"><strong>이전 조직</strong><small>2021 — 2023 · 결제</small><ul class="v-linked"><li>소프트웨어 엔지니어</li></ul></article>`),
    variant("성과 중심", `${eyebrow("Achievements")}<ul class="v-achieve"><li><b>42%</b><span>복구 시간 단축<em>운영 로그 1,284건 기준</em></span></li><li><b>0건</b><span>동일 장애 재발<em>통합 이후 12개월</em></span></li><li><b>3.1x</b><span>배포 빈도<em>자동화 이후</em></span></li></ul>`),
  ].join("");
}

function renderSkillVariants(model: DesignDocumentModel): string {
  const tags = sampleOf(model, "tags");
  return [
    variant("태그", `${eyebrow("Skills")}<ul class="tag-set"><li>${escapeHtml(tags.value).replaceAll(" · ", "</li><li>")}</li><li>${DEMO.stack.slice(1).join("</li><li>")}</li></ul>`, "tags"),
    variant("숙련 근거", `${eyebrow("Evidence")}<ul class="v-evidence"><li><strong>TypeScript</strong><span>계약 스키마와 문서 컴파일러를 설계하고 구현</span></li><li><strong>MySQL</strong><span>마이그레이션 순서와 인덱스 설계</span></li><li><strong>Redis</strong><span>복구 흐름의 상태 저장과 큐 소비</span></li></ul>`),
    variant("기술 스택 표", `${eyebrow("Stack")}<table class="v-table"><tbody><tr><th>언어</th><td>TypeScript 5</td></tr><tr><th>런타임</th><td>Node 24 · Fastify</td></tr><tr><th>DB</th><td>MySQL 8</td></tr><tr><th>큐</th><td>Redis · BullMQ</td></tr><tr><th>CI</th><td>GitHub Actions</td></tr></tbody></table>`),
  ].join("");
}

function renderOtherVariants(model: DesignDocumentModel): string {
  const spec = model.spec;
  const longBody = sampleOf(model, "long-body");
  const image = sampleOf(model, "image");
  const quote = sampleOf(model, "quote");
  const contact = sampleOf(model, "link-contact");
  const footer = sampleOf(model, "footer");
  return [
    variant("본문", `${eyebrow("Body")}<p class="v-body">${escapeHtml(longBody.value)}</p><p class="v-body">${DEMO.problem}. ${DEMO.action}.</p><p class="v-body">${DEMO.result}.</p>`, "long-body", true),
    variant("이미지 갤러리", `${eyebrow("Gallery")}<div class="v-gallery">${mediaPlate(spec, escapeHtml(image.value), 1)}${mediaPlate(spec, "복구 대시보드", 2)}${mediaPlate(spec, "장애 리뷰", 3)}</div>`, "image", true),
    variant("인용", `${eyebrow("Quote")}<blockquote class="v-quote">${escapeHtml(quote.value)}</blockquote><div class="v-profile"><i class="avatar"></i><div><strong>함께 일한 동료</strong><small>${DEMO.org} · 제품</small></div></div>`, "quote"),
    variant("프로필", `<div class="v-profile"><i class="avatar avatar-lg"></i><div><strong>${DEMO.name}</strong><small>${DEMO.role}</small></div></div><p class="v-body">운영에서 반복되던 문제를 구조로 바꾸는 일을 합니다. 기록과 검증을 함께 남깁니다.</p>${metaRow([["소속", DEMO.org], ["기간", DEMO.period]])}`),
    variant("연락", `${eyebrow("Contact")}<strong>다음 문제를 함께 풀어볼까요?</strong><p class="v-lead">${escapeHtml(contact.value)}</p><div class="v-actions"><span class="act">대화 시작하기 ↗</span><span class="act-quiet">이력서 ↗</span></div>`, "link-contact"),
    variant("푸터", `<div class="v-footer"><strong>MP.</strong><p>${escapeHtml(footer.value)}</p></div>${metaRow([["Work", "선택한 작업"], ["About", "소개"], ["Contact", "연락"]])}<small class="v-note">© 2026 ${DEMO.name}</small>`, "footer"),
  ].join("");
}

function renderSampleGallery(model: DesignDocumentModel): string {
  const groups: [string, string, string][] = [
    ["Hero", "첫 화면", renderHeroVariants(model)],
    ["프로젝트", "사례", renderProjectVariants(model)],
    ["수치", "지표", renderMetricVariants(model)],
    ["경력", "이력", renderCareerVariants()],
    ["기술", "스택", renderSkillVariants(model)],
    ["기타", "본문과 마무리", renderOtherVariants(model)],
  ];
  return groups.map(([name, meta, body]) => row(label(name, meta), `<div class="variant-grid">${body}</div>`, "row-wide")).join("");
}

function renderSourceRows(model: DesignDocumentModel, markdownSha256: string): string {
  const spec = model.spec;
  const lock = model.referenceLock;
  const rows: [string, string][] = [
    ["디자인 시스템", `${spec.identity.name} · Specification v${spec.version}`],
    ["원본", `${spec.origin.sourceName ?? "Expresso"} · ${spec.origin.kind}`],
    ["원본 URL", spec.origin.sourceUrl ?? "없음"],
    ["수집 시각", spec.origin.capturedAt ?? "없음"],
    ["판", lock ? `${lock.primaryDirection.designSystemCode} r${lock.primaryDirection.revision}` : "r1"],
    ["DESIGN.md sha256", markdownSha256],
    ["샘플 사진", `Unsplash · ${SAMPLE_PHOTOS.map((photo) => photo.by).join(" · ")}`],
  ];
  return rows.map(([name, value]) => row(label(name), `<p class="note mono">${escapeHtml(value)}</p>`, "row-tight")).join("");
}

/** 절의 한 문장. 지어내지 않고 계약이 이미 단언한 문장만 그 자리에 놓는다. */
function sectionSentence(spec: DesignSystemSpecV2, id: string): string | null {
  const moves = spec.identity.signatureMoves;
  const map: Record<string, string | null | undefined> = {
    colors: spec.composition.surfaceStrategy,
    typography: moves[0],
    "sample-portfolio": "모든 디자인이 같은 내용을 씁니다. 화면의 차이는 전부 디자인에서 옵니다.",
    imagery: spec.imagery.treatment,
    spacing: spec.composition.sectionRhythm,
    shape: spec.components.card?.description,
    motion: spec.motion.personality,
    rules: moves[1] ?? moves[0],
    "source-revision": spec.origin.attribution,
  };
  return map[id] ?? null;
}

function renderShowcaseSection(
  model: DesignDocumentModel,
  value: DesignDocumentSection,
  index: number,
  markdownSha256: string,
): string {
  const spec = model.spec;
  let body = "";

  if (value.id === "colors") body = renderColorRows(spec);
  else if (value.id === "typography") body = renderTypographyRows(spec);
  else if (value.id === "components") body = renderComponentRows(spec);
  else if (value.id === "sample-portfolio") body = renderSampleGallery(model);
  else if (value.id === "imagery") body = renderImageryRows(spec);
  else if (value.id === "spacing") body = renderSpacingRows(spec);
  else if (value.id === "shape") body = renderShapeRows(spec);
  else if (value.id === "motion") body = renderMotionRows(spec);
  else if (value.id === "rules") body = renderRulesRows(spec);
  else if (value.id === "source-revision") body = renderSourceRows(model, markdownSha256);

  const sentence = sectionSentence(spec, value.id);
  const head = row(
    `<span class="index">${pad2(index + 1)}</span>`,
    `<h2>${escapeHtml(value.title)}</h2>${sentence ? `<p class="sentence">${escapeHtml(sentence)}</p>` : ""}`,
    "row-head",
  );

  return `<section id="${value.id}" class="doc-section section-${value.id}" data-design-section="${value.id}">${head}${body}${renderRuleSheet(value)}</section>`;
}

function renderLegacySample(entry: DesignSampleEntry): string {
  const label = escapeHtml(entry.label);
  const value = escapeHtml(entry.value);
  const body = entry.kind === "tags"
    ? `<ul class="tags"><li>${value.replaceAll(" · ", "</li><li>")}</li></ul>`
    : entry.kind === "quote"
      ? `<blockquote>${value}</blockquote>`
      : entry.kind === "link-contact"
        ? `<span class="contact-action">${value}</span>`
        : entry.kind === "image"
          ? `<div class="image-placeholder" role="img" aria-label="${value}">${value}</div>`
          : `<p>${value}</p>`;
  return `<article class="sample sample-${entry.kind}" data-sample-kind="${entry.kind}"><h3>${label}</h3>${body}</article>`;
}

function renderLegacySection(
  model: DesignDocumentModel,
  value: DesignDocumentSection,
): string {
  const lines = `<ul class="doc-lines">${value.body.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("")}</ul>`;
  const example = value.id === "colors"
    ? `<div class="token-grid">${COLOR_NAMES.map(
      (name) => `<div class="swatch" data-token="${name}"><span style="background:var(--${name})"></span><b>${name}</b></div>`,
    ).join("")}</div>`
    : value.id === "typography"
      ? `<div class="type-sample"><strong>성과가 읽히는 첫 문장</strong><p>문제와 선택, 결과를 차분하게 연결하는 본문입니다.</p><code>recovery_time -42%</code></div>`
      : value.id === "spacing"
        ? `<div class="spacing-sample"><i></i><i></i><i></i></div>`
        : value.id === "shape"
          ? `<div class="shape-sample"><span>Card</span><button type="button">Control</button></div>`
          : value.id === "components"
            ? `<div class="component-sample"><article><b>대표 성과</b><p>복구 시간을 42% 줄였습니다.</p></article><span class="contact-action">프로젝트 보기</span></div>`
            : value.id === "imagery"
              ? `<div class="image-placeholder" role="img" aria-label="디자인 이미지 전략 예시">4:3 project artifact</div>`
              : value.id === "motion"
                ? `<div class="motion-sample">상태 변화에만 쓰는 모션</div>`
                : value.id === "rules"
                  ? `<div class="rule-comparison"><span>Do</span><span>Don't</span></div>`
                  : value.id === "sample-portfolio"
                    ? `<div class="sample-grid">${model.sampleEntries.map(renderLegacySample).join("")}</div>`
                    : "";
  return `<section id="${value.id}" data-design-section="${value.id}"><h2>${escapeHtml(value.title)}</h2>${lines}${example}</section>`;
}

function cssVariables(spec: DesignSystemSpecV2): string {
  const colors = COLOR_NAMES.map(
    (name) => `--${name}:${spec.colors[name].value};`,
  ).join("");
  const fonts = ["display", "body", "mono"].map((name) => {
    const font = spec.typography[name as keyof Pick<typeof spec.typography, "display" | "body" | "mono">];
    return `--font-${name}:${font.family},${font.fallback};`;
  }).join("");
  const steps = spec.typography.scale.map(
    (step) => `--type-${step.name}:${step.size};--line-${step.name}:${step.lineHeight};`,
  ).join("");
  const bodyStep = spec.typography.scale[0]!;
  const headingStep = spec.typography.scale[Math.max(0, spec.typography.scale.length - 2)]!;
  const displayStep = spec.typography.scale.at(-1)!;
  const exampleSteps = `--type-example-body:${bodyStep.size};--line-example-body:${bodyStep.lineHeight};--type-example-heading:${headingStep.size};--line-example-heading:${headingStep.lineHeight};--type-example-display:${displayStep.size};--line-example-display:${displayStep.lineHeight};`;
  const shadow = {
    none: "none",
    hairline: "0 1px 0 var(--border)",
    soft: "0 12px 30px color-mix(in srgb,var(--text) 10%,transparent)",
    layered: "0 2px 4px color-mix(in srgb,var(--text) 8%,transparent),0 18px 40px color-mix(in srgb,var(--text) 12%,transparent)",
  }[spec.shape.shadowStyle];
  return `${colors}${fonts}${steps}${exampleSteps}--measure:${spec.typography.measure};--base-unit:${spec.spacing.baseUnit}px;--element-gap:${spec.spacing.elementGap}px;--component-gap:${spec.spacing.componentGap}px;--section-gap:${spec.spacing.sectionGap}px;--content-width:${spec.spacing.contentWidth}px;--card-radius:${spec.shape.cardRadius}px;--control-radius:${spec.shape.controlRadius}px;--border-width:${spec.shape.borderWidth}px;--motion-duration:${spec.motion.duration};--motion-easing:${spec.motion.easing};--shadow:${shadow};`;
}

function isAppleShowcase(model: DesignDocumentModel): boolean {
  return model.referenceLock?.primaryDirection.designSystemCode === "refero-apple";
}

/**
 * 문서에 심는 유일한 스크립트. 계약에서 온 문자열을 단 한 글자도 끼워 넣지 않는
 * 고정 상수다. CSP 는 이 내용의 sha256 만 script-src 에 허용하므로, 주입된
 * 스크립트는 해시가 달라 그대로 차단된다.
 *
 * 하는 일은 셋이다 — 견본에 transitions-dev 의 클래스를 붙이고, 수치를 자리마다
 * 굴러 올라오는 릴로 바꾸고, 화면에 들어온 견본만 재생한다.
 */
const MOTION_SCRIPT = `(function(){
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  var root = document.documentElement;
  function ms(name){ return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0; }
  var stagger = ms("--reel-stagger");
  var cycle = ms("--replay-cycle");

  var REEL = ".v-number,.v-before strong,.v-group strong,.v-achieve b,.v-gauge strong,.v-compare span,.v-bars b,.v-table-wide b";
  var INNER = ".v-timeline>li,.v-achieve>li,.v-evidence>li,.v-linked>li,.tag-set>li,.v-group>article,.v-bars>article,.v-compare>article,.v-meta>li,.v-par>dt,.v-par>dd,.v-table tbody tr,.v-gallery>*,.v-org";

  /* 26-spinning-counter 의 릴. 목표 숫자 앞 세 칸만 지나가고 멈춘다. */
  function buildReel(el){
    var text = el.textContent;
    var size = parseFloat(getComputedStyle(el).fontSize) || 16;
    var cell = Math.round(size * 1.1);
    el.textContent = "";
    el.classList.add("t-reel");
    el.style.setProperty("--reel-cell", cell + "px");
    var strips = [];
    for (var i = 0; i < text.length; i++){
      var ch = text.charAt(i);
      var col = document.createElement("span");
      col.className = "t-reel-col";
      var strip = document.createElement("span");
      strip.className = "t-reel-strip";
      var cells = [];
      if (ch >= "0" && ch <= "9"){
        var target = Number(ch);
        for (var lead = 3; lead >= 0; lead--) cells.push(String((target - lead + 10) % 10));
      } else {
        cells.push(" ", ch);
      }
      for (var c = 0; c < cells.length; c++){
        var digit = document.createElement("span");
        digit.className = "t-reel-digit";
        digit.textContent = cells[c];
        strip.appendChild(digit);
      }
      strip.style.setProperty("--reel-travel", -(cells.length - 1) * cell + "px");
      col.appendChild(strip);
      el.appendChild(col);
      strips.push(strip);
    }
    el.reelStrips = strips;
  }

  function rollReel(el){
    var strips = el.reelStrips || [];
    for (var i = 0; i < strips.length; i++){
      var strip = strips[i];
      strip.style.transition = "none";
      strip.style.transform = "translateY(0)";
      void strip.offsetHeight;
      strip.style.transition = "transform var(--reel-dur) var(--reel-ease) " + (i * stagger) + "ms";
      strip.style.transform = "translateY(var(--reel-travel))";
    }
  }

  /* 숨김 클래스는 재생 직전에만 붙인다. 미리 붙여 두면 관찰자가 한 번이라도
     어긋난 카드가 빈 상자로 남는다. */
  function prepare(frame){
    if (frame.getAttribute("data-motion") === "ready") return;
    frame.setAttribute("data-motion", "ready");
    frame.classList.add("t-stagger");
    var lines = frame.children;
    for (var l = 0; l < lines.length; l++){
      lines[l].classList.add("t-stagger-line");
      lines[l].style.setProperty("--i", l);
    }
    var inner = frame.querySelectorAll(INNER);
    for (var n = 0; n < inner.length; n++){
      inner[n].classList.add("t-stagger-line");
      inner[n].style.setProperty("--i", n + 1);
    }
    var reels = frame.querySelectorAll(REEL);
    for (var r = 0; r < reels.length; r++) buildReel(reels[r]);
  }

  var frames = document.querySelectorAll(".variant .frame");

  function play(frame){
    prepare(frame);
    frame.classList.remove("is-shown");
    void frame.offsetHeight;
    frame.classList.add("is-shown");
    var reels = frame.querySelectorAll(".t-reel");
    for (var i = 0; i < reels.length; i++) rollReel(reels[i]);
  }

  /* 화면에 들어온 견본만 재생하고, 나가면 멈춘다. */
  if (typeof IntersectionObserver !== "function") return;

  var timers = new WeakMap();
  var io = new IntersectionObserver(function(entries){
    for (var i = 0; i < entries.length; i++){
      var frame = entries[i].target;
      if (entries[i].isIntersecting){
        if (timers.has(frame)) continue;
        play(frame);
        timers.set(frame, setInterval(play.bind(null, frame), cycle));
      } else if (timers.has(frame)){
        clearInterval(timers.get(frame));
        timers["delete"](frame);
      }
    }
  }, { threshold: 0.3 });
  for (var o = 0; o < frames.length; o++) io.observe(frames[o]);
})();`;

function renderAppleShowcaseHtml(
  model: DesignDocumentModel,
  markdownSha256: string,
): string {
  const spec = model.spec;
  const title = escapeHtml(spec.identity.name);
  const thesis = escapeHtml(spec.identity.visualThesis);
  const variables = cssVariables(spec);
  const revision = model.referenceLock?.primaryDirection.revision ?? 1;
  const bodyContrast = contrastRatio(spec.colors.text.value, spec.colors.canvas.value);
  const scriptHash = createHash("sha256").update(MOTION_SCRIPT).digest("base64");
  const direction = model.sections.find((value) => value.id === "direction")!;
  const sections = model.sections
    .filter((value) => value.id !== "direction")
    .map((value, index) => renderShowcaseSection(model, value, index, markdownSha256))
    .join("");

  // 이 디자인이 어떻게 생겼는지는 값을 적어서가 아니라 그려서 보여 준다.
  // 네 칸이 서체 · 지면 · 행동 · 형태를 실제 크기와 실제 색으로 그린다.
  const displayStep = spec.typography.scale.at(-1)!;
  const glance = `<div class="glance">
    <figure><div class="glance-figure glance-type"><span>Aa</span></div><figcaption>${escapeHtml(spec.typography.display.family)} · ${escapeHtml(displayStep.size)} / ${escapeHtml(displayStep.lineHeight)}</figcaption></figure>
    <figure><div class="glance-figure glance-ground"><i><b></b><b></b></i><i><b></b><b></b></i></div><figcaption>${escapeHtml(spec.colors.canvas.value)} / ${escapeHtml(spec.colors.surface.value)} 교차 · 본문 대비 ${formatRatio(bodyContrast)} ${contrastLevel(bodyContrast)}</figcaption></figure>
    <figure><div class="glance-figure glance-action"><span class="act">행동 하나</span></div><figcaption>${escapeHtml(spec.colors.action.value)} · 반경 ${spec.shape.controlRadius}px</figcaption></figure>
    <figure><div class="glance-figure glance-shape"><i></i></div><figcaption>카드 반경 ${spec.shape.cardRadius}px · 경계 ${spec.shape.borderWidth}px · shadow ${escapeHtml(spec.shape.shadowStyle)}</figcaption></figure>
  </div>`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://images.unsplash.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'sha256-${scriptHash}'">
<meta name="design-spec-version" content="2">
<meta name="design-md-sha256" content="${markdownSha256}">
<title>${title} — DESIGN</title>
${fontLink(spec)}
<style>
/*
  이 문서는 골격 하나로만 이뤄진다 — 왼쪽 이름표, 오른쪽 내용, 위에 실선.
  값과 설명에는 테두리를 두르지 않는다. 테두리는 실제로 렌더한 견본에만 쓴다.
  껍데기의 반경과 크기는 --doc-* 로 고정하고, 시스템 토큰은 견본 안에서만 쓴다.
  틀이 견본과 같은 형태를 쓰면 어디까지가 문서인지 구분되지 않기 때문이다.
*/
:root{${variables}--duration-micro:80ms;--duration-quick:150ms;--duration-fast:250ms;--duration-slow:400ms;--duration-very-slow:500ms;--ease-smooth-out:cubic-bezier(0.22, 1, 0.36, 1);--ease-in-out:ease-in-out;--stagger-dur:500ms;--stagger-distance:12px;--stagger-stagger:40ms;--stagger-blur:3px;--stagger-ease:cubic-bezier(0.22, 1, 0.36, 1);--reel-dur:900ms;--reel-cell:30px;--reel-stagger:60ms;--reel-ease:cubic-bezier(0.16, 1, 0.3, 1);--replay-cycle:9000ms;--hairline:color-mix(in srgb,var(--border) 50%,transparent);--ink-muted:color-mix(in srgb,var(--canvas) 66%,var(--text));--doc-radius:10px;--column:min(calc(100% - 48px),var(--content-width));--rail:172px;--rail-gap:36px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-body);font-size:13px;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
h1,h2,h3,p,ol,ul,dl,blockquote,figure{margin:0;padding:0}
li{list-style:none}
code{font-family:var(--font-mono)}

.nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:24px;height:50px;padding:0 max(24px,calc((100vw - var(--content-width))/2));border-bottom:1px solid var(--hairline);background:color-mix(in srgb,var(--canvas) 88%,transparent);backdrop-filter:saturate(180%) blur(18px)}
.nav strong{font-family:var(--font-display);font-size:14px;letter-spacing:-.03em}
.nav ul{display:flex;gap:18px}
.nav a{color:var(--muted);font-size:11px;text-decoration:none}
.nav a:hover{color:var(--text)}
.nav>span{margin-left:auto;color:var(--muted);font-family:var(--font-mono);font-size:10px}

.row{display:grid;grid-template-columns:var(--rail) minmax(0,1fr);gap:var(--rail-gap);padding:26px 0;border-top:1px solid var(--hairline)}
.row-tight{padding:15px 0;align-items:center}
.row-wide{grid-template-columns:1fr;gap:14px}
.row-head{padding:0 0 30px;border-top:0}
.row-label strong{display:block;font-size:12px;font-weight:600;letter-spacing:-.01em}
.row-label code{display:block;margin-top:4px;color:var(--muted);font-size:10px;line-height:1.5}
.index{color:var(--muted);font-family:var(--font-mono);font-size:11px;letter-spacing:.1em}
.row-head h2{font-family:var(--font-display);font-size:clamp(26px,3.2vw,38px);font-weight:600;line-height:1.08;letter-spacing:-.04em}
.sentence{max-width:44ch;margin-top:14px;color:var(--muted);font-size:15px;line-height:1.55}
.note{max-width:56ch;font-size:13px;line-height:1.65}
.note.muted{margin-top:6px;color:var(--muted);font-size:12px}
.note.mono{font-family:var(--font-mono);font-size:11px;color:var(--text)}

.cover{width:var(--column);margin:0 auto;display:grid;grid-template-columns:var(--rail) minmax(0,1fr);gap:var(--rail-gap);padding:clamp(60px,9vw,120px) 0 clamp(40px,5vw,64px)}
.cover>span{color:var(--muted);font-family:var(--font-mono);font-size:10px;letter-spacing:.1em}
.cover h1{font-family:var(--font-display);font-size:var(--type-example-display);font-weight:600;line-height:.94;letter-spacing:-.05em}
.cover p{max-width:32ch;margin-top:18px;color:var(--muted);font-size:17px;line-height:1.5}
.cover-actions{display:flex;align-items:center;gap:8px;margin-top:30px}
.act,.act-secondary,.act-quiet{display:inline-flex;align-items:center;justify-content:center;width:max-content;padding:9px 16px;border:var(--border-width) solid transparent;border-radius:var(--control-radius);background:var(--action);color:var(--actionText);font-family:var(--font-body);font-size:12px;text-decoration:none}
.act-secondary{border-color:var(--action);background:transparent;color:var(--action)}
.act-quiet{padding-inline:6px;background:transparent;color:var(--action)}
.tag{display:inline-flex;padding:6px 11px;border:var(--border-width) solid var(--border);border-radius:var(--control-radius);color:var(--muted);font-size:11px}
.palette{display:flex;height:104px;border-block:1px solid var(--hairline)}
.palette i{flex:1;border-right:1px solid var(--hairline)}
.palette i:last-child{border-right:0}
.cover-rows{width:var(--column);margin:0 auto}
.glance{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.glance figure{overflow:hidden;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.glance-figure{display:grid;place-items:center;height:152px;overflow:hidden}
.glance figcaption{padding:12px 14px;border-top:1px solid var(--hairline);color:var(--muted);font-family:var(--font-mono);font-size:10px;line-height:1.6}
.glance-type span{font-family:var(--font-display);font-size:var(--type-example-display);font-weight:600;line-height:1;letter-spacing:-.05em;white-space:nowrap}
.glance-ground{display:block}
.glance-ground i{display:grid;align-content:center;gap:8px;width:100%;height:50%;padding:0 22px}
.glance-ground i:first-child{background:var(--canvas);border-bottom:1px solid var(--hairline)}
.glance-ground i:last-child{background:var(--surface)}
.glance-ground b{display:block;height:7px;border-radius:4px;background:var(--text)}
.glance-ground b:last-child{width:58%;background:var(--muted)}
.glance-shape i{display:block;width:58%;height:58%;border:var(--border-width) solid var(--border);border-radius:var(--card-radius);background:var(--surface);box-shadow:var(--shadow)}

.doc-section{width:var(--column);margin:0 auto;padding:clamp(54px,6vw,88px) 0;border-top:1px solid var(--border)}

.swatch-set{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:20px}
.swatch i{display:block;height:68px;border-radius:6px;box-shadow:inset 0 0 0 1px var(--border)}
.swatch strong{display:block;margin-top:12px;font-size:12px;font-weight:600}
.swatch code{display:block;margin-top:2px;color:var(--muted);font-size:10px}
.swatch span{display:block;margin-top:8px;color:var(--muted);font-size:11px;line-height:1.5}
.facts{max-width:540px}
.facts li{display:grid;grid-template-columns:minmax(0,1fr) 92px 56px;gap:12px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--hairline)}
.facts li:last-child{border-bottom:0}
.facts code,.facts .term{color:var(--muted);font-size:11px}
.facts .term{font-family:var(--font-body);font-size:12px;text-align:left}
.facts b{font-family:var(--font-mono);font-size:12px;font-weight:400}
.facts span{color:var(--muted);font-size:11px;text-align:right}

.specimen{font-family:var(--font-display);font-weight:600;letter-spacing:-.03em}
.weight-line{display:flex;flex-wrap:wrap;gap:8px 30px;align-items:baseline}
.weight-line span{font-family:var(--font-display);font-size:21px;letter-spacing:-.02em}
.weight-line i{margin-left:8px;color:var(--muted);font-family:var(--font-mono);font-size:10px;font-style:normal;font-weight:400;letter-spacing:0}
.measure-proof{max-width:var(--measure);color:var(--muted);font-size:13px;line-height:1.7}

.frame{padding:26px;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.frame-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.demo{display:flex;flex-direction:column;min-height:148px}
.demo small{color:var(--muted);font-family:var(--font-mono);font-size:9px;letter-spacing:.1em}
.demo strong{margin:14px 0 auto;font-family:var(--font-display);font-size:26px;font-weight:600;line-height:1.1;letter-spacing:-.04em}
.demo-hero .act{margin-top:16px}
.demo-case span{margin-top:12px;color:var(--muted);font-size:11px}
.demo-metric{justify-content:center}
.demo-metric strong{margin:0;font-size:56px;line-height:1;letter-spacing:-.06em}
.demo-metric span{margin-top:6px;font-size:14px}
.demo-metric small{margin-top:6px}
.demo-contact{flex-direction:row;align-items:center;justify-content:center;gap:14px}
.rule-list{margin-top:18px}
.rule-list li{padding:9px 0;border-bottom:1px solid var(--hairline);font-size:13px;line-height:1.6}
.rule-list li:last-child{border-bottom:0}

.bar{display:block;height:8px;border-radius:999px;background:var(--action)}
.proof{display:block;width:64px;height:44px;background:var(--text)}
.proof-card{border-radius:var(--card-radius)}
.proof-control{border-radius:var(--control-radius)}
.proof-border{border:var(--border-width) solid var(--text);border-radius:6px;background:transparent}
.proof-shadow{border:1px solid var(--hairline);border-radius:6px;background:var(--canvas);box-shadow:var(--shadow)}
.motion{display:block;width:56px;height:56px;border-radius:calc(var(--card-radius) * .7);background:var(--action)}
.motion-rise{animation:doc-rise calc(var(--motion-duration) * 3) var(--motion-easing) infinite alternate}
.motion-focus{animation:doc-focus calc(var(--motion-duration) * 3) var(--motion-easing) infinite alternate}
.motion-still{background:var(--surface);border:1px solid var(--border)}
@keyframes doc-rise{from{opacity:.25;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes doc-focus{from{transform:scale(.86)}to{transform:scale(1.06)}}

.media{overflow:hidden;width:100%;border-radius:var(--card-radius);background:var(--surface);box-shadow:inset 0 0 0 var(--border-width) var(--hairline)}
.media img{display:block;width:100%;height:100%;object-fit:cover}
.media-set{max-width:440px}
.media{display:grid;place-items:center;width:100%;border-radius:var(--card-radius);background:var(--surface);box-shadow:inset 0 0 0 var(--border-width) var(--hairline)}
.media span{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.media-set{max-width:440px}
.variant-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:18px}
.variant-wide{grid-column:1/-1}
.variant figcaption{margin-top:10px;color:var(--muted);font-size:12px}
.variant small{display:block}
.variant .frame{display:flex;flex-direction:column;gap:16px;min-height:288px;padding:32px;overflow:hidden}
.variant .frame>strong:not([class]){font-family:var(--font-display);font-size:23px;font-weight:600;line-height:1.2;letter-spacing:-.03em}
.v-eyebrow{color:var(--muted);font-family:var(--font-mono);font-size:10px;letter-spacing:.1em}
.v-display{font-family:var(--font-display);font-size:clamp(28px,3.2vw,42px);font-weight:600;line-height:1.06;letter-spacing:-.045em}
.v-number{font-family:var(--font-display);font-size:56px;font-weight:600;line-height:1;letter-spacing:-.05em}
.v-number-lg{font-size:78px}
.v-accent{color:var(--accent)}
.v-lead{max-width:34ch;color:var(--muted);font-size:15px;line-height:1.55}
.v-body{max-width:var(--measure);color:var(--muted);font-size:13px;line-height:1.8}
.v-note{color:var(--muted);font-family:var(--font-mono);font-size:10px;line-height:1.6}
.v-meta{display:flex;flex-wrap:wrap;gap:12px 26px}
.v-meta small{color:var(--muted);font-family:var(--font-mono);font-size:9px;letter-spacing:.08em}
.v-meta span{display:block;margin-top:3px;font-size:13px}
.v-actions{display:flex;align-items:center;gap:12px;margin-top:auto}
.v-two{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.v-two strong{font-family:var(--font-display);font-size:26px;font-weight:600;line-height:1.14;letter-spacing:-.035em}
.v-two .v-meta{margin-top:14px;gap:10px 20px}
.v-media-hero{display:grid;gap:18px}
.v-media-hero .media,.variant .frame>.media{max-width:320px}
.v-media-hero strong{display:block;margin-top:10px;font-family:var(--font-display);font-size:24px;font-weight:600;letter-spacing:-.03em}
.v-lead-metric{display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center}
.v-lead-metric strong{font-family:var(--font-display);font-size:19px;font-weight:600;line-height:1.2;letter-spacing:-.025em}
.v-lead-metric .v-number{font-size:62px}
.v-lead-metric .v-lead{margin-top:6px;font-size:13px}
.v-profile{display:flex;align-items:center;gap:14px}
.v-profile strong{display:block;font-family:var(--font-display);font-size:17px;letter-spacing:-.02em}
.v-profile small{color:var(--muted);font-size:12px}
.avatar{display:block;flex:0 0 auto;width:44px;height:44px;border-radius:50%;background:var(--text)}
.avatar-lg{width:60px;height:60px}
.v-par{display:grid;grid-template-columns:52px minmax(0,1fr);gap:12px 16px}
.v-par dt{color:var(--muted);font-family:var(--font-mono);font-size:10px;padding-top:3px}
.v-par dd{font-size:13px;line-height:1.6}
.v-par b{font-weight:600}
.v-timeline{display:grid;gap:18px;position:relative}
.v-timeline li{display:grid;grid-template-columns:10px minmax(0,1fr);gap:14px;align-items:start}
.v-timeline b{width:9px;height:9px;margin-top:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--canvas)}
.v-timeline small{color:var(--muted);font-family:var(--font-mono);font-size:9px;letter-spacing:.06em}
.v-timeline span{display:block;margin-top:3px;font-size:14px;font-weight:500}
.v-timeline em{display:block;margin-top:2px;color:var(--muted);font-size:12px;font-style:normal}
.v-before{display:grid;grid-template-columns:auto auto auto;gap:20px;align-items:end;justify-content:start}
.v-before small{color:var(--muted);font-family:var(--font-mono);font-size:9px}
.v-before strong{display:block;margin-top:4px;font-family:var(--font-display);font-size:40px;line-height:1;letter-spacing:-.05em}
.v-before i{padding-bottom:8px;color:var(--muted);font-style:normal}
.v-group{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.v-group strong{display:block;font-family:var(--font-display);font-size:30px;line-height:1;letter-spacing:-.045em}
.v-group small{margin-top:6px;color:var(--muted);font-size:12px}
.v-bars{display:grid;gap:16px}
.v-bars article{display:grid;grid-template-columns:44px minmax(0,1fr) 46px;gap:14px;align-items:center}
.v-bars small{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.v-bars i{display:block;height:14px;border-radius:999px;background:var(--border)}
.v-bars i.v-bar-accent{background:var(--accent)}
.v-bars b{font-family:var(--font-mono);font-size:11px;font-weight:400;text-align:right}
.v-gauge{display:flex;align-items:center;gap:22px}
.gauge{position:relative;display:block;flex:0 0 auto;width:88px;height:88px;border:9px solid var(--border);border-radius:50%}
.gauge i{position:absolute;inset:-9px;border:9px solid transparent;border-top-color:var(--accent);border-right-color:var(--accent);border-bottom-color:var(--accent);border-radius:50%}
.v-gauge strong{display:block;font-family:var(--font-display);font-size:34px;letter-spacing:-.04em}
.v-gauge small{margin-top:4px;color:var(--muted);font-size:12px}
.v-org{display:block;padding-bottom:16px;border-bottom:1px solid var(--hairline)}
.v-org:last-of-type{border-bottom:0;padding-bottom:0}
.v-org strong{font-family:var(--font-display);font-size:18px;letter-spacing:-.02em}
.v-org small{margin-top:3px;color:var(--muted);font-size:12px}
.v-achieve{display:grid;gap:16px}
.v-achieve li{display:grid;grid-template-columns:66px minmax(0,1fr);gap:16px;align-items:baseline}
.v-achieve b{font-family:var(--font-display);font-size:24px;font-weight:600;letter-spacing:-.04em}
.v-achieve span{font-size:13px}
.v-achieve em{display:block;margin-top:3px;color:var(--muted);font-size:11px;font-style:normal}
.v-linked{display:grid;gap:6px;margin-top:12px}
.v-linked li{color:var(--muted);font-size:12px}
.v-evidence{display:grid;gap:16px}
.v-evidence li{display:grid;gap:4px}
.v-evidence strong{font-size:13px;font-weight:600}
.v-evidence span{color:var(--muted);font-size:12px;line-height:1.55}
.v-table th,.v-table td{padding:11px 0;border-bottom:1px solid var(--hairline);text-align:left;font-size:12px;font-weight:400}
.v-table th{width:74px;color:var(--muted)}
.v-table tbody tr:last-child th,.v-table tbody tr:last-child td{border-bottom:0}
.v-table-wide th{width:auto;color:var(--muted);font-family:var(--font-mono);font-size:10px}
.v-table-wide b{font-family:var(--font-display);font-size:15px;letter-spacing:-.02em}
.v-gallery{display:grid;grid-template-columns:1.7fr 1fr;gap:12px}
.v-gallery .media:first-child{grid-row:1/3}
.v-quote{max-width:24ch;font-family:var(--font-display);font-size:24px;line-height:1.3;letter-spacing:-.025em}
.v-footer{display:grid;gap:8px}
.v-footer strong{font-family:var(--font-display);font-size:18px}
.v-footer p{color:var(--muted);font-size:12px}
.tag-set{display:flex;flex-wrap:wrap;gap:8px}
.tag-set li{padding:8px 13px;border:var(--border-width) solid var(--border);border-radius:var(--control-radius);color:var(--muted);font-size:12px}

/*
  모션은 전부 transitions-dev 카탈로그에서 가져온다. 직접 keyframe 을 쓰지 않는다.
  텍스트 줄은 18-texts-reveal, 수치는 26-spinning-counter 의 릴 구조를 그대로 쓰고,
  값은 _root.css 의 토큰 이름으로 읽는다.

  등장은 문서가 열릴 때가 아니라 견본이 화면에 들어올 때 재생하고, 화면 밖으로
  나가면 멈춘다. 반복 재생이 보이지 않는 곳에서 GPU 를 계속 쓰지 않게 하기 위해서다.
  스크립트가 막히면 아무 클래스도 붙지 않아 문서는 정지 상태로 온전히 읽힌다.
*/
/* 18-texts-reveal */
.t-stagger-line{opacity:0;transform:translateY(var(--stagger-distance));filter:blur(var(--stagger-blur));transition:opacity var(--stagger-dur) var(--stagger-ease),transform var(--stagger-dur) var(--stagger-ease),filter var(--stagger-dur) var(--stagger-ease);transition-delay:calc(var(--stagger-stagger) * var(--i, 0));will-change:transform,opacity,filter}
.t-stagger.is-shown .t-stagger-line{opacity:1;transform:translateY(0);filter:blur(0)}

/* 26-spinning-counter — 잭팟 연출 대신 한 번만 짧게 굴러 멈추게 조율했다. */
.variant .t-reel{display:inline-flex;align-items:flex-start;height:var(--reel-cell);font-variant-numeric:tabular-nums}
.t-reel-col{position:relative;height:var(--reel-cell);overflow:hidden;-webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 14%,#000 86%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0%,#000 14%,#000 86%,transparent 100%)}
.t-reel-strip{display:flex;flex-direction:column;will-change:transform}
.t-reel-digit{height:var(--reel-cell);display:flex;align-items:center;justify-content:center;white-space:pre}

/* 막대 · 게이지 · 이미지 자리 · 타임라인 선은 카탈로그에 없는 형태라
   같은 토큰으로 transition 만 건다. keyframe 은 쓰지 않는다. */
.t-stagger .v-bars i{transform:scaleX(0);transform-origin:left;transition:transform var(--duration-slow) var(--ease-smooth-out);transition-delay:calc(var(--stagger-stagger) * var(--i, 0) + var(--duration-micro))}
.t-stagger.is-shown .v-bars i{transform:scaleX(1)}
.t-stagger .gauge i{transform:rotate(-150deg);transition:transform var(--duration-very-slow) var(--ease-smooth-out) var(--duration-micro)}
.t-stagger.is-shown .gauge i{transform:rotate(0)}
.t-stagger .media{clip-path:inset(100% 0 0 0);transition:clip-path var(--duration-slow) var(--ease-smooth-out);transition-delay:calc(var(--stagger-stagger) * var(--i, 0))}
.t-stagger.is-shown .media{clip-path:inset(0 0 0 0)}
.v-timeline{position:relative}
.v-timeline::before{content:"";position:absolute;top:8px;bottom:8px;left:4px;width:1px;background:var(--border);transform:scaleY(0);transform-origin:top;transition:transform var(--duration-very-slow) var(--ease-smooth-out)}
.t-stagger.is-shown .v-timeline::before{transform:scaleY(1)}

@media(prefers-reduced-motion:reduce){
.t-stagger-line,.t-reel-strip,.t-stagger .v-bars i,.t-stagger .gauge i,.t-stagger .media,.v-timeline::before{transition:none !important;opacity:1;transform:none;filter:none;clip-path:none}
}
.rule-sheet{margin-top:28px;border-top:1px solid var(--hairline)}
.rule-sheet summary{display:flex;align-items:center;gap:8px;padding:15px 0;color:var(--muted);font-size:11px;cursor:pointer}
.rule-sheet summary span{font-family:var(--font-mono);font-size:10px}
.doc-lines{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;padding-bottom:18px;color:var(--muted);font-size:11px;line-height:1.55}
.doc-lines li{padding:7px 0;border-bottom:1px solid var(--hairline)}

@media(max-width:900px){
.row,.cover{grid-template-columns:1fr;gap:14px}
.glance{grid-template-columns:1fr 1fr}
.demo-contact,.v-gallery,.v-two,.v-group{grid-template-columns:1fr}
.variant-grid{grid-template-columns:1fr}
.variant .frame{padding:24px;min-height:0}
.row-head{padding-bottom:22px}
}
@media(max-width:640px){
.nav ul{display:none}
:root{--column:calc(100% - 36px)}
.cover h1{font-size:15vw}
.cover p{font-size:15px}
.row-head h2{font-size:26px}
.sentence{font-size:14px}
.facts li{grid-template-columns:1fr;gap:2px}
.glance{grid-template-columns:1fr}
.facts span{text-align:left}
.doc-lines{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.motion-rise,.motion-focus{animation:none}}
</style>
</head>
<body>
  <nav class="nav"><strong>${title}</strong><ul><li><a href="#colors">Colors</a></li><li><a href="#typography">Typography</a></li><li><a href="#components">Components</a></li><li><a href="#sample-portfolio">Live portfolio</a></li></ul><span>r${revision}</span></nav>
  <header class="cover">
    <span>Portfolio design system</span>
    <div>
      <h1>${title}</h1>
      <p>${thesis}</p>
      <div class="cover-actions"><a class="act" href="#sample-portfolio">Live portfolio 보기</a><a class="act-quiet" href="#colors">시스템 살펴보기 ↓</a></div>
    </div>
  </header>
  <div class="palette" aria-hidden="true">${COLOR_NAMES.map((name) => `<i style="background:var(--${name})"></i>`).join("")}</div>
  <div class="cover-rows" data-design-section="direction">
    ${row(label("한눈에"), glance)}
    ${renderRuleSheet(direction)}
  </div>
  <main>${sections}</main>
<script>${MOTION_SCRIPT}</script>
</body>
</html>`;
}

export function renderDesignHtml(
  modelInput: DesignDocumentModel,
  markdownSha256: string,
): string {
  const model = DesignDocumentModelSchema.parse(modelInput);
  const hash = zodHash(markdownSha256);
  if (isAppleShowcase(model)) return renderAppleShowcaseHtml(model, hash);
  const sections = model.sections.map((value) => renderLegacySection(model, value)).join("");
  const title = escapeHtml(model.spec.identity.name);
  const thesis = escapeHtml(model.spec.identity.visualThesis);
  const variables = cssVariables(model.spec);

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="design-spec-version" content="2">
<meta name="design-md-sha256" content="${hash}">
<title>${title} — DESIGN</title>
<style>
:root{${variables}}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-body);font-size:var(--type-example-body);line-height:var(--line-example-body);word-break:keep-all;overflow-wrap:anywhere}
main{width:min(calc(100% - 40px),var(--content-width));margin:auto;padding-block:var(--section-gap)}
.cover{padding:clamp(48px,10vw,120px) 0;border-bottom:var(--border-width) solid var(--border)}
.cover p{max-width:var(--measure);font-size:1.2rem;color:var(--muted)}
h1,h2,h3{font-family:var(--font-display)}h1{font-size:var(--type-example-display);line-height:var(--line-example-display);margin:0}h2{font-size:var(--type-example-heading);line-height:var(--line-example-heading);margin:0 0 var(--component-gap)}
section{padding-block:var(--section-gap);border-bottom:var(--border-width) solid var(--border)}
.doc-lines{display:grid;gap:8px;padding:0;margin:0 0 var(--component-gap);list-style:none;color:var(--muted)}
.token-grid,.sample-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--element-gap)}
.swatch,.sample,.component-sample article{padding:var(--element-gap);background:var(--surface);border:var(--border-width) solid var(--border);border-radius:var(--card-radius)}
.swatch span{display:block;height:72px;margin-bottom:10px;border-radius:calc(var(--card-radius) / 2);border:var(--border-width) solid var(--border)}
.type-sample,.component-sample,.shape-sample{display:grid;gap:var(--element-gap);padding:var(--component-gap);background:var(--elevated);border-radius:var(--card-radius);box-shadow:var(--shadow)}
.type-sample strong{font-family:var(--font-display);font-size:var(--type-example-display);line-height:var(--line-example-display)}.type-sample code,.sample-metric p{font-family:var(--font-mono);color:var(--accent)}
.spacing-sample{display:flex;align-items:end;gap:var(--element-gap)}.spacing-sample i{display:block;width:30%;height:var(--element-gap);background:var(--accent)}.spacing-sample i:nth-child(2){height:var(--component-gap)}.spacing-sample i:nth-child(3){height:var(--section-gap)}
.shape-sample{grid-template-columns:1fr auto;align-items:center}.shape-sample span{padding:var(--component-gap);background:var(--surface);border-radius:var(--card-radius);box-shadow:var(--shadow)}button,.contact-action{display:inline-flex;width:max-content;padding:10px 16px;border:0;border-radius:var(--control-radius);background:var(--action);color:var(--actionText);font:inherit}
.component-sample{grid-template-columns:minmax(0,1fr) auto;align-items:center}.sample h3{margin-top:0}.sample p{color:var(--muted)}
.image-placeholder{display:grid;place-items:center;min-height:180px;background:var(--elevated);border:var(--border-width) dashed var(--border);border-radius:var(--card-radius);color:var(--muted)}
.tags{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.tags li{padding:4px 9px;border:var(--border-width) solid var(--border);border-radius:999px;font-family:var(--font-mono)}
blockquote{margin:0;padding-left:16px;border-left:3px solid var(--accent);font-family:var(--font-display)}
.motion-sample{width:max-content;padding:var(--component-gap);background:var(--accent);color:var(--actionText);border-radius:var(--card-radius);animation:design-rise var(--motion-duration) var(--motion-easing) both}
@keyframes design-rise{from{opacity:.2;transform:translateY(12px)}to{opacity:1;transform:none}}
.rule-comparison{display:grid;grid-template-columns:1fr 1fr;gap:var(--element-gap)}.rule-comparison span{padding:var(--component-gap);border:var(--border-width) solid var(--border);border-radius:var(--card-radius)}.rule-comparison span:first-child{border-color:var(--accent)}
@media(max-width:640px){main{width:min(calc(100% - 24px),var(--content-width))}.shape-sample,.component-sample{grid-template-columns:1fr}.sample-grid{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.motion-sample{animation:none}}
</style>
</head>
<body><main><header class="cover"><h1>${title}</h1><p>${thesis}</p></header>${sections}</main></body>
</html>`;
}

function zodHash(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("markdownSha256 must be a lowercase SHA-256 digest");
  }
  return value;
}

export function compileDesignDocuments(
  input: DesignSystemSpecV2,
  referenceLock: ReferenceLock | null = null,
) {
  const model = buildDesignDocumentModel(input, referenceLock);
  const markdown = renderDesignMarkdown(model);
  const markdownSha256 = createHash("sha256").update(markdown).digest("hex");
  const html = renderDesignHtml(model, markdownSha256);
  const contentHash = createHash("sha256")
    .update(`${markdown}\0${html}`)
    .digest("hex");
  return { model, markdown, html, markdownSha256, contentHash };
}
