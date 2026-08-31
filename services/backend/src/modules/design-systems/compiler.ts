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
    section("spacing", "간격과 콘텐츠 폭", [
      `기본 단위: ${spec.spacing.baseUnit}px`,
      `요소 간격: ${spec.spacing.elementGap}px`,
      `컴포넌트 간격: ${spec.spacing.componentGap}px`,
      `섹션 간격: ${spec.spacing.sectionGap}px`,
      `콘텐츠 폭: ${spec.spacing.contentWidth}px`,
    ]),
    section("shape", "반경, 테두리, 그림자", [
      `카드 반경: ${spec.shape.cardRadius}px`,
      `컨트롤 반경: ${spec.shape.controlRadius}px`,
      `테두리 두께: ${spec.shape.borderWidth}px`,
      `그림자: ${spec.shape.shadowStyle}`,
    ]),
    section("composition", "구성과 섹션 리듬", [
      `구조: ${spec.composition.structure}`,
      `밀도: ${spec.composition.density}`,
      `섹션 리듬: ${spec.composition.sectionRhythm}`,
      `위계: ${spec.composition.hierarchy}`,
      `표면 전략: ${spec.composition.surfaceStrategy}`,
    ]),
    section("components", "컴포넌트 규칙", componentLines),
    section("imagery", "이미지 전략", [
      `모드: ${spec.imagery.mode}`,
      `비율: ${spec.imagery.aspectRatio}`,
      `처리: ${spec.imagery.treatment}`,
      `대체 방식: ${spec.imagery.fallback}`,
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
    section("sample-portfolio", "공통 샘플 포트폴리오", SAMPLE_ENTRIES.map(
      (entry) => `${entry.label}: ${entry.value}`,
    )),
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

const SECTION_LABELS: Record<string, string> = {
  direction: "Direction",
  colors: "Color system",
  typography: "Typography",
  spacing: "Spacing",
  shape: "Shape & surfaces",
  composition: "Composition",
  components: "Components",
  imagery: "Imagery",
  motion: "Motion",
  rules: "Usage rules",
  "sample-portfolio": "Live portfolio",
  "source-revision": "Provenance",
};

function renderRuleSheet(value: DesignDocumentSection): string {
  return `<details class="rule-sheet"><summary>전체 규칙 보기 <span>${value.body.length}</span></summary><ul class="doc-lines">${value.body.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("")}</ul></details>`;
}

function renderArtifactVisual(label: string): string {
  return `<div class="artifact-visual" role="img" aria-label="${escapeHtml(label)}">
    <span class="artifact-window"><i></i><i></i><i></i></span>
    <span class="artifact-copy"><b></b><b></b><b></b></span>
    <span class="artifact-chart"><i></i><i></i><i></i><i></i><i></i></span>
    <span class="artifact-status">42% <small>verified impact</small></span>
  </div>`;
}

function sampleOf(model: DesignDocumentModel, kind: DesignSampleEntry["kind"]): DesignSampleEntry {
  return model.sampleEntries.find((entry) => entry.kind === kind)!;
}

function renderPortfolioSample(model: DesignDocumentModel): string {
  const render = (kind: DesignSampleEntry["kind"], body: string, tag = "article") => {
    const entry = sampleOf(model, kind);
    return `<${tag} class="sample sample-${kind}" data-sample-kind="${kind}"><span class="sample-label">${escapeHtml(entry.label)}</span>${body}</${tag}>`;
  };
  const hero = sampleOf(model, "hero");
  const caseStudy = sampleOf(model, "case-study");
  const longBody = sampleOf(model, "long-body");
  const metric = sampleOf(model, "metric");
  const beforeAfter = sampleOf(model, "before-after");
  const image = sampleOf(model, "image");
  const noImage = sampleOf(model, "no-image");
  const tags = sampleOf(model, "tags");
  const quote = sampleOf(model, "quote");
  const contact = sampleOf(model, "link-contact");
  const footer = sampleOf(model, "footer");

  return `<div class="portfolio-browser">
    <div class="browser-chrome"><span></span><span></span><span></span><b>portfolio.local / selected-work</b></div>
    <div class="portfolio-page">
      <nav class="portfolio-nav"><strong>MP.</strong><span>Work · About · Contact</span></nav>
      ${render("hero", `<div class="portfolio-hero-copy"><p class="hero-role">Product engineer · Seoul</p><h3>${escapeHtml(hero.value)}</h3><div class="hero-actions"><span class="contact-action">대표 작업 보기</span><span class="text-action">소개 다운로드 ↗</span></div></div><div class="hero-plate" aria-hidden="true"><i></i><b>01</b></div>`, "header")}
      <div class="portfolio-metrics">
        ${render("metric", `<strong>${escapeHtml(metric.value)}</strong><p>지난 12개월 · 운영 기록 기준</p>`)}
        ${render("before-after", `<strong>${escapeHtml(beforeAfter.value)}</strong><p>흩어진 절차를 검증 가능한 흐름으로 통합</p>`)}
      </div>
      <div class="portfolio-case-grid">
        ${render("case-study", `<p class="case-index">01 / Featured case</p><h3>${escapeHtml(caseStudy.value)}</h3><p>${escapeHtml(longBody.value)}</p><span class="text-action">사례 자세히 보기 ↗</span>`)}
        ${render("image", `${renderArtifactVisual(image.value)}<p>${escapeHtml(image.value)}</p>`)}
      </div>
      ${render("long-body", `<h3>문제부터 결과까지 읽히는 기록</h3><p>${escapeHtml(longBody.value)}</p><p>의사결정의 기준과 검증 방식까지 남겨 다음 작업에서 다시 사용할 수 있게 했습니다.</p>`)}
      <div class="portfolio-proof-grid">
        ${render("no-image", `<span class="proof-number">02</span><h3>${escapeHtml(noImage.value)}</h3><p>이미지가 없어도 역할, 선택, 수치 근거가 한 흐름을 만듭니다.</p>`)}
        ${render("tags", `<h3>사용한 기술과 도구</h3><ul class="tags"><li>${escapeHtml(tags.value).replaceAll(" · ", "</li><li>")}</li></ul>`)}
      </div>
      ${render("quote", `<blockquote>${escapeHtml(quote.value)}</blockquote><p>— 함께 일한 동료의 기록</p>`)}
      ${render("link-contact", `<div><p>다음 문제를 함께 풀어볼까요?</p><h3>${escapeHtml(contact.value)}</h3></div><span class="contact-action">대화 시작하기 ↗</span>`)}
      ${render("footer", `<strong>MP.</strong><p>${escapeHtml(footer.value)}</p><span>© 2026</span>`, "footer")}
    </div>
  </div>`;
}

function renderComponentPreview(name: string): string {
  if (name === "hero") return `<div class="component-hero"><small>PORTFOLIO / 2026</small><strong>성과를 만드는<br>제품을 설계합니다.</strong><span class="contact-action">작업 보기</span></div>`;
  if (name === "metric") return `<div class="component-metric"><strong>42%</strong><span>복구 시간 단축</span><small>Q2 대비 · 12개월</small></div>`;
  if (name === "contact") return `<div class="component-contact"><span class="contact-action">프로젝트 열기 ↗</span><span class="text-action">hello@example.com</span></div>`;
  return `<div class="component-card-preview"><small>FEATURED CASE · 01</small><strong>복잡한 운영 흐름을<br>한 화면으로</strong><span>Product design · Engineering</span></div>`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 절마다 머리글 옆에 둘 한 줄. 계약에 이미 있는 문장만 끌어온다. */
function sectionLede(spec: DesignSystemSpecV2, id: string): string | null {
  const map: Record<string, string | null> = {
    direction: spec.identity.description,
    colors: spec.composition.surfaceStrategy,
    typography: spec.typography.display.role,
    spacing: spec.composition.sectionRhythm,
    shape: spec.components.card?.description ?? null,
    composition: spec.composition.hierarchy,
    components: null,
    imagery: spec.imagery.treatment,
    motion: spec.motion.personality,
    rules: null,
    "sample-portfolio": "모든 디자인이 같은 내용을 씁니다. 화면의 차이는 전부 디자인에서 옵니다.",
    "source-revision": spec.origin.attribution,
  };
  return map[id] ?? null;
}

function renderColorSection(spec: DesignSystemSpecV2): string {
  const ground = contrastRatio(spec.colors.text.value, spec.colors.canvas.value);
  const pairs = [
    { label: "본문", pair: "text / canvas", ratio: contrastRatio(spec.colors.text.value, spec.colors.canvas.value) },
    { label: "설명", pair: "muted / canvas", ratio: contrastRatio(spec.colors.muted.value, spec.colors.canvas.value) },
    { label: "표면 위 본문", pair: "text / surface", ratio: contrastRatio(spec.colors.text.value, spec.colors.surface.value) },
    { label: "주요 행동", pair: "action-text / action", ratio: contrastRatio(spec.colors.actionText.value, spec.colors.action.value) },
  ];

  return `<div class="color-ground">
    <div class="ground-copy">
      <span class="eyebrow">Ground</span>
      <strong>${escapeHtml(spec.colors.canvas.value)} 위의 ${escapeHtml(spec.colors.text.value)}</strong>
      <p>${escapeHtml(spec.colors.canvas.role)}. ${escapeHtml(spec.colors.text.role)}.</p>
    </div>
    <div class="ground-figure"><span class="ground-ratio">${formatRatio(ground)}</span><small>${contrastLevel(ground)} · WCAG 2.1 본문 기준</small></div>
  </div>
  <div class="token-grid">${COLOR_NAMES.map((name, index) => {
    const token = spec.colors[name];
    return `<article class="swatch" data-token="${name}"><span style="background:var(--${name})"><b>${pad2(index + 1)}</b></span><div><strong>${name}</strong><code>${escapeHtml(token.value)}</code><p>${escapeHtml(token.role)}</p></div></article>`;
  }).join("")}</div>
  <div class="contrast-table"><span class="eyebrow">Measured contrast</span>${pairs.map(
    ({ label, pair, ratio }) => `<article><strong>${escapeHtml(label)}</strong><code>${escapeHtml(pair)}</code><b>${formatRatio(ratio)}</b><span class="level level-${contrastLevel(ratio) === "미달" ? "fail" : "pass"}">${contrastLevel(ratio)}</span></article>`,
  ).join("")}</div>`;
}

function renderTypographySection(spec: DesignSystemSpecV2): string {
  const display = spec.typography.scale.at(-1)!;
  return `<div class="type-stage">
    <div class="type-display">
      <span class="eyebrow">Display specimen · ${escapeHtml(display.size)}</span>
      <strong>일의 결과를<br>분명하게 남깁니다.</strong>
      <p>${escapeHtml(spec.typography.display.family)} · ${escapeHtml(spec.typography.display.role)}</p>
    </div>
    <div class="type-ramp">${spec.typography.scale.map(
      (step) => `<article><span>${escapeHtml(step.name)}</span><strong style="font-size:var(--type-${step.name});line-height:var(--line-${step.name})">Aa 성과를 읽는 방식</strong><code>${escapeHtml(step.size)} / ${escapeHtml(step.lineHeight)}</code></article>`,
    ).join("")}</div>
  </div>
  <div class="type-detail">
    <article>
      <span class="eyebrow">Weights</span>
      <div class="weight-row">${spec.typography.weights.map(
        (weight) => `<span><b style="font-weight:${weight}">Aa 성과</b><code>${weight}</code></span>`,
      ).join("")}</div>
    </article>
    <article>
      <span class="eyebrow">Letter spacing</span>
      <div class="tracking-row">${spec.typography.letterSpacing.map(
        (tracking) => `<span><b style="letter-spacing:${tracking}">성과를 읽는 방식</b><code>${escapeHtml(tracking)}</code></span>`,
      ).join("")}</div>
    </article>
    <article class="measure-card">
      <span class="eyebrow">Measure · ${escapeHtml(spec.typography.measure)}</span>
      <p>${escapeHtml(spec.typography.body.role)}. 본문은 이 폭을 넘지 않게 잡아 한 줄이 눈으로 따라가기 좋은 길이를 유지합니다.</p>
    </article>
  </div>`;
}

function renderSpacingSection(spec: DesignSystemSpecV2): string {
  const steps = [
    { token: "base-unit", value: spec.spacing.baseUnit },
    { token: "element-gap", value: spec.spacing.elementGap },
    { token: "component-gap", value: spec.spacing.componentGap },
    { token: "section-gap", value: spec.spacing.sectionGap },
  ];
  const max = Math.max(...steps.map((step) => step.value));

  return `<div class="spacing-stage">
    <div class="spacing-scale">
      <span class="eyebrow">Scale</span>
      ${steps.map((step, index) => `<article><b>${pad2(index + 1)}</b><span style="width:${((step.value / max) * 100).toFixed(1)}%"></span><code>${step.token}</code><strong>${step.value}px</strong></article>`).join("")}
    </div>
    <div class="rhythm-demo">
      <span class="eyebrow">Applied rhythm</span><span class="note">같은 눈금을 실제 간격으로 적용한 모습</span>
      <div class="rhythm-row rhythm-element"><i></i><i></i><i></i><em>element-gap ${spec.spacing.elementGap}px</em></div>
      <div class="rhythm-row rhythm-component"><i></i><i></i><em>component-gap ${spec.spacing.componentGap}px</em></div>
      <div class="rhythm-row rhythm-section"><i></i><i></i><em>section-gap ${spec.spacing.sectionGap}px</em></div>
      <p class="rhythm-width"><b>content-width ${spec.spacing.contentWidth}px</b><span>본문 폭 ${escapeHtml(spec.typography.measure)}</span></p>
    </div>
  </div>`;
}

function renderShapeSection(spec: DesignSystemSpecV2): string {
  return `<div class="shape-stage">
    <article class="surface-card">
      <span class="eyebrow">Surface / canvas</span>
      <h3>대표 프로젝트</h3>
      <p>${escapeHtml(spec.composition.surfaceStrategy)}</p>
      <span class="text-action">자세히 보기 ↗</span>
    </article>
    <article class="surface-card elevated">
      <span class="eyebrow">Elevated</span>
      <strong>42%</strong>
      <p>검증된 대표 성과</p>
    </article>
    <div class="button-stack">
      <span class="eyebrow">Controls</span>
      <button type="button">Primary action</button>
      <button type="button" class="button-secondary">Secondary</button>
      <button type="button" class="button-quiet">Text link ↗</button>
    </div>
  </div>
  <div class="shape-metrics">
    <article><i class="shape-swatch shape-card-radius"></i><strong>${spec.shape.cardRadius}px</strong><code>card-radius</code></article>
    <article><i class="shape-swatch shape-control-radius"></i><strong>${spec.shape.controlRadius}px</strong><code>control-radius</code></article>
    <article><i class="shape-swatch shape-border"></i><strong>${spec.shape.borderWidth}px</strong><code>border-width</code></article>
    <article><i class="shape-swatch shape-shadow"></i><strong>${escapeHtml(spec.shape.shadowStyle)}</strong><code>shadow</code></article>
  </div>`;
}

function renderCompositionSection(spec: DesignSystemSpecV2): string {
  const ratio = Math.max(40, Math.min(100, Math.round((spec.spacing.contentWidth / 1440) * 100)));
  return `<div class="composition-stage" data-structure="${escapeHtml(spec.composition.structure)}">
    <div class="layout-label">
      <span class="eyebrow">Composition</span>
      <strong>${escapeHtml(spec.composition.structure)}</strong>
      <p>${escapeHtml(spec.composition.sectionRhythm)}</p>
      <small>density ${escapeHtml(spec.composition.density)} · 1440px 지면에서 콘텐츠가 차지하는 폭 ${ratio}%</small>
    </div>
    <div class="layout-viewport">
      <div class="layout-canvas" style="width:${ratio}%">
        <header></header>
        <main><i></i><i></i><i></i></main>
        <footer></footer>
      </div>
    </div>
  </div>`;
}

function renderComponentSection(spec: DesignSystemSpecV2): string {
  return `<div class="component-grid">${Object.entries(spec.components).map(
    ([name, rule], index) => `<article class="component-card" data-component="${escapeHtml(name)}">
      <header><span>${pad2(index + 1)}</span><strong>${escapeHtml(name)}</strong><small>${rule.anatomy.map(escapeHtml).join(" · ")}</small></header>
      ${renderComponentPreview(name)}
      <div class="component-meta">
        <p>${escapeHtml(rule.description)}</p>
        <ul class="chips">${rule.tokens.map((token) => `<li>${escapeHtml(token)}</li>`).join("")}</ul>
      </div>
    </article>`,
  ).join("")}</div>`;
}

function renderMotionSection(spec: DesignSystemSpecV2): string {
  return `<div class="motion-stage">
    <article><span class="eyebrow">01 Reveal</span><i class="motion-block motion-rise"></i><small>${escapeHtml(spec.motion.duration)} · ${escapeHtml(spec.motion.easing)}</small></article>
    <article><span class="eyebrow">02 Focus</span><i class="motion-block motion-focus"></i><small>${escapeHtml(spec.motion.personality)}</small></article>
    <article><span class="eyebrow">03 Reduced</span><i class="motion-block motion-still"></i><small>${escapeHtml(spec.motion.reducedMotion)}</small></article>
  </div>`;
}

function renderRulesSection(spec: DesignSystemSpecV2): string {
  return `<div class="rule-visual">
    <figure class="rule-figure">
      <figcaption><span class="eyebrow">Do</span><span class="note">규칙대로 그린 카드</span></figcaption>
      <div class="rule-card">
        <span class="eyebrow">Featured case · 01</span>
        <h3>복구 시간을 42% 줄인 과정</h3>
        <p>한 화면에 한 메시지. 강조색은 행동 하나에만 씁니다.</p>
        <span class="contact-action">사례 보기</span>
      </div>
    </figure>
    <figure class="rule-figure">
      <figcaption><span class="eyebrow">Don't</span><span class="note">규칙을 깬 카드</span></figcaption>
      <div class="rule-card rule-card-broken">
        <span class="eyebrow">Featured case · 01</span>
        <h3>복구 시간을 42% 줄인 과정</h3>
        <p>강조색을 여러 개 쓰고 본문을 촘촘하게 채우면 무엇을 먼저 봐야 하는지가 사라집니다. 제목은 작아지고 카드는 그림자로 떠오릅니다.</p>
        <div class="broken-actions"><span>사례 보기</span><span>이력서</span><span>블로그</span><span>연락</span></div>
      </div>
    </figure>
  </div>
  <div class="rule-comparison">
    <article><span class="eyebrow">Do / keep</span>${spec.rules.do.map((rule) => `<p><i>✓</i>${escapeHtml(rule)}</p>`).join("")}</article>
    <article><span class="eyebrow">Don't / remove</span>${spec.rules.dont.map((rule) => `<p><i>×</i>${escapeHtml(rule)}</p>`).join("")}</article>
  </div>`;
}

function renderSourceSection(model: DesignDocumentModel, markdownSha256: string): string {
  const spec = model.spec;
  const cells = [
    { label: "Design system", value: spec.identity.name, note: `Specification v${spec.version}` },
    { label: "Origin", value: spec.origin.sourceName ?? "Expresso", note: spec.origin.kind },
    { label: "Revision", value: model.referenceLock ? `r${model.referenceLock.primaryDirection.revision}` : "r1", note: model.referenceLock?.primaryDirection.designSystemCode ?? "builtin" },
    { label: "Source URL", value: spec.origin.sourceUrl ?? "없음", note: "표기용 · 문서에서 열지 않음" },
    { label: "Captured", value: spec.origin.capturedAt ?? "없음", note: spec.origin.attribution ?? "출처 표기 없음" },
    { label: "DESIGN.md sha256", value: `${markdownSha256.slice(0, 16)}…`, note: "Markdown과 HTML이 같은 모델에서 나온 것을 확인하는 값" },
  ];
  return `<div class="source-stage">${cells.map(
    ({ label, value, note }) => `<div><span class="eyebrow">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`,
  ).join("")}</div>`;
}

function renderShowcaseSection(
  model: DesignDocumentModel,
  value: DesignDocumentSection,
  index: number,
  markdownSha256: string,
): string {
  const spec = model.spec;
  let example = "";

  if (value.id === "direction") {
    example = `<div class="direction-stage">
      <div class="direction-thesis">
        <span class="eyebrow">Visual thesis</span>
        <h3>${escapeHtml(spec.identity.visualThesis)}</h3>
        <p>${escapeHtml(spec.identity.description)}</p>
      </div>
      <aside class="direction-moves">
        <span class="eyebrow">Signature moves</span>
        <ol>${spec.identity.signatureMoves.map((move, moveIndex) => `<li><b>${pad2(moveIndex + 1)}</b><span>${escapeHtml(move)}</span></li>`).join("")}</ol>
        <ul class="chips">${spec.identity.traits.map((trait) => `<li>${escapeHtml(trait)}</li>`).join("")}</ul>
      </aside>
    </div>`;
  } else if (value.id === "colors") {
    example = renderColorSection(spec);
  } else if (value.id === "typography") {
    example = renderTypographySection(spec);
  } else if (value.id === "spacing") {
    example = renderSpacingSection(spec);
  } else if (value.id === "shape") {
    example = renderShapeSection(spec);
  } else if (value.id === "composition") {
    example = renderCompositionSection(spec);
  } else if (value.id === "components") {
    example = renderComponentSection(spec);
  } else if (value.id === "imagery") {
    example = `<div class="imagery-stage">${renderArtifactVisual("디자인 이미지 전략 예시")}<aside>
      <span class="eyebrow">${escapeHtml(spec.imagery.mode)}</span>
      <h3>프로젝트의 근거를 이미지 한 장에 담습니다.</h3>
      <p>${escapeHtml(spec.imagery.treatment)}</p>
      <small>비율 ${escapeHtml(spec.imagery.aspectRatio)} · 이미지가 없을 때는 ${escapeHtml(spec.imagery.fallback)}</small>
    </aside></div>`;
  } else if (value.id === "motion") {
    example = renderMotionSection(spec);
  } else if (value.id === "rules") {
    example = renderRulesSection(spec);
  } else if (value.id === "sample-portfolio") {
    example = renderPortfolioSample(model);
  } else if (value.id === "source-revision") {
    example = renderSourceSection(model, markdownSha256);
  }

  const lede = sectionLede(spec, value.id);
  return `<section id="${value.id}" class="system-section section-${value.id}" data-design-section="${value.id}">
    <div class="section-heading">
      <div><span class="eyebrow section-index">${pad2(index + 1)} / ${escapeHtml(SECTION_LABELS[value.id] ?? value.id)}</span><h2>${escapeHtml(value.title)}</h2></div>
      ${lede ? `<p class="section-lede">${escapeHtml(lede)}</p>` : "<span></span>"}
    </div>
    ${example}
    ${renderRuleSheet(value)}
  </section>`;
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
  const sections = model.sections
    .map((value, index) => renderShowcaseSection(model, value, index, markdownSha256))
    .join("");
  const coverMeta = [
    { value: spec.imagery.mode, label: "이미지 전략" },
    { value: spec.composition.density, label: "정보 밀도" },
    { value: `${spec.spacing.contentWidth}px`, label: "콘텐츠 폭" },
    { value: formatRatio(bodyContrast), label: `본문 대비 · ${contrastLevel(bodyContrast)}` },
  ];

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="design-spec-version" content="2">
<meta name="design-md-sha256" content="${markdownSha256}">
<title>${title} — DESIGN</title>
<style>
:root{${variables}--pad:max(28px,calc((100vw - var(--content-width))/2));--hairline:color-mix(in srgb,var(--border) 58%,transparent);--ink-muted:color-mix(in srgb,var(--canvas) 66%,var(--text));--card-bg:var(--surface)}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-body);font-size:var(--type-example-body);line-height:var(--line-example-body);word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
h1,h2,h3,p,figure,figcaption,blockquote,ol,ul{margin:0;padding:0}
li{list-style:none}
button{font:inherit}
.eyebrow{display:block;font-family:var(--font-mono);font-size:10px;font-weight:400;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.note{display:block;font-family:var(--font-body);font-size:11px;letter-spacing:0;text-transform:none;line-height:1.6;color:var(--muted)}

.preview-nav{position:sticky;top:0;z-index:20;height:58px;display:flex;align-items:center;gap:30px;padding:0 var(--pad);border-bottom:1px solid var(--hairline);background:color-mix(in srgb,var(--canvas) 86%,transparent);backdrop-filter:saturate(180%) blur(20px)}
.preview-nav strong{font-family:var(--font-display);font-size:17px;letter-spacing:-.035em}
.preview-nav ul{display:flex;gap:22px}
.preview-nav a{color:var(--muted);font-size:12px;text-decoration:none}
.preview-nav a:hover{color:var(--text)}
.preview-nav>span{margin-left:auto;padding:5px 11px;border:1px solid var(--hairline);border-radius:999px;color:var(--muted);font-family:var(--font-mono);font-size:10px}

.preview-cover{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(300px,.98fr);align-items:center;gap:clamp(36px,6vw,88px);padding:clamp(72px,10vw,140px) var(--pad) clamp(52px,6vw,88px)}
.cover-copy h1{margin:16px 0 22px;font-family:var(--font-display);font-size:clamp(66px,9.5vw,var(--type-example-display));font-weight:600;line-height:.9;letter-spacing:-.055em}
.cover-copy>p{max-width:34ch;color:var(--muted);font-size:clamp(17px,1.7vw,21px);line-height:1.5}
.cover-actions{display:flex;align-items:center;gap:10px;margin-top:32px}
.contact-action,.cover-actions a{display:inline-flex;align-items:center;justify-content:center;width:max-content;padding:11px 19px;border:0;border-radius:var(--control-radius);background:var(--action);color:var(--actionText);font-size:13px;text-decoration:none}
.cover-actions a:last-child,.text-action{padding-inline:8px;background:transparent;color:var(--action);text-decoration:none}
.cover-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:52px;padding-top:22px;border-top:1px solid var(--hairline)}
.cover-meta span{display:grid;gap:4px}
.cover-meta strong{font-size:14px;font-weight:600;letter-spacing:-.01em}
.cover-object{position:relative;min-height:min(520px,52vw)}
.device-shell{position:absolute;inset:2% 2% 4% 8%;overflow:hidden;border:10px solid var(--text);border-radius:38px;background:var(--surface);box-shadow:0 40px 90px color-mix(in srgb,var(--text) 16%,transparent);transform:rotate(-4deg)}
.device-bar{height:40px;display:flex;align-items:center;gap:5px;padding:0 16px;background:var(--text)}
.device-bar i{width:7px;height:7px;border-radius:50%;background:var(--canvas);opacity:.55}
.device-page{height:calc(100% - 40px);display:grid;grid-template-columns:34% 1fr;gap:16px;padding:20px}
.device-rail{display:grid;align-content:start;gap:9px;padding:17px;border-radius:20px;background:var(--canvas)}
.device-rail b{width:46%;height:10px;border-radius:6px;background:var(--text)}
.device-rail i{height:7px;border-radius:5px;background:var(--border)}
.device-rail i:nth-of-type(2){width:72%}
.device-content{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.device-card{display:grid;align-content:end;min-height:120px;padding:17px;border-radius:22px;background:var(--canvas)}
.device-card:first-child{grid-column:1/-1;background:var(--text);color:var(--canvas)}
.device-card strong{font-size:34px;letter-spacing:-.05em}
.device-card b{font-size:12px;letter-spacing:-.02em;white-space:nowrap}
.device-card small{color:var(--muted)}
.device-card:first-child small{color:var(--ink-muted)}
.device-accent{position:absolute;right:0;bottom:6%;width:150px;height:150px;display:grid;place-items:center;border-radius:50%;background:var(--action);color:var(--actionText);font-size:42px;font-weight:700;box-shadow:0 20px 46px color-mix(in srgb,var(--action) 26%,transparent)}

.system-section{padding:clamp(80px,8.5vw,132px) var(--pad)}
.system-section:nth-of-type(even){background:var(--surface);--card-bg:var(--canvas)}
.section-heading{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.66fr);align-items:end;gap:30px;margin-bottom:clamp(34px,4vw,56px);padding-bottom:24px;border-bottom:1px solid var(--hairline)}
.section-index{margin-bottom:14px}
.section-heading h2{font-family:var(--font-display);font-size:clamp(32px,4.2vw,54px);font-weight:600;line-height:1.02;letter-spacing:-.042em}
.section-lede{max-width:46ch;color:var(--muted);font-size:14px;line-height:1.65}

.direction-stage{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:12px}
.direction-thesis,.direction-moves{display:flex;flex-direction:column;min-height:340px;padding:38px;border-radius:var(--card-radius)}
.direction-thesis{background:var(--text);color:var(--canvas)}
.direction-thesis .eyebrow{color:var(--ink-muted)}
.direction-thesis h3{max-width:22ch;margin:auto 0 18px;font-family:var(--font-display);font-size:clamp(32px,4.4vw,58px);line-height:1.02;letter-spacing:-.045em}
.direction-thesis p{max-width:52ch;color:var(--ink-muted);font-size:14px;line-height:1.6}
.direction-moves{background:var(--card-bg);border:1px solid var(--hairline)}
.direction-moves ol{display:grid;gap:16px;margin:26px 0 auto}
.direction-moves li{display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:start}
.direction-moves b{font-family:var(--font-mono);font-size:10px;color:var(--muted);padding-top:3px}
.direction-moves li span{font-size:15px;line-height:1.4;letter-spacing:-.015em}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:26px}
.chips li{padding:6px 10px;border:1px solid var(--hairline);border-radius:999px;color:var(--muted);font-size:11px;white-space:nowrap}

.color-ground{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:30px;margin-bottom:12px;padding:44px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--canvas)}
.ground-copy strong{display:block;margin:14px 0 10px;font-family:var(--font-display);font-size:clamp(26px,3vw,40px);line-height:1.1;letter-spacing:-.04em}
.ground-copy p{max-width:56ch;color:var(--muted);font-size:14px}
.ground-ratio{display:block;font-family:var(--font-display);font-size:clamp(40px,5vw,68px);line-height:1;letter-spacing:-.05em;text-align:right}
.ground-figure small{display:block;margin-top:8px;color:var(--muted);font-family:var(--font-mono);font-size:10px;text-align:right}
.token-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.swatch{overflow:hidden;border:1px solid var(--hairline);border-radius:calc(var(--card-radius) * .64);background:var(--card-bg)}
.swatch>span{height:132px;display:flex;align-items:flex-start;justify-content:flex-end;padding:13px;border-bottom:1px solid var(--hairline)}
.swatch>span b{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--canvas);color:var(--text);font-family:var(--font-mono);font-size:9px}
.swatch>div{padding:17px}
.swatch strong{display:block;font-size:14px;letter-spacing:-.01em}
.swatch code{display:block;margin-top:3px;color:var(--muted);font-family:var(--font-mono);font-size:11px}
.swatch p{margin-top:14px;color:var(--muted);font-size:12px}
.contrast-table{margin-top:12px;padding:30px 34px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.contrast-table article{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 88px 84px;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--hairline)}
.contrast-table article:last-child{border-bottom:0;padding-bottom:0}
.contrast-table .eyebrow{margin-bottom:12px}
.contrast-table strong{font-size:14px;font-weight:500}
.contrast-table code{color:var(--muted);font-family:var(--font-mono);font-size:11px}
.contrast-table b{font-family:var(--font-mono);font-size:14px}
.level{justify-self:end;padding:5px 10px;border-radius:999px;font-family:var(--font-mono);font-size:10px}
.level-pass{background:var(--action);color:var(--actionText)}
.level-fail{border:1px solid var(--border);color:var(--muted)}

.type-stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.78fr);gap:12px}
.type-display,.type-ramp{padding:38px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.type-display{display:flex;flex-direction:column;min-height:400px}
.type-display>strong{margin:34px 0 auto;font-family:var(--font-display);font-size:var(--type-example-display);line-height:.96;letter-spacing:-.055em}
.type-display p{margin-top:24px;color:var(--muted);font-size:13px}
.type-ramp{display:grid;align-content:start}
.type-ramp article{display:grid;grid-template-columns:82px minmax(0,1fr) auto;align-items:baseline;gap:16px;padding:20px 0;border-bottom:1px solid var(--hairline)}
.type-ramp article:last-child{border-bottom:0;padding-bottom:0}
.type-ramp article>span,.type-ramp code{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.type-ramp strong{font-family:var(--font-display);font-weight:600;letter-spacing:-.03em}
.type-detail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}
.type-detail article{padding:30px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.weight-row,.tracking-row{display:grid;gap:14px;margin-top:22px}
.weight-row span,.tracking-row span{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding-bottom:12px;border-bottom:1px solid var(--hairline)}
.weight-row span:last-child,.tracking-row span:last-child{border-bottom:0;padding-bottom:0}
.weight-row b,.tracking-row b{font-family:var(--font-display);font-size:22px}
.weight-row code,.tracking-row code{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.measure-card p{max-width:var(--measure);margin-top:22px;color:var(--muted);font-size:14px;line-height:1.7}

.spacing-stage{display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr);gap:12px}
.spacing-scale,.rhythm-demo{padding:34px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.spacing-scale article{display:grid;grid-template-columns:22px minmax(0,1fr) 92px 54px;align-items:center;gap:12px;padding:18px 0;border-bottom:1px solid var(--hairline)}
.spacing-scale article:first-of-type{padding-top:24px}
.spacing-scale article:last-child{border-bottom:0;padding-bottom:0}
.spacing-scale b,.spacing-scale code,.spacing-scale strong{font-family:var(--font-mono);font-size:10px;color:var(--muted)}
.spacing-scale strong{color:var(--text);font-size:12px;text-align:right}
.spacing-scale article>span{display:block;height:8px;border-radius:999px;background:var(--action)}
.rhythm-demo{display:flex;flex-direction:column}
.rhythm-row{display:flex;align-items:center;margin-top:22px}
.rhythm-row i{width:64px;height:52px;border-radius:calc(var(--card-radius) * .5);background:var(--border)}
.rhythm-row em{margin-left:auto;padding-left:16px;color:var(--muted);font-family:var(--font-mono);font-size:10px;font-style:normal}
.rhythm-element{gap:var(--element-gap)}
.rhythm-component{gap:var(--component-gap)}
.rhythm-section{gap:min(var(--section-gap),160px)}
.rhythm-width{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-top:auto;padding-top:24px;border-top:1px solid var(--hairline)}
.rhythm-width b{font-family:var(--font-mono);font-size:12px}
.rhythm-width span{color:var(--muted);font-size:11px}

.shape-stage{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.72fr) minmax(0,.82fr);gap:12px}
.surface-card,.button-stack{min-height:280px;padding:32px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.surface-card{display:flex;flex-direction:column}
.surface-card h3{margin:auto 0 10px;font-family:var(--font-display);font-size:30px;line-height:1.05;letter-spacing:-.03em}
.surface-card p{max-width:44ch;color:var(--muted);font-size:13px}
.surface-card .text-action{margin-top:18px;padding-left:0}
.surface-card.elevated{background:var(--elevated);box-shadow:var(--shadow)}
.surface-card.elevated strong{margin:auto 0 4px;font-family:var(--font-display);font-size:60px;line-height:1;letter-spacing:-.06em}
.button-stack{display:flex;flex-direction:column;gap:10px}
.button-stack .eyebrow{margin-bottom:auto}
.button-stack button{padding:12px 16px;border:1px solid var(--action);border-radius:var(--control-radius);background:var(--action);color:var(--actionText)}
.button-stack .button-secondary{background:transparent;color:var(--action)}
.button-stack .button-quiet{border-color:transparent;background:transparent;color:var(--muted)}
.shape-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:12px}
.shape-metrics article{display:grid;justify-items:start;gap:8px;padding:26px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.shape-metrics strong{font-family:var(--font-display);font-size:24px;letter-spacing:-.03em}
.shape-metrics code{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.shape-swatch{width:64px;height:64px;margin-bottom:10px;background:var(--text)}
.shape-card-radius{border-radius:var(--card-radius)}
.shape-control-radius{border-radius:var(--control-radius)}
.shape-border{border:var(--border-width) solid var(--text);border-radius:calc(var(--card-radius) * .4);background:transparent}
.shape-shadow{border:1px solid var(--border);border-radius:calc(var(--card-radius) * .4);background:var(--canvas);box-shadow:var(--shadow)}

.composition-stage{display:grid;grid-template-columns:minmax(0,.5fr) minmax(0,1.5fr);overflow:hidden;border-radius:var(--card-radius);background:var(--text);color:var(--canvas)}
.layout-label{display:flex;flex-direction:column;justify-content:flex-end;gap:12px;padding:40px}
.layout-label .eyebrow{color:var(--ink-muted)}
.layout-label strong{font-family:var(--font-display);font-size:28px;letter-spacing:-.03em}
.layout-label p{max-width:34ch;color:var(--ink-muted);font-size:13px;line-height:1.6}
.layout-label small{color:var(--ink-muted);font-size:11px;line-height:1.6}
.layout-viewport{display:flex;justify-content:center;min-height:460px;margin:26px;border-radius:calc(var(--card-radius) * .9);background:var(--canvas)}
.layout-canvas{display:grid;grid-template-rows:40px minmax(0,1fr) 26px;gap:var(--component-gap);padding:var(--component-gap) 0;border-left:1px dashed var(--border);border-right:1px dashed var(--border)}
.layout-canvas header,.layout-canvas footer{margin:0 var(--element-gap);border-radius:calc(var(--card-radius) * .4);background:var(--border)}
.layout-canvas main{display:grid;grid-template-columns:1.6fr 1fr;grid-template-rows:1fr .58fr;gap:var(--element-gap);margin:0 var(--element-gap)}
.layout-canvas i{border-radius:calc(var(--card-radius) * .6);background:var(--surface)}
.layout-canvas i:first-child{grid-row:1/-1;background:var(--text)}

.component-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.component-card{overflow:hidden;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.component-card>header{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:baseline;padding:18px 22px;border-bottom:1px solid var(--hairline)}
.component-card>header span{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.component-card>header strong{font-size:14px;letter-spacing:-.01em}
.component-card>header small{grid-column:2;color:var(--muted);font-size:11px}
.component-hero,.component-metric,.component-contact,.component-card-preview{min-height:240px;padding:30px;background:var(--elevated)}
.component-hero,.component-card-preview{display:flex;flex-direction:column}
.component-hero small,.component-card-preview small{color:var(--muted);font-family:var(--font-mono);font-size:10px;letter-spacing:.1em}
.component-hero strong,.component-card-preview strong{margin:auto 0 18px;font-family:var(--font-display);font-size:32px;line-height:1.06;letter-spacing:-.04em}
.component-metric{display:grid;align-content:center}
.component-metric strong{font-family:var(--font-display);font-size:76px;line-height:1;letter-spacing:-.07em}
.component-metric span{margin-top:8px;font-size:17px}
.component-metric small{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.component-contact{display:flex;align-items:center;justify-content:center;gap:16px}
.component-card-preview span{color:var(--muted);font-size:12px}
.component-meta{padding:20px 22px 22px}
.component-meta p{color:var(--text);font-size:13px;line-height:1.6}
.component-meta .chips{margin-top:14px}

.imagery-stage{display:grid;grid-template-columns:minmax(0,1.28fr) minmax(0,.72fr);gap:12px}
.imagery-stage>aside{display:flex;flex-direction:column;justify-content:center;padding:40px;border-radius:var(--card-radius);background:var(--text);color:var(--canvas)}
.imagery-stage aside .eyebrow{color:var(--ink-muted)}
.imagery-stage aside h3{margin:20px 0 16px;font-family:var(--font-display);font-size:clamp(26px,3vw,36px);line-height:1.08;letter-spacing:-.035em}
.imagery-stage aside p{max-width:40ch;color:var(--ink-muted);font-size:14px;line-height:1.6}
.imagery-stage aside small{margin-top:28px;color:var(--ink-muted);font-size:12px;line-height:1.7}
.artifact-visual{position:relative;min-height:480px;overflow:hidden;border-radius:var(--card-radius);background:var(--elevated)}
.artifact-window{position:absolute;inset:11% 9%;overflow:hidden;border:8px solid var(--text);border-radius:26px;background:var(--canvas)}
.artifact-window i{display:inline-block;width:8px;height:8px;margin:14px 0 0 8px;border-radius:50%;background:var(--muted)}
.artifact-copy{position:absolute;top:27%;left:18%;display:grid;gap:11px;width:42%}
.artifact-copy b{height:15px;border-radius:9px;background:var(--text)}
.artifact-copy b:nth-child(2){width:74%}
.artifact-copy b:nth-child(3){width:52%;background:var(--action)}
.artifact-chart{position:absolute;right:16%;bottom:23%;height:32%;display:flex;align-items:flex-end;gap:7px}
.artifact-chart i{width:17px;background:var(--text)}
.artifact-chart i:nth-child(1){height:32%}
.artifact-chart i:nth-child(2){height:52%}
.artifact-chart i:nth-child(3){height:74%}
.artifact-chart i:nth-child(4){height:58%}
.artifact-chart i:nth-child(5){height:100%;background:var(--action)}
.artifact-status{position:absolute;left:18%;bottom:19%;font-family:var(--font-display);font-size:40px;font-weight:700;letter-spacing:-.05em}
.artifact-status small{display:block;color:var(--muted);font-family:var(--font-mono);font-size:10px;font-weight:400;letter-spacing:0}

.motion-stage{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.motion-stage article{min-height:280px;display:grid;grid-template-rows:auto 1fr auto;padding:28px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.motion-stage small{color:var(--muted);font-size:12px;line-height:1.6}
.motion-block{align-self:center;justify-self:center;width:88px;height:88px;border-radius:calc(var(--card-radius) * .8);background:var(--action)}
.motion-rise{animation:design-rise calc(var(--motion-duration) * 3) var(--motion-easing) infinite alternate}
.motion-focus{animation:design-focus calc(var(--motion-duration) * 3) var(--motion-easing) infinite alternate}
.motion-still{background:var(--elevated);border:1px solid var(--border)}
@keyframes design-rise{from{opacity:.25;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes design-focus{from{transform:scale(.86)}to{transform:scale(1.06)}}

.rule-visual{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.rule-figure figcaption{display:grid;gap:4px;margin-bottom:12px}
.rule-card{display:flex;flex-direction:column;min-height:300px;padding:34px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.rule-card h3{margin:22px 0 14px;font-family:var(--font-display);font-size:32px;line-height:1.08;letter-spacing:-.035em}
.rule-card p{max-width:38ch;color:var(--muted);font-size:14px;line-height:1.65}
.rule-card .contact-action{margin-top:auto}
.rule-card-broken{border-color:var(--accent);background:var(--accent);color:var(--actionText);box-shadow:0 20px 46px color-mix(in srgb,var(--text) 34%,transparent)}
.rule-card-broken .eyebrow{color:var(--actionText)}
.rule-card-broken h3{margin-bottom:8px;font-size:19px;letter-spacing:0}
.rule-card-broken p{max-width:none;color:var(--actionText);font-size:12px;line-height:1.25}
.broken-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.broken-actions span{padding:8px 12px;border-radius:var(--control-radius);background:var(--action);color:var(--actionText);font-size:12px}
.broken-actions span:nth-child(2){background:var(--text)}
.broken-actions span:nth-child(3){background:var(--canvas);color:var(--text)}
.broken-actions span:nth-child(4){background:var(--elevated);color:var(--text)}
.rule-comparison{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rule-comparison article{padding:32px;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.rule-comparison article:last-child{background:var(--text);color:var(--canvas);border-color:var(--text)}
.rule-comparison article:last-child .eyebrow{color:var(--ink-muted)}
.rule-comparison article p{display:flex;gap:12px;margin-top:20px;font-size:15px;line-height:1.5}
.rule-comparison article i{display:grid;place-items:center;flex:0 0 22px;height:22px;border-radius:50%;background:var(--action);color:var(--actionText);font-size:11px;font-style:normal}
.rule-comparison article:last-child i{background:var(--canvas);color:var(--text)}

.portfolio-browser{overflow:hidden;border:1px solid var(--hairline);border-radius:26px;background:var(--canvas);box-shadow:0 30px 80px color-mix(in srgb,var(--text) 10%,transparent)}
.browser-chrome{height:46px;display:flex;align-items:center;gap:7px;padding:0 18px;background:var(--text);color:var(--canvas)}
.browser-chrome>span{width:8px;height:8px;border-radius:50%;background:var(--canvas);opacity:.45}
.browser-chrome b{margin-left:12px;font-family:var(--font-mono);font-size:9px;font-weight:400;opacity:.6}
.portfolio-page{padding:0 6%}
.portfolio-nav{height:72px;display:flex;align-items:center;border-bottom:1px solid var(--hairline)}
.portfolio-nav span{margin-left:auto;color:var(--muted);font-size:11px}
.sample{position:relative}
.sample-label{display:block;margin-bottom:12px;font-size:11px;color:var(--muted)}
.sample-hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);align-items:center;gap:44px;padding:clamp(56px,7vw,96px) 0;border-bottom:1px solid var(--hairline)}
.sample-hero .sample-label{grid-column:1/-1;margin-bottom:0}
.hero-role{color:var(--muted);font-size:13px}
.sample-hero h3{max-width:14ch;margin:16px 0 30px;font-family:var(--font-display);font-size:clamp(44px,6vw,84px);line-height:.98;letter-spacing:-.055em}
.hero-actions{display:flex;align-items:center;gap:14px}
.hero-plate{position:relative;justify-self:end;width:100%;max-width:340px;aspect-ratio:4 / 5;border-radius:var(--card-radius);background:var(--text)}
.hero-plate i{position:absolute;inset:22%;border:1px solid var(--canvas);border-radius:50%;opacity:.3}
.hero-plate b{position:absolute;right:24px;bottom:20px;color:var(--canvas);font-family:var(--font-display);font-size:38px;letter-spacing:-.04em}
.portfolio-metrics{display:grid;grid-template-columns:1fr 1.45fr;border-bottom:1px solid var(--hairline)}
.portfolio-metrics .sample{min-height:200px;padding:44px 0}
.portfolio-metrics .sample + .sample{padding-left:44px;border-left:1px solid var(--hairline)}
.portfolio-metrics strong{display:block;max-width:16ch;font-family:var(--font-display);font-size:clamp(30px,4vw,58px);line-height:1.02;letter-spacing:-.05em}
.portfolio-metrics p{margin-top:14px;color:var(--muted);font-size:13px}
.portfolio-case-grid{display:grid;grid-template-columns:.82fr 1.18fr;gap:44px;padding:clamp(56px,7vw,92px) 0;border-bottom:1px solid var(--hairline)}
.sample-case-study{display:flex;flex-direction:column;justify-content:center}
.case-index{color:var(--muted);font-family:var(--font-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase}
.sample-case-study h3,.sample-long-body h3,.sample-no-image h3,.sample-tags h3{margin:12px 0 18px;font-family:var(--font-display);font-size:32px;line-height:1.08;letter-spacing:-.03em}
.sample-case-study p,.sample-long-body p,.sample-no-image p{color:var(--muted);font-size:14px;line-height:1.7}
.sample-case-study .text-action{margin-top:20px;padding-left:0}
.sample-image>p{margin-top:12px;color:var(--muted);font-size:12px}
.sample-long-body{max-width:var(--measure);padding:clamp(60px,8vw,104px) 0}
.sample-long-body p + p{margin-top:16px}
.portfolio-proof-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-bottom:clamp(56px,7vw,92px)}
.portfolio-proof-grid>.sample{display:flex;flex-direction:column;min-height:280px;padding:34px;border-radius:var(--card-radius);background:var(--surface)}
.portfolio-proof-grid .sample-label{color:var(--muted)}
.proof-number{display:block;margin-top:14px;color:var(--muted);font-family:var(--font-mono);font-size:10px}
.sample-no-image h3{margin:10px 0 auto}
.tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto}
.tags li{padding:7px 11px;border:1px solid var(--hairline);border-radius:999px;color:var(--muted);font-size:11px}
.sample-quote{display:grid;place-items:center;min-height:380px;padding:clamp(60px,8vw,100px) 8%;border-radius:var(--card-radius);background:var(--text);color:var(--canvas);text-align:center}
.sample-quote .sample-label{color:var(--ink-muted)}
.sample-quote blockquote{max-width:20ch;font-family:var(--font-display);font-size:clamp(30px,4.4vw,56px);line-height:1.1;letter-spacing:-.04em}
.sample-quote p{margin-top:22px;color:var(--ink-muted);font-size:13px}
.sample-link-contact{display:flex;align-items:center;flex-wrap:wrap;gap:26px;padding:clamp(52px,6vw,84px) 0;border-bottom:1px solid var(--hairline)}
.sample-link-contact .sample-label{width:100%;margin-bottom:0}
.sample-link-contact>div{margin-right:auto}
.sample-link-contact p{color:var(--muted);font-size:13px}
.sample-link-contact h3{margin-top:6px;font-family:var(--font-display);font-size:clamp(26px,3.2vw,40px);letter-spacing:-.035em}
.sample-footer{display:grid;grid-template-columns:auto 1fr auto;gap:26px;align-items:center;min-height:110px}
.sample-footer .sample-label{grid-column:1/-1;margin-bottom:0}
.sample-footer p{color:var(--muted);font-size:12px}
.sample-footer span:last-child{color:var(--muted);font-family:var(--font-mono);font-size:10px}

.source-stage{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:hidden;border:1px solid var(--hairline);border-radius:var(--card-radius);background:var(--card-bg)}
.source-stage>div{display:flex;flex-direction:column;gap:10px;min-height:180px;padding:28px;border-right:1px solid var(--hairline);border-bottom:1px solid var(--hairline)}
.source-stage>div:nth-child(3n){border-right:0}
.source-stage>div:nth-last-child(-n+3){border-bottom:0}
.source-stage strong{margin-top:auto;font-size:17px;letter-spacing:-.02em}
.source-stage small{color:var(--muted);font-size:11px;line-height:1.6}

.rule-sheet{margin-top:26px;border-top:1px solid var(--hairline)}
.rule-sheet summary{display:flex;align-items:center;gap:8px;padding:18px 0;color:var(--muted);font-size:12px;cursor:pointer}
.rule-sheet summary span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--elevated);font-family:var(--font-mono);font-size:9px}
.doc-lines{display:grid;grid-template-columns:1fr 1fr;gap:0 30px;padding-bottom:22px;color:var(--muted);font-size:11px;line-height:1.6}
.doc-lines li{padding:8px 0;border-bottom:1px solid var(--hairline)}

@media(max-width:1024px){
.preview-cover,.direction-stage,.type-stage,.spacing-stage,.imagery-stage,.composition-stage,.sample-hero,.portfolio-case-grid{grid-template-columns:1fr}
.type-detail,.shape-metrics{grid-template-columns:1fr 1fr}
.shape-stage{grid-template-columns:1fr 1fr}
.button-stack{grid-column:1/-1;min-height:auto}
.component-grid{grid-template-columns:1fr}
.hero-plate{justify-self:start;max-width:280px}
.layout-viewport{min-height:340px}
}
@media(max-width:640px){
.preview-nav ul{display:none}
.cover-copy h1{font-size:clamp(48px,13vw,64px)}
.cover-meta{grid-template-columns:1fr 1fr}
.cover-object{min-height:320px}
.device-shell{inset:2%}
.device-accent{width:104px;height:104px;font-size:30px}
.system-section{padding:64px 20px}
.section-heading{grid-template-columns:1fr;gap:14px}
.token-grid,.type-detail,.shape-stage,.shape-metrics,.motion-stage,.rule-visual,.rule-comparison,.source-stage,.portfolio-metrics,.portfolio-proof-grid,.color-ground,.contrast-table article{grid-template-columns:1fr}
.contrast-table article{gap:6px;justify-items:start}
.level{justify-self:start}
.swatch>span{height:104px}
.type-display{min-height:300px}
.type-ramp article{grid-template-columns:64px 1fr}
.type-ramp code{display:none}
.source-stage>div{border-right:0}
.source-stage>div:nth-last-child(-n+3){border-bottom:1px solid var(--hairline)}
.source-stage>div:last-child{border-bottom:0}
.portfolio-browser{border-radius:16px}
.portfolio-page{padding-inline:20px}
.portfolio-nav span{display:none}
.portfolio-metrics .sample + .sample{padding-left:0;border-left:0;border-top:1px solid var(--hairline)}
.sample-link-contact{align-items:flex-start;flex-direction:column}
.sample-footer{grid-template-columns:1fr}
.doc-lines{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.motion-rise,.motion-focus{animation:none}}
</style>
</head>
<body>
  <nav class="preview-nav"><strong>${title}</strong><ul><li><a href="#colors">Colors</a></li><li><a href="#typography">Typography</a></li><li><a href="#components">Components</a></li><li><a href="#sample-portfolio">Live portfolio</a></li></ul><span>System preview · r${revision}</span></nav>
  <header class="preview-cover">
    <div class="cover-copy">
      <span class="eyebrow">Portfolio design system</span>
      <h1>${title}</h1>
      <p>${thesis}</p>
      <div class="cover-actions"><a href="#sample-portfolio">Live portfolio 보기</a><a href="#colors">시스템 살펴보기 ↓</a></div>
      <div class="cover-meta">${coverMeta.map(
        ({ value, label }) => `<span><strong>${escapeHtml(value)}</strong><small class="note">${escapeHtml(label)}</small></span>`,
      ).join("")}</div>
    </div>
    <div class="cover-object" aria-hidden="true">
      <div class="device-shell">
        <div class="device-bar"><i></i><i></i><i></i></div>
        <div class="device-page">
          <div class="device-rail"><b></b><i></i><i></i><i></i></div>
          <div class="device-content">
            <div class="device-card"><small>Featured outcome</small><strong>42%</strong></div>
            <div class="device-card"><small>Case 01</small><b>Recovery</b></div>
            <div class="device-card"><small>Case 02</small><b>System</b></div>
          </div>
        </div>
      </div>
      <div class="device-accent">↗</div>
    </div>
  </header>
  <main>${sections}</main>
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
