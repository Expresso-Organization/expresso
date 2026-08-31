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

function renderRuleSheet(value: DesignDocumentSection): string {
  return `<details class="rule-sheet"><summary>전체 규칙 보기 <span>${value.body.length}</span></summary><ul class="doc-lines">${value.body.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("")}</ul></details>`;
}

const COLOR_GROUPS = [
  { title: "지면과 표면", names: ["canvas", "surface", "elevated"] },
  { title: "글자와 경계", names: ["text", "muted", "border"] },
  { title: "강조와 행동", names: ["accent", "action", "actionText"] },
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 절의 큰 문장. 지어내지 않고 계약이 이미 단언한 문장만 그 자리에 놓는다.
 * 해당하는 문장이 없으면 절 제목으로 물러난다.
 */
function sectionHeadline(spec: DesignSystemSpecV2, value: DesignDocumentSection): string {
  const moves = spec.identity.signatureMoves;
  const map: Record<string, string | undefined> = {
    direction: spec.identity.visualThesis,
    colors: spec.composition.surfaceStrategy,
    typography: moves[0],
    spacing: spec.composition.sectionRhythm,
    shape: spec.components.card?.description,
    composition: spec.composition.hierarchy,
    components: spec.components.hero?.description,
    imagery: spec.imagery.treatment,
    motion: spec.motion.personality,
    rules: moves[1] ?? moves[0],
    "sample-portfolio": "모든 디자인이 같은 내용을 씁니다. 화면의 차이는 전부 디자인에서 옵니다.",
    "source-revision": spec.origin.attribution ?? undefined,
  };
  return map[value.id] ?? value.title;
}

/** 큰 문장 아래 한 줄. 큰 문장과 겹치는 문장은 고르지 않는다. */
function sectionDeck(spec: DesignSystemSpecV2, id: string): string | null {
  const map: Record<string, string | null | undefined> = {
    direction: spec.identity.description,
    colors: spec.colors.accent.role,
    typography: spec.typography.body.role,
    imagery: spec.imagery.fallback,
    motion: spec.motion.reducedMotion,
  };
  return map[id] ?? null;
}

function renderSpecCard(name: string, figure: string, line: string, modifier = ""): string {
  return `<article class="spec-card${modifier ? ` ${modifier}` : ""}"><span class="spec-name">${escapeHtml(name)}</span><div class="spec-figure">${figure}</div><span class="spec-line">${escapeHtml(line)}</span></article>`;
}

function renderColorSection(spec: DesignSystemSpecV2): string {
  const pairs = [
    { label: "본문", pair: "text / canvas", ratio: contrastRatio(spec.colors.text.value, spec.colors.canvas.value) },
    { label: "설명", pair: "muted / canvas", ratio: contrastRatio(spec.colors.muted.value, spec.colors.canvas.value) },
    { label: "표면 위 본문", pair: "text / surface", ratio: contrastRatio(spec.colors.text.value, spec.colors.surface.value) },
    { label: "주요 행동", pair: "action-text / action", ratio: contrastRatio(spec.colors.actionText.value, spec.colors.action.value) },
  ];

  return `${COLOR_GROUPS.map((group) => `<div class="token-group">
    <h3>${escapeHtml(group.title)}</h3>
    <div class="swatch-grid">${group.names.map((name) => {
      const token = spec.colors[name];
      return `<article class="swatch" data-token="${name}"><i style="background:var(--${name})"></i><strong>${name}</strong><code>${escapeHtml(token.value)}</code><span>${escapeHtml(token.role)}</span></article>`;
    }).join("")}</div>
  </div>`).join("")}
  <div class="token-group">
    <h3>측정한 명암비</h3>
    <table class="spec-table"><tbody>${pairs.map(
      ({ label, pair, ratio }) => `<tr><th>${escapeHtml(label)}</th><td><code>${escapeHtml(pair)}</code></td><td class="numeric">${formatRatio(ratio)}</td><td class="numeric"><b class="${contrastLevel(ratio) === "미달" ? "level-fail" : "level-pass"}">${contrastLevel(ratio)}</b></td></tr>`,
    ).join("")}</tbody></table>
  </div>`;
}

function renderTypographySection(spec: DesignSystemSpecV2): string {
  const settings = [
    { label: "굵기", value: spec.typography.weights.join(" · ") },
    { label: "행간", value: spec.typography.lineHeights.join(" · ") },
    { label: "자간", value: spec.typography.letterSpacing.join(" · ") },
    { label: "본문 폭", value: spec.typography.measure },
    { label: "Display", value: `${spec.typography.display.family} · ${spec.typography.display.fallback}` },
    { label: "Body", value: `${spec.typography.body.family} · ${spec.typography.body.fallback}` },
    { label: "Mono", value: `${spec.typography.mono.family} · ${spec.typography.mono.fallback}` },
  ];

  return `<div class="ramp">${spec.typography.scale.map((step) => `<article class="ramp-row">
    <div class="ramp-meta"><strong>${escapeHtml(step.name)}</strong><code>${escapeHtml(step.size)} / ${escapeHtml(step.lineHeight)}</code></div>
    <p class="ramp-specimen" style="font-size:var(--type-${step.name});line-height:var(--line-${step.name})">성과가 읽히는 첫 문장</p>
  </article>`).join("")}</div>
  <div class="token-group">
    <h3>서체 설정</h3>
    <table class="spec-table"><tbody>${settings.map(
      ({ label, value }) => `<tr><th>${escapeHtml(label)}</th><td colspan="3"><code>${escapeHtml(value)}</code></td></tr>`,
    ).join("")}</tbody></table>
  </div>`;
}

function renderSpacingSection(spec: DesignSystemSpecV2): string {
  const steps = [
    { token: "base-unit", value: spec.spacing.baseUnit },
    { token: "element-gap", value: spec.spacing.elementGap },
    { token: "component-gap", value: spec.spacing.componentGap },
    { token: "section-gap", value: spec.spacing.sectionGap },
    { token: "content-width", value: spec.spacing.contentWidth },
  ];
  const gaps = steps.filter((step) => step.token !== "content-width");
  const max = Math.max(...gaps.map((step) => step.value));

  return `<div class="scale-row">${steps.map(
    (step) => `<article class="scale-chip"><b>${step.value}<i>px</i></b><code>${step.token}</code></article>`,
  ).join("")}</div>
  <div class="measure-stage">
    <div class="measure-bars">${gaps.map(
      (step) => `<article><code>${step.token}</code><span style="width:${((step.value / max) * 100).toFixed(1)}%"></span><b>${step.value}px</b></article>`,
    ).join("")}</div>
    <div class="rhythm-demo">
      <h3>같은 눈금을 실제 간격으로 둔 모습</h3>
      <div class="rhythm-row rhythm-element"><i></i><i></i><i></i><em>element-gap</em></div>
      <div class="rhythm-row rhythm-component"><i></i><i></i><em>component-gap</em></div>
      <div class="rhythm-row rhythm-section"><i></i><i></i><em>section-gap</em></div>
    </div>
  </div>`;
}

function renderShapeSection(spec: DesignSystemSpecV2): string {
  const surfaces = [
    { name: "canvas", role: spec.colors.canvas.role },
    { name: "surface", role: spec.colors.surface.role },
    { name: "elevated", role: spec.colors.elevated.role },
  ];

  return `<div class="scale-row">
    <article class="scale-chip"><b>${spec.shape.cardRadius}<i>px</i></b><code>card-radius</code></article>
    <article class="scale-chip"><b>${spec.shape.controlRadius}<i>px</i></b><code>control-radius</code></article>
    <article class="scale-chip"><b>${spec.shape.borderWidth}<i>px</i></b><code>border-width</code></article>
    <article class="scale-chip"><b>${escapeHtml(spec.shape.shadowStyle)}</b><code>shadow</code></article>
  </div>
  <div class="spec-grid">
    ${renderSpecCard("card-radius", `<i class="radius-proof radius-card"></i>`, `카드와 이미지 판 · ${spec.shape.cardRadius}px`)}
    ${renderSpecCard("control-radius", `<i class="radius-proof radius-control"></i>`, `버튼과 태그 · ${spec.shape.controlRadius}px`)}
    ${renderSpecCard("border-width", `<i class="radius-proof radius-border"></i>`, `경계 두께 · ${spec.shape.borderWidth}px`)}
    ${renderSpecCard("shadow", `<i class="radius-proof radius-shadow"></i>`, `그림자 · ${spec.shape.shadowStyle}`)}
  </div>
  <div class="token-group">
    <h3>표면 단계</h3>
    <div class="surface-stack">${surfaces.map(
      (surface) => `<article class="surface-plate surface-${surface.name}"><strong>${surface.name}</strong><span>${escapeHtml(surface.role)}</span></article>`,
    ).join("")}</div>
  </div>`;
}

function renderCompositionSection(spec: DesignSystemSpecV2): string {
  const ratio = Math.max(40, Math.min(100, Math.round((spec.spacing.contentWidth / 1440) * 100)));
  return `<div class="layout-stage" data-structure="${escapeHtml(spec.composition.structure)}">
    <div class="layout-viewport">
      <div class="layout-canvas" style="width:${ratio}%">
        <header></header>
        <main><i></i><i></i><i></i></main>
        <footer></footer>
      </div>
    </div>
    <table class="spec-table"><tbody>
      <tr><th>구조</th><td colspan="3"><code>${escapeHtml(spec.composition.structure)}</code></td></tr>
      <tr><th>밀도</th><td colspan="3"><code>${escapeHtml(spec.composition.density)}</code></td></tr>
      <tr><th>콘텐츠 폭</th><td colspan="3"><code>${spec.spacing.contentWidth}px · 1440px 지면의 ${ratio}%</code></td></tr>
      <tr><th>섹션 리듬</th><td colspan="3">${escapeHtml(spec.composition.sectionRhythm)}</td></tr>
    </tbody></table>
  </div>`;
}

function renderComponentPreview(name: string): string {
  if (name === "hero") return `<div class="preview-hero"><small>PORTFOLIO / 2026</small><strong>성과를 만드는<br>제품을 설계합니다.</strong><span class="action-primary">작업 보기</span></div>`;
  if (name === "metric") return `<div class="preview-metric"><strong>42%</strong><span>복구 시간 단축</span><small>Q2 대비 · 12개월</small></div>`;
  if (name === "contact") return `<div class="preview-contact"><span class="action-primary">프로젝트 열기 ↗</span><span class="action-quiet">hello@example.com</span></div>`;
  return `<div class="preview-case"><small>FEATURED CASE · 01</small><strong>복잡한 운영 흐름을<br>한 화면으로</strong><span>Product design · Engineering</span></div>`;
}

function renderComponentSection(spec: DesignSystemSpecV2): string {
  const controls = [
    { name: "action-primary", figure: `<span class="action-primary">Primary</span>`, line: `${spec.colors.action.value} · ${spec.shape.controlRadius}px 반경` },
    { name: "action-secondary", figure: `<span class="action-secondary">Secondary</span>`, line: `투명 배경 · ${spec.shape.borderWidth}px 경계` },
    { name: "action-quiet", figure: `<span class="action-quiet">Text link ↗</span>`, line: `${spec.colors.action.value} 글자만` },
    { name: "tag", figure: `<span class="tag-chip">TypeScript</span>`, line: `${spec.colors.border.value} 경계 · 알약` },
  ];

  return `<div class="spec-grid">${controls.map(
    (control) => renderSpecCard(control.name, control.figure, control.line),
  ).join("")}</div>
  <div class="component-grid">${Object.entries(spec.components).map(
    ([name, rule], index) => `<article class="component-card" data-component="${escapeHtml(name)}">
      <header><span>${pad2(index + 1)}</span><strong>${escapeHtml(name)}</strong></header>
      <div class="component-figure">${renderComponentPreview(name)}</div>
      <div class="component-meta">
        <p>${escapeHtml(rule.description)}</p>
        <dl><dt>구조</dt><dd>${rule.anatomy.map(escapeHtml).join(" · ")}</dd><dt>토큰</dt><dd><code>${rule.tokens.map(escapeHtml).join(" · ")}</code></dd></dl>
      </div>
    </article>`,
  ).join("")}</div>`;
}

function renderArtifactVisual(label: string): string {
  return `<div class="artifact" role="img" aria-label="${escapeHtml(label)}">
    <span class="artifact-frame"><i></i><i></i><i></i></span>
    <span class="artifact-copy"><b></b><b></b><b></b></span>
    <span class="artifact-chart"><i></i><i></i><i></i><i></i><i></i></span>
    <span class="artifact-status">42%<small>verified impact</small></span>
  </div>`;
}

function renderImagerySection(spec: DesignSystemSpecV2): string {
  return `<div class="imagery-stage">
    ${renderArtifactVisual("디자인 이미지 전략 예시")}
    <table class="spec-table"><tbody>
      <tr><th>모드</th><td colspan="3"><code>${escapeHtml(spec.imagery.mode)}</code></td></tr>
      <tr><th>비율</th><td colspan="3"><code>${escapeHtml(spec.imagery.aspectRatio)}</code></td></tr>
    </tbody></table>
  </div>`;
}

function renderMotionSection(spec: DesignSystemSpecV2): string {
  return `<div class="spec-grid">
    ${renderSpecCard("reveal", `<i class="motion-block motion-rise"></i>`, `${spec.motion.duration} · ${spec.motion.easing}`)}
    ${renderSpecCard("focus", `<i class="motion-block motion-focus"></i>`, `상태가 바뀌는 자리에만`)}
    ${renderSpecCard("reduced", `<i class="motion-block motion-still"></i>`, `모션 감소에서 고정되는 최종 상태`)}
  </div>
`;
}

function renderRulesSection(spec: DesignSystemSpecV2): string {
  return `<div class="rule-visual">
    <figure>
      <figcaption><b>Do</b><span>규칙대로 그린 카드</span></figcaption>
      <div class="rule-card">
        <small>FEATURED CASE · 01</small>
        <h4>복구 시간을 42% 줄인 과정</h4>
        <p>한 화면에 한 메시지. 강조색은 행동 하나에만 씁니다.</p>
        <span class="action-primary">사례 보기</span>
      </div>
    </figure>
    <figure>
      <figcaption><b>Don't</b><span>규칙을 깬 카드</span></figcaption>
      <div class="rule-card rule-card-broken">
        <small>FEATURED CASE · 01</small>
        <h4>복구 시간을 42% 줄인 과정</h4>
        <p>강조색을 여러 개 쓰고 본문을 촘촘하게 채우면 무엇을 먼저 봐야 하는지가 사라집니다. 제목은 작아지고 카드는 그림자로 떠오릅니다.</p>
        <div class="broken-actions"><span>사례 보기</span><span>이력서</span><span>블로그</span><span>연락</span></div>
      </div>
    </figure>
  </div>
  <div class="rule-lists">
    <div><h3>Do</h3><ul>${spec.rules.do.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul></div>
    <div><h3>Don't</h3><ul>${spec.rules.dont.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul></div>
  </div>`;
}

function sampleOf(model: DesignDocumentModel, kind: DesignSampleEntry["kind"]): DesignSampleEntry {
  return model.sampleEntries.find((entry) => entry.kind === kind)!;
}

function renderPortfolioSample(model: DesignDocumentModel): string {
  const render = (kind: DesignSampleEntry["kind"], body: string, tag = "article") =>
    `<${tag} class="sample sample-${kind}" data-sample-kind="${kind}">${body}</${tag}>`;
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
    <div class="browser-bar"><span></span><span></span><span></span><b>portfolio.local / selected-work</b></div>
    <div class="portfolio-page">
      <nav class="portfolio-nav"><strong>MP.</strong><span>Work · About · Contact</span></nav>
      ${render("hero", `<div><p>Product engineer · Seoul</p><h3>${escapeHtml(hero.value)}</h3><div class="hero-actions"><span class="action-primary">대표 작업 보기</span><span class="action-quiet">소개 다운로드 ↗</span></div></div><div class="hero-plate" aria-hidden="true"><i></i></div>`, "header")}
      <div class="portfolio-metrics">
        ${render("metric", `<strong>${escapeHtml(metric.value)}</strong><p>지난 12개월 · 운영 기록 기준</p>`)}
        ${render("before-after", `<strong>${escapeHtml(beforeAfter.value)}</strong><p>흩어진 절차를 검증 가능한 흐름으로 통합</p>`)}
      </div>
      <div class="portfolio-case">
        ${render("case-study", `<p class="case-index">01 / Featured case</p><h3>${escapeHtml(caseStudy.value)}</h3><p>${escapeHtml(longBody.value)}</p><span class="action-quiet">사례 자세히 보기 ↗</span>`)}
        ${render("image", `${renderArtifactVisual(image.value)}<p>${escapeHtml(image.value)}</p>`)}
      </div>
      ${render("long-body", `<h3>문제부터 결과까지 읽히는 기록</h3><p>${escapeHtml(longBody.value)}</p><p>의사결정의 기준과 검증 방식까지 남겨 다음 작업에서 다시 사용할 수 있게 했습니다.</p>`)}
      <div class="portfolio-proof">
        ${render("no-image", `<span class="proof-index">02</span><h3>${escapeHtml(noImage.value)}</h3><p>이미지가 없어도 역할, 선택, 수치 근거가 한 흐름을 만듭니다.</p>`)}
        ${render("tags", `<h3>사용한 기술과 도구</h3><ul class="tag-list"><li>${escapeHtml(tags.value).replaceAll(" · ", "</li><li>")}</li></ul>`)}
      </div>
      ${render("quote", `<blockquote>${escapeHtml(quote.value)}</blockquote><p>— 함께 일한 동료의 기록</p>`)}
      ${render("link-contact", `<div><p>다음 문제를 함께 풀어볼까요?</p><h3>${escapeHtml(contact.value)}</h3></div><span class="action-primary">대화 시작하기 ↗</span>`)}
      ${render("footer", `<strong>MP.</strong><p>${escapeHtml(footer.value)}</p><span>© 2026</span>`, "footer")}
    </div>
  </div>`;
}

function renderSourceSection(model: DesignDocumentModel, markdownSha256: string): string {
  const spec = model.spec;
  const lock = model.referenceLock;
  const rows: [string, string][] = [
    ["디자인 시스템", `${spec.identity.name} · Specification v${spec.version}`],
    ["원본", `${spec.origin.sourceName ?? "Expresso"} · ${spec.origin.kind}`],
    ["원본 URL", spec.origin.sourceUrl ?? "없음"],
    ["수집 시각", spec.origin.capturedAt ?? "없음"],
    ["출처 표기", spec.origin.attribution ?? "없음"],
    ["판", lock ? `${lock.primaryDirection.designSystemCode} r${lock.primaryDirection.revision}` : "r1"],
    ["DESIGN.md sha256", markdownSha256],
  ];

  return `<table class="spec-table source-table"><tbody>${rows.map(
    ([label, value]) => `<tr><th>${escapeHtml(label)}</th><td colspan="3"><code>${escapeHtml(value)}</code></td></tr>`,
  ).join("")}</tbody></table>`;
}

function renderShowcaseSection(
  model: DesignDocumentModel,
  value: DesignDocumentSection,
  index: number,
  markdownSha256: string,
): string {
  const spec = model.spec;
  let body = "";

  if (value.id === "direction") {
    body = `<div class="move-list">${spec.identity.signatureMoves.map(
      (move, moveIndex) => `<article><b>${pad2(moveIndex + 1)}</b><p>${escapeHtml(move)}</p></article>`,
    ).join("")}</div>
    <ul class="chips">${spec.identity.traits.map((trait) => `<li>${escapeHtml(trait)}</li>`).join("")}</ul>`;
  } else if (value.id === "colors") {
    body = renderColorSection(spec);
  } else if (value.id === "typography") {
    body = renderTypographySection(spec);
  } else if (value.id === "spacing") {
    body = renderSpacingSection(spec);
  } else if (value.id === "shape") {
    body = renderShapeSection(spec);
  } else if (value.id === "composition") {
    body = renderCompositionSection(spec);
  } else if (value.id === "components") {
    body = renderComponentSection(spec);
  } else if (value.id === "imagery") {
    body = renderImagerySection(spec);
  } else if (value.id === "motion") {
    body = renderMotionSection(spec);
  } else if (value.id === "rules") {
    body = renderRulesSection(spec);
  } else if (value.id === "sample-portfolio") {
    body = renderPortfolioSample(model);
  } else if (value.id === "source-revision") {
    body = renderSourceSection(model, markdownSha256);
  }

  const deck = sectionDeck(spec, value.id);
  return `<section id="${value.id}" class="doc-section section-${value.id}" data-design-section="${value.id}">
    <div class="section-head">
      <span class="kicker">${pad2(index + 1)}</span>
      <h2>${escapeHtml(value.title)}</h2>
      <p class="lede">${escapeHtml(sectionHeadline(spec, value))}</p>
      ${deck ? `<p class="deck">${escapeHtml(deck)}</p>` : ""}
    </div>
    ${body}
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
  const facts = [
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
/*
  문서 껍데기는 시스템 자신의 형태를 흉내 내지 않는다. 틀이 견본과 같은 반경·같은
  크기를 쓰면 어디까지가 문서이고 어디부터가 디자인인지 구분되지 않는다.
  껍데기는 --doc-* 로 고정하고, --card-radius 같은 시스템 토큰은 견본 안에서만 쓴다.
*/
:root{${variables}--hairline:color-mix(in srgb,var(--border) 55%,transparent);--ink-muted:color-mix(in srgb,var(--canvas) 66%,var(--text));--doc-radius:10px;--column:min(calc(100% - 48px),var(--content-width))}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-body);font-size:14px;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,p,figure,figcaption,blockquote,ol,ul,dl,dd{margin:0;padding:0}
li{list-style:none}
table{width:100%;border-collapse:collapse}
code{font-family:var(--font-mono)}

.preview-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:26px;height:52px;padding:0 max(24px,calc((100vw - var(--content-width))/2));border-bottom:1px solid var(--hairline);background:color-mix(in srgb,var(--canvas) 88%,transparent);backdrop-filter:saturate(180%) blur(18px)}
.preview-nav strong{font-family:var(--font-display);font-size:15px;letter-spacing:-.03em}
.preview-nav ul{display:flex;gap:18px}
.preview-nav a{color:var(--muted);font-size:11px;text-decoration:none}
.preview-nav a:hover{color:var(--text)}
.preview-nav>span{margin-left:auto;color:var(--muted);font-family:var(--font-mono);font-size:10px}

.cover{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.86fr);align-items:center;gap:clamp(32px,5vw,72px);width:var(--column);margin:0 auto;padding:clamp(56px,8vw,112px) 0 clamp(40px,5vw,64px)}
.cover h1{margin-bottom:16px;font-family:var(--font-display);font-size:clamp(44px,6.5vw,var(--type-example-display));font-weight:600;line-height:.94;letter-spacing:-.05em}
.cover>div>p{max-width:32ch;color:var(--muted);font-size:16px;line-height:1.55}
.cover-actions{display:flex;align-items:center;gap:8px;margin-top:26px}
.action-primary,.action-secondary,.action-quiet{display:inline-flex;align-items:center;justify-content:center;width:max-content;padding:9px 16px;border:var(--border-width) solid transparent;border-radius:var(--control-radius);background:var(--action);color:var(--actionText);font-family:var(--font-body);font-size:12px;text-decoration:none}
.action-secondary{border-color:var(--action);background:transparent;color:var(--action)}
.action-quiet{padding-inline:6px;background:transparent;color:var(--action)}
.cover-plate{display:grid;place-items:center;gap:14px;padding:clamp(28px,4vw,48px);border-radius:var(--card-radius);background:var(--surface)}
.plate-object{width:56%;aspect-ratio:3 / 4;border-radius:var(--card-radius);background:var(--text);box-shadow:var(--shadow)}
.cover-plate figcaption{color:var(--muted);font-size:11px}
.cover-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;width:var(--column);margin:0 auto;padding-top:20px;border-top:1px solid var(--hairline)}
.cover-facts b{display:block;font-size:13px;font-weight:600;letter-spacing:-.01em}
.cover-facts span{color:var(--muted);font-size:11px}

.doc-section{width:var(--column);margin:0 auto;padding:clamp(56px,7vw,100px) 0;border-top:1px solid var(--hairline)}
.section-head{margin-bottom:clamp(28px,3vw,44px)}
.kicker{display:block;margin-bottom:16px;color:var(--muted);font-family:var(--font-mono);font-size:11px;letter-spacing:.1em}
.section-head h2{max-width:20ch;font-family:var(--font-display);font-size:clamp(34px,4.6vw,56px);font-weight:600;line-height:1.02;letter-spacing:-.045em}
.lede{max-width:34ch;margin-top:18px;font-size:clamp(16px,1.8vw,20px);line-height:1.45;letter-spacing:-.015em}
.deck{max-width:62ch;margin-top:10px;color:var(--muted);font-size:13px;line-height:1.65}
.token-group{margin-top:34px}
.token-group h3,.rhythm-demo h3,.rule-lists h3{margin-bottom:14px;font-size:12px;font-weight:600;letter-spacing:-.01em}

.spec-table th,.spec-table td{padding:11px 0;border-bottom:1px solid var(--hairline);text-align:left;vertical-align:top}
.spec-table tr:last-child th,.spec-table tr:last-child td{border-bottom:0}
.spec-table th{width:150px;color:var(--muted);font-size:11px;font-weight:400}
.spec-table td{font-size:12px}
.spec-table code{font-size:11px}
.spec-table .numeric{width:96px;font-family:var(--font-mono);font-size:11px}
.spec-table b{padding:3px 8px;border-radius:999px;font-family:var(--font-body);font-size:10px;font-weight:400}
.level-pass{background:var(--action);color:var(--actionText)}
.level-fail{border:1px solid var(--border);color:var(--muted)}
.source-table th{width:170px}
.source-table code{word-break:break-all}

.swatch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:10px}
.swatch{padding:10px;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.swatch i{display:block;height:46px;margin-bottom:11px;border-radius:6px;box-shadow:inset 0 0 0 1px var(--border)}
.swatch strong{display:block;font-size:11px;font-weight:600}
.swatch code{display:block;margin-top:2px;color:var(--muted);font-size:10px}
.swatch span{display:block;margin-top:9px;color:var(--muted);font-size:11px;line-height:1.5}

.ramp-row{display:grid;grid-template-columns:158px minmax(0,1fr);gap:20px;align-items:baseline;padding:18px 0;border-bottom:1px solid var(--hairline)}
.ramp-row:first-child{padding-top:0}
.ramp-meta strong{display:block;font-family:var(--font-mono);font-size:11px;font-weight:400}
.ramp-meta code{display:block;margin-top:3px;color:var(--muted);font-size:10px}
.ramp-specimen{font-family:var(--font-display);font-weight:600;letter-spacing:-.03em}

.scale-row{display:flex;flex-wrap:wrap;gap:8px}
.scale-chip{padding:12px 14px;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.scale-chip b{display:block;font-family:var(--font-display);font-size:19px;font-weight:600;letter-spacing:-.03em}
.scale-chip i{font-size:11px;font-style:normal;font-weight:400;color:var(--muted)}
.scale-chip code{display:block;margin-top:3px;color:var(--muted);font-size:10px}
.measure-stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:12px}
.measure-bars,.rhythm-demo{padding:22px;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.measure-bars article{display:grid;grid-template-columns:112px minmax(0,1fr) 56px;align-items:center;gap:12px;padding:9px 0}
.measure-bars code{color:var(--muted);font-size:10px}
.measure-bars span{display:block;height:6px;border-radius:999px;background:var(--action)}
.measure-bars b{font-family:var(--font-mono);font-size:11px;font-weight:400;text-align:right}
.rhythm-row{display:flex;align-items:center;margin-bottom:14px}
.rhythm-row i{width:52px;height:40px;border-radius:6px;background:var(--border)}
.rhythm-row em{margin-left:auto;padding-left:14px;color:var(--muted);font-family:var(--font-mono);font-size:10px;font-style:normal}
.rhythm-element{gap:var(--element-gap)}
.rhythm-component{gap:var(--component-gap)}
.rhythm-section{gap:min(var(--section-gap),140px);margin-bottom:0}

.spec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:10px}
.spec-card{display:flex;flex-direction:column;padding:12px;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.spec-name{font-family:var(--font-mono);font-size:10px;color:var(--text)}
.spec-figure{display:grid;place-items:center;min-height:88px;margin:12px 0}
.spec-line{color:var(--muted);font-size:10px;line-height:1.5}
.radius-proof{display:block;width:60px;height:44px;background:var(--text)}
.radius-card{border-radius:var(--card-radius)}
.radius-control{border-radius:var(--control-radius)}
.radius-border{border:var(--border-width) solid var(--text);border-radius:6px;background:transparent}
.radius-shadow{border:1px solid var(--hairline);border-radius:6px;background:var(--canvas);box-shadow:var(--shadow)}
.surface-stack{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.surface-plate{padding:24px;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.surface-plate strong{display:block;font-family:var(--font-mono);font-size:11px;font-weight:400}
.surface-plate span{display:block;margin-top:8px;color:var(--muted);font-size:11px;line-height:1.5}
.surface-canvas{background:var(--canvas)}
.surface-surface{background:var(--surface)}
.surface-elevated{background:var(--elevated);box-shadow:var(--shadow)}
.tag-chip{display:inline-flex;padding:5px 10px;border:var(--border-width) solid var(--border);border-radius:var(--control-radius);color:var(--muted);font-size:11px}

.move-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.move-list article{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding:18px;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.move-list b{color:var(--muted);font-family:var(--font-mono);font-size:10px;font-weight:400}
.move-list p{font-size:13px;line-height:1.5;letter-spacing:-.01em}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.chips li{padding:5px 10px;border:1px solid var(--hairline);border-radius:999px;color:var(--muted);font-size:11px;white-space:nowrap}

.layout-viewport{display:flex;justify-content:center;min-height:340px;padding:22px 0;border:1px solid var(--hairline);border-radius:var(--doc-radius);background:var(--surface)}
.layout-canvas{display:grid;grid-template-rows:32px minmax(0,1fr) 22px;gap:var(--component-gap);padding:var(--component-gap) 0;border-left:1px dashed var(--border);border-right:1px dashed var(--border)}
.layout-canvas header,.layout-canvas footer{margin:0 var(--element-gap);border-radius:6px;background:var(--border)}
.layout-canvas main{display:grid;grid-template-columns:1.6fr 1fr;grid-template-rows:1fr .56fr;gap:var(--element-gap);margin:0 var(--element-gap)}
.layout-canvas i{border-radius:calc(var(--card-radius) * .6);background:var(--canvas)}
.layout-canvas i:first-child{grid-row:1/-1;background:var(--text)}
.layout-stage .spec-table{margin-top:20px}

.component-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.component-card{overflow:hidden;border:1px solid var(--hairline);border-radius:var(--doc-radius)}
.component-card>header{display:flex;gap:9px;padding:12px 14px;border-bottom:1px solid var(--hairline)}
.component-card>header span{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.component-card>header strong{font-size:11px;font-weight:600}
.component-figure{padding:26px;background:var(--surface)}
.preview-hero,.preview-case{display:flex;flex-direction:column;min-height:150px}
.preview-hero small,.preview-case small{color:var(--muted);font-family:var(--font-mono);font-size:9px;letter-spacing:.1em}
.preview-hero strong,.preview-case strong{margin:14px 0 auto;font-family:var(--font-display);font-size:26px;line-height:1.1;letter-spacing:-.04em}
.preview-hero .action-primary{margin-top:16px}
.preview-case span{margin-top:12px;color:var(--muted);font-size:11px}
.preview-metric{display:grid;align-content:center;min-height:150px}
.preview-metric strong{font-family:var(--font-display);font-size:58px;line-height:1;letter-spacing:-.06em}
.preview-metric span{margin-top:6px;font-size:14px}
.preview-metric small{color:var(--muted);font-family:var(--font-mono);font-size:10px}
.preview-contact{display:flex;align-items:center;justify-content:center;gap:12px;min-height:150px}
.component-meta{padding:14px}
.component-meta p{font-size:12px;line-height:1.6}
.component-meta dl{display:grid;grid-template-columns:44px minmax(0,1fr);gap:6px 10px;margin-top:12px}
.component-meta dt{color:var(--muted);font-size:10px}
.component-meta dd{color:var(--muted);font-size:11px}
.component-meta code{font-size:10px}

.imagery-stage{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:24px;align-items:start}
.artifact{position:relative;min-height:340px;overflow:hidden;border-radius:var(--card-radius);background:var(--surface)}
.artifact-frame{position:absolute;inset:10% 8%;overflow:hidden;border:6px solid var(--text);border-radius:calc(var(--card-radius) * .8);background:var(--canvas)}
.artifact-frame i{display:inline-block;width:6px;height:6px;margin:12px 0 0 7px;border-radius:50%;background:var(--muted)}
.artifact-copy{position:absolute;top:26%;left:16%;display:grid;gap:9px;width:42%}
.artifact-copy b{height:12px;border-radius:7px;background:var(--text)}
.artifact-copy b:nth-child(2){width:74%}
.artifact-copy b:nth-child(3){width:52%;background:var(--action)}
.artifact-chart{position:absolute;right:15%;bottom:24%;height:30%;display:flex;align-items:flex-end;gap:6px}
.artifact-chart i{width:13px;background:var(--text)}
.artifact-chart i:nth-child(1){height:32%}
.artifact-chart i:nth-child(2){height:52%}
.artifact-chart i:nth-child(3){height:74%}
.artifact-chart i:nth-child(4){height:58%}
.artifact-chart i:nth-child(5){height:100%;background:var(--action)}
.artifact-status{position:absolute;left:16%;bottom:19%;font-family:var(--font-display);font-size:30px;font-weight:700;letter-spacing:-.05em}
.artifact-status small{display:block;color:var(--muted);font-family:var(--font-mono);font-size:9px;font-weight:400;letter-spacing:0}

.motion-block{display:block;width:64px;height:64px;border-radius:calc(var(--card-radius) * .7);background:var(--action)}
.motion-rise{animation:doc-rise calc(var(--motion-duration) * 3) var(--motion-easing) infinite alternate}
.motion-focus{animation:doc-focus calc(var(--motion-duration) * 3) var(--motion-easing) infinite alternate}
.motion-still{background:var(--surface);border:1px solid var(--border)}
@keyframes doc-rise{from{opacity:.25;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes doc-focus{from{transform:scale(.86)}to{transform:scale(1.06)}}

.rule-visual{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rule-visual figure{display:flex;flex-direction:column}
.rule-visual .rule-card{flex:1}
.rule-visual figcaption{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
.rule-visual figcaption b{font-size:11px;font-weight:600}
.rule-visual figcaption span{color:var(--muted);font-size:11px}
.rule-card{display:flex;flex-direction:column;min-height:210px;padding:24px;border:var(--border-width) solid var(--border);border-radius:var(--card-radius)}
.rule-card small{color:var(--muted);font-family:var(--font-mono);font-size:9px;letter-spacing:.1em}
.rule-card h4{margin:16px 0 10px;font-family:var(--font-display);font-size:22px;font-weight:600;line-height:1.15;letter-spacing:-.03em}
.rule-card p{max-width:38ch;color:var(--muted);font-size:12px;line-height:1.6}
.rule-card .action-primary{margin-top:auto}
.rule-card-broken{border-color:var(--accent);background:var(--accent);color:var(--actionText);box-shadow:0 16px 36px color-mix(in srgb,var(--text) 32%,transparent)}
.rule-card-broken small,.rule-card-broken p{color:var(--actionText)}
.rule-card-broken h4{margin-bottom:6px;font-size:15px;letter-spacing:0}
.rule-card-broken p{max-width:none;font-size:11px;line-height:1.25}
.broken-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:auto;padding-top:12px}
.broken-actions span{padding:6px 10px;border-radius:var(--control-radius);background:var(--action);color:var(--actionText);font-size:11px}
.broken-actions span:nth-child(2){background:var(--text)}
.broken-actions span:nth-child(3){background:var(--canvas);color:var(--text)}
.broken-actions span:nth-child(4){background:var(--elevated);color:var(--text)}
.rule-lists{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px}
.rule-lists li{padding:10px 0;border-bottom:1px solid var(--hairline);font-size:12px;line-height:1.6}
.rule-lists li:last-child{border-bottom:0}

.portfolio-browser{overflow:hidden;border:1px solid var(--hairline);border-radius:var(--doc-radius);background:var(--canvas)}
.browser-bar{display:flex;align-items:center;gap:6px;height:38px;padding:0 14px;background:var(--text);color:var(--canvas)}
.browser-bar>span{width:7px;height:7px;border-radius:50%;background:var(--canvas);opacity:.4}
.browser-bar b{margin-left:10px;font-family:var(--font-mono);font-size:9px;font-weight:400;opacity:.6}
.portfolio-page{padding:0 6%;font-size:var(--type-example-body);line-height:var(--line-example-body)}
.portfolio-nav{display:flex;align-items:center;height:62px;border-bottom:1px solid var(--hairline)}
.portfolio-nav span{margin-left:auto;color:var(--muted);font-size:11px}
.sample-hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);align-items:center;gap:36px;padding:clamp(44px,6vw,80px) 0;border-bottom:1px solid var(--hairline)}
.sample-hero>div>p{color:var(--muted);font-size:12px}
.sample-hero h3{max-width:14ch;margin:12px 0 24px;font-family:var(--font-display);font-size:clamp(34px,4.6vw,62px);line-height:.99;letter-spacing:-.05em}
.hero-actions{display:flex;align-items:center;gap:10px}
.hero-plate{position:relative;justify-self:end;width:100%;max-width:280px;aspect-ratio:4 / 5;border-radius:var(--card-radius);background:var(--text)}
.hero-plate i{position:absolute;inset:24%;border:1px solid var(--canvas);border-radius:50%;opacity:.28}
.portfolio-metrics{display:grid;grid-template-columns:1fr 1.4fr;border-bottom:1px solid var(--hairline)}
.portfolio-metrics .sample{padding:36px 0}
.portfolio-metrics .sample + .sample{padding-left:36px;border-left:1px solid var(--hairline)}
.portfolio-metrics strong{display:block;max-width:16ch;font-family:var(--font-display);font-size:clamp(24px,3.2vw,42px);line-height:1.04;letter-spacing:-.045em}
.portfolio-metrics p{margin-top:10px;color:var(--muted);font-size:12px}
.portfolio-case{display:grid;grid-template-columns:.85fr 1.15fr;gap:36px;padding:clamp(44px,6vw,76px) 0;border-bottom:1px solid var(--hairline)}
.sample-case-study{display:flex;flex-direction:column;justify-content:center}
.case-index,.proof-index{color:var(--muted);font-family:var(--font-mono);font-size:9px;letter-spacing:.1em}
.sample-case-study h3,.sample-long-body h3,.sample-no-image h3,.sample-tags h3{margin:10px 0 14px;font-family:var(--font-display);font-size:26px;line-height:1.12;letter-spacing:-.03em}
.sample-case-study p,.sample-long-body p,.sample-no-image p{color:var(--muted)}
.sample-case-study .action-quiet{margin-top:16px;padding-left:0}
.sample-image>p{margin-top:10px;color:var(--muted);font-size:11px}
.sample-long-body{max-width:var(--measure);padding:clamp(48px,6vw,88px) 0}
.sample-long-body p + p{margin-top:14px}
.portfolio-proof{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-bottom:clamp(44px,6vw,76px)}
.portfolio-proof>.sample{display:flex;flex-direction:column;min-height:220px;padding:28px;border-radius:var(--card-radius);background:var(--surface)}
.sample-no-image h3{margin-bottom:auto}
.tag-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
.tag-list li{padding:6px 10px;border:var(--border-width) solid var(--border);border-radius:var(--control-radius);color:var(--muted);font-size:11px}
.sample-quote{display:grid;place-items:center;min-height:300px;padding:clamp(48px,6vw,88px) 8%;border-radius:var(--card-radius);background:var(--text);color:var(--canvas);text-align:center}
.sample-quote blockquote{max-width:20ch;font-family:var(--font-display);font-size:clamp(24px,3.4vw,42px);line-height:1.12;letter-spacing:-.04em}
.sample-quote p{margin-top:18px;color:var(--ink-muted);font-size:12px}
.sample-link-contact{display:flex;align-items:center;flex-wrap:wrap;gap:22px;padding:clamp(40px,5vw,68px) 0;border-bottom:1px solid var(--hairline)}
.sample-link-contact>div{margin-right:auto}
.sample-link-contact p{color:var(--muted);font-size:12px}
.sample-link-contact h3{margin-top:4px;font-family:var(--font-display);font-size:clamp(22px,2.8vw,32px);letter-spacing:-.03em}
.sample-footer{display:grid;grid-template-columns:auto 1fr auto;gap:22px;align-items:center;min-height:92px}
.sample-footer p{color:var(--muted);font-size:11px}
.sample-footer span:last-child{color:var(--muted);font-family:var(--font-mono);font-size:10px}

.rule-sheet{margin-top:30px;border-top:1px solid var(--hairline)}
.rule-sheet summary{display:flex;align-items:center;gap:8px;padding:16px 0;color:var(--muted);font-size:11px;cursor:pointer}
.rule-sheet summary span{font-family:var(--font-mono);font-size:10px}
.doc-lines{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;padding-bottom:18px;color:var(--muted);font-size:11px;line-height:1.55}
.doc-lines li{padding:7px 0;border-bottom:1px solid var(--hairline)}

@media(max-width:960px){
.cover,.measure-stage,.imagery-stage,.component-grid,.sample-hero,.portfolio-case{grid-template-columns:1fr}
.cover-facts{grid-template-columns:1fr 1fr}
.surface-stack{grid-template-columns:1fr}
.hero-plate{justify-self:start;max-width:240px}
.plate-object{width:42%}
}
@media(max-width:640px){
.preview-nav ul{display:none}
:root{--column:calc(100% - 36px)}
.section-head h2{font-size:30px}
.lede{font-size:16px}
.ramp-row{grid-template-columns:1fr;gap:8px}
.spec-table th{width:110px}
.rule-visual,.rule-lists,.portfolio-metrics,.portfolio-proof,.doc-lines{grid-template-columns:1fr}
.measure-bars,.rhythm-demo{padding:16px}
.measure-bars article{grid-template-columns:84px minmax(0,1fr) 46px;gap:8px}
.rhythm-row i{width:38px;height:32px}
.rhythm-component{gap:min(var(--component-gap),40px)}
.rhythm-section{gap:min(var(--section-gap),72px)}
.portfolio-metrics .sample + .sample{padding-left:0;border-left:0;border-top:1px solid var(--hairline)}
.sample-link-contact{align-items:flex-start;flex-direction:column}
.sample-footer{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.motion-rise,.motion-focus{animation:none}}
</style>
</head>
<body>
  <nav class="preview-nav"><strong>${title}</strong><ul><li><a href="#colors">Colors</a></li><li><a href="#typography">Typography</a></li><li><a href="#components">Components</a></li><li><a href="#sample-portfolio">Live portfolio</a></li></ul><span>r${revision}</span></nav>
  <header class="cover">
    <div>
      <h1>${title}</h1>
      <p>${thesis}</p>
      <div class="cover-actions"><a class="action-primary" href="#sample-portfolio">Live portfolio 보기</a><a class="action-quiet" href="#colors">시스템 살펴보기 ↓</a></div>
    </div>
    <figure class="cover-plate">
      <div class="plate-object" aria-hidden="true"></div>
      <figcaption>대표 이미지 자리 · shadow ${escapeHtml(spec.shape.shadowStyle)}</figcaption>
    </figure>
  </header>
  <div class="cover-facts">${facts.map(
    ({ value, label }) => `<span><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></span>`,
  ).join("")}</div>
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
