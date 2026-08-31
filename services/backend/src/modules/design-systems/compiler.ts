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
      ${render("hero", `<div class="portfolio-hero-copy"><p>Product engineer · Seoul</p><h3>${escapeHtml(hero.value)}</h3><div><span class="contact-action">대표 작업 보기</span><span class="text-action">소개 다운로드 ↗</span></div></div><div class="hero-orbit"><i></i><i></i><b>01</b></div>`, "header")}
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

function renderShowcaseSection(
  model: DesignDocumentModel,
  value: DesignDocumentSection,
  index: number,
): string {
  const spec = model.spec;
  let example = "";

  if (value.id === "direction") {
    example = `<div class="direction-stage"><div><span>DESIGN DIRECTION</span><h3>${escapeHtml(spec.identity.visualThesis)}</h3><p>${escapeHtml(spec.identity.description)}</p></div><aside><small>SIGNATURE MOVE</small><strong>${escapeHtml(spec.identity.signatureMoves[0]!)}</strong><div>${spec.identity.traits.map((trait) => `<span>${escapeHtml(trait)}</span>`).join("")}</div></aside></div>`;
  } else if (value.id === "colors") {
    example = `<div class="token-grid">${COLOR_NAMES.map((name, tokenIndex) => {
      const designToken = spec.colors[name];
      return `<article class="swatch" data-token="${name}"><span style="background:var(--${name})"><b>${String(tokenIndex + 1).padStart(2, "0")}</b></span><div><strong>${name}</strong><code>${escapeHtml(designToken.value)}</code><p>${escapeHtml(designToken.role)}</p></div></article>`;
    }).join("")}</div>`;
  } else if (value.id === "typography") {
    example = `<div class="type-showcase"><div class="type-display"><small>Display specimen</small><strong>일의 결과를<br>분명하게 남깁니다.</strong><p>${escapeHtml(spec.typography.display.family)} · ${escapeHtml(spec.typography.display.role)}</p></div><div class="type-ramp">${spec.typography.scale.map((step) => `<article><span>${escapeHtml(step.name)}</span><strong style="font-size:var(--type-${step.name});line-height:var(--line-${step.name})">Aa 성과를 읽는 방식</strong><code>${escapeHtml(step.size)} / ${escapeHtml(step.lineHeight)}</code></article>`).join("")}</div></div>`;
  } else if (value.id === "spacing") {
    const spacingValues = [spec.spacing.baseUnit, spec.spacing.elementGap, spec.spacing.componentGap, spec.spacing.sectionGap];
    example = `<div class="spacing-stage"><div class="spacing-scale">${spacingValues.map((spacing, spacingIndex) => `<article><span style="width:${Math.min(100, Math.max(14, spacing))}%"></span><b>${String(spacingIndex + 1).padStart(2, "0")}</b><strong>${spacing}px</strong></article>`).join("")}</div><div class="measure-demo"><span>${spec.spacing.contentWidth}px canvas</span><div><i></i><i></i><i></i></div><p>한 화면 안에서 제목, 근거, 행동이 만드는 기본 리듬</p></div></div>`;
  } else if (value.id === "shape") {
    example = `<div class="shape-stage"><article class="surface-card"><small>SURFACE / 01</small><h3>대표 프로젝트</h3><p>경계, 반경, 표면 단계가 만드는 카드 위계입니다.</p><span class="text-action">자세히 보기 ↗</span></article><article class="surface-card elevated"><small>ELEVATED / 02</small><strong>42%</strong><p>검증된 대표 성과</p></article><div class="button-stack"><button type="button">Primary action</button><button type="button" class="button-secondary">Secondary</button><button type="button" class="button-quiet">Text link ↗</button></div></div>`;
  } else if (value.id === "composition") {
    example = `<div class="composition-stage" data-structure="${escapeHtml(spec.composition.structure)}"><div class="layout-label"><small>COMPOSITION</small><strong>${escapeHtml(spec.composition.structure)}</strong><p>${escapeHtml(spec.composition.hierarchy)}</p></div><div class="layout-canvas"><header></header><main><i></i><i></i><i></i><i></i><i></i></main><footer></footer></div></div>`;
  } else if (value.id === "components") {
    example = `<div class="component-grid">${Object.entries(spec.components).map(([name, rule], componentIndex) => `<article class="component-card" data-component="${escapeHtml(name)}"><header><span>${String(componentIndex + 1).padStart(2, "0")}</span><strong>${escapeHtml(name)}</strong></header>${renderComponentPreview(name)}<p>${escapeHtml(rule.description)}</p><small>${rule.anatomy.map(escapeHtml).join(" · ")}</small></article>`).join("")}</div>`;
  } else if (value.id === "imagery") {
    example = `<div class="imagery-stage">${renderArtifactVisual("디자인 이미지 전략 예시")}<aside><small>${escapeHtml(spec.imagery.mode)}</small><h3>프로젝트의 근거를 이미지 한 장에 담습니다.</h3><p>${escapeHtml(spec.imagery.treatment)}</p><span>${escapeHtml(spec.imagery.aspectRatio)} · artifact preview</span></aside></div>`;
  } else if (value.id === "motion") {
    example = `<div class="motion-stage"><article><span>01</span><strong>Reveal</strong><i class="motion-block motion-rise"></i><small>${escapeHtml(spec.motion.duration)}</small></article><article><span>02</span><strong>Focus</strong><i class="motion-block motion-focus"></i><small>${escapeHtml(spec.motion.easing)}</small></article><article><span>03</span><strong>Reduced</strong><i class="motion-block motion-still"></i><small>final state</small></article></div>`;
  } else if (value.id === "rules") {
    example = `<div class="rule-comparison"><article><span>DO / KEEP</span>${spec.rules.do.map((rule) => `<p><i>✓</i>${escapeHtml(rule)}</p>`).join("")}</article><article><span>DON'T / REMOVE</span>${spec.rules.dont.map((rule) => `<p><i>×</i>${escapeHtml(rule)}</p>`).join("")}</article></div>`;
  } else if (value.id === "sample-portfolio") {
    example = renderPortfolioSample(model);
  } else if (value.id === "source-revision") {
    example = `<div class="source-stage"><div><small>DESIGN SYSTEM</small><strong>${escapeHtml(spec.identity.name)}</strong><span>Specification v${spec.version}</span></div><div><small>ORIGIN</small><strong>${escapeHtml(spec.origin.sourceName ?? "Expresso")}</strong><span>${escapeHtml(spec.origin.attribution ?? "Expresso 기본 디자인")}</span></div><div><small>REVISION</small><strong>${escapeHtml(model.referenceLock ? `r${model.referenceLock.primaryDirection.revision}` : "r1")}</strong><span>Deterministic document build</span></div></div>`;
  }

  return `<section id="${value.id}" class="system-section section-${value.id}" data-design-section="${value.id}"><div class="section-heading"><span>${String(index + 1).padStart(2, "0")} — ${SECTION_LABELS[value.id] ?? value.id}</span><h2>${escapeHtml(value.title)}</h2></div>${example}${renderRuleSheet(value)}</section>`;
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
  const title = escapeHtml(model.spec.identity.name);
  const thesis = escapeHtml(model.spec.identity.visualThesis);
  const variables = cssVariables(model.spec);
  const revision = model.referenceLock?.primaryDirection.revision ?? 1;
  const sections = model.sections.map((value, index) => renderShowcaseSection(model, value, index)).join("");

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
:root{${variables}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-body);font-size:var(--type-example-body);line-height:var(--line-example-body);word-break:keep-all;overflow-wrap:anywhere}
button{font:inherit}
.preview-nav{position:sticky;z-index:20;top:0;height:64px;display:flex;align-items:center;gap:36px;padding:0 max(24px,calc((100vw - var(--content-width))/2));border-bottom:1px solid color-mix(in srgb,var(--border) 72%,transparent);background:color-mix(in srgb,var(--canvas) 92%,transparent);backdrop-filter:blur(18px)}
.preview-nav strong{font-family:var(--font-display);font-size:18px;letter-spacing:-.03em}.preview-nav ul{display:flex;gap:24px;margin:0;padding:0;list-style:none}.preview-nav a{color:var(--muted);font-size:12px;text-decoration:none}.preview-nav a:hover{color:var(--text)}.preview-nav>span{margin-left:auto;padding:6px 10px;border-radius:999px;background:var(--surface);color:var(--muted);font-size:11px}
.preview-cover{min-height:720px;display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.72fr);align-items:center;gap:clamp(44px,7vw,104px);width:min(calc(100% - 48px),var(--content-width));margin:auto;padding:96px 0 88px}
.cover-copy>span,.section-heading>span,.direction-stage>div>span,.sample-label,.case-index{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.cover-copy h1{max-width:820px;margin:20px 0 26px;font-family:var(--font-display);font-size:clamp(64px,8vw,var(--type-example-display));font-weight:600;line-height:.94;letter-spacing:-.06em}.cover-copy p{max-width:620px;margin:0;color:var(--muted);font-size:clamp(18px,2vw,24px);line-height:1.45}.cover-actions{display:flex;align-items:center;gap:12px;margin-top:38px}.contact-action,.cover-actions a{display:inline-flex;align-items:center;justify-content:center;width:max-content;padding:11px 18px;border:0;border-radius:var(--control-radius);background:var(--action);color:var(--actionText);font-size:13px;text-decoration:none}.cover-actions a:last-child,.text-action{background:transparent;color:var(--action);text-decoration:none}.cover-meta{display:flex;gap:22px;margin-top:56px}.cover-meta span{display:grid;gap:3px;color:var(--muted);font-size:11px}.cover-meta strong{color:var(--text);font-size:13px;font-weight:600}
.cover-object{position:relative;min-height:520px}.device-shell{position:absolute;inset:2% 2% 4% 10%;overflow:hidden;border:10px solid var(--text);border-radius:38px;background:var(--surface);box-shadow:0 40px 90px color-mix(in srgb,var(--text) 18%,transparent);transform:rotate(-4deg)}.device-bar{height:42px;display:flex;align-items:center;gap:5px;padding:0 16px;background:var(--text)}.device-bar i{width:7px;height:7px;border-radius:50%;background:var(--canvas);opacity:.6}.device-page{height:calc(100% - 42px);display:grid;grid-template-columns:34% 1fr;gap:18px;padding:22px}.device-rail{display:grid;align-content:start;gap:9px;padding:18px;border-radius:20px;background:var(--canvas)}.device-rail b{width:46%;height:10px;border-radius:6px;background:var(--text)}.device-rail i{height:7px;border-radius:5px;background:var(--border)}.device-rail i:nth-of-type(2){width:72%}.device-content{display:grid;grid-template-columns:1fr 1fr;gap:12px}.device-card{display:grid;align-content:end;min-height:124px;padding:18px;border-radius:22px;background:var(--canvas)}.device-card:first-child{grid-column:1/-1;background:var(--text);color:var(--canvas)}.device-card strong{font-size:36px;letter-spacing:-.05em}.device-card b{font-size:12px;letter-spacing:-.02em;white-space:nowrap}.device-card small{color:var(--muted)}.device-card:first-child small{color:var(--body-muted,#cccccc)}.device-accent{position:absolute;right:-2%;bottom:5%;width:160px;height:160px;display:grid;place-items:center;border-radius:50%;background:var(--action);color:var(--actionText);font-size:44px;font-weight:700;box-shadow:0 20px 50px color-mix(in srgb,var(--action) 28%,transparent)}
.system-section{padding:112px max(24px,calc((100vw - var(--content-width))/2));border-top:1px solid var(--border)}.system-section:nth-of-type(even){background:var(--surface)}.section-heading{display:grid;grid-template-columns:180px minmax(0,1fr);align-items:end;gap:28px;margin-bottom:46px}.section-heading h2{max-width:820px;margin:0;font-family:var(--font-display);font-size:clamp(38px,5vw,64px);font-weight:600;line-height:1;letter-spacing:-.045em}.section-heading>span{padding-bottom:7px}
.direction-stage{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:18px}.direction-stage>div,.direction-stage aside{min-height:330px;padding:42px;border-radius:var(--card-radius);background:var(--text);color:var(--canvas)}.direction-stage h3{max-width:760px;margin:58px 0 20px;font-family:var(--font-display);font-size:clamp(36px,5vw,68px);line-height:1;letter-spacing:-.05em}.direction-stage p{max-width:620px;color:var(--body-muted,#cccccc)}.direction-stage aside{display:flex;flex-direction:column;background:var(--elevated);color:var(--text)}.direction-stage aside strong{margin:auto 0;font-size:26px;line-height:1.25;letter-spacing:-.03em}.direction-stage aside div{display:flex;flex-wrap:wrap;gap:7px}.direction-stage aside div span{padding:6px 9px;border:1px solid var(--border);border-radius:999px;font-size:11px}
.token-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.swatch{overflow:hidden;border:1px solid var(--border);border-radius:18px;background:var(--canvas)}.swatch>span{height:148px;display:flex;align-items:flex-start;justify-content:flex-end;padding:14px;border-bottom:1px solid var(--border)}.swatch>span b{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--canvas);color:var(--text);font-family:var(--font-mono);font-size:10px}.swatch>div{padding:18px}.swatch strong,.swatch code{display:block}.swatch strong{font-size:15px}.swatch code{margin-top:4px;color:var(--muted);font-family:var(--font-mono);font-size:11px}.swatch p{margin:16px 0 0;color:var(--muted);font-size:12px}
.type-showcase{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.7fr);gap:18px}.type-display,.type-ramp{padding:42px;border:1px solid var(--border);border-radius:var(--card-radius);background:var(--canvas)}.type-display{display:flex;flex-direction:column;min-height:560px}.type-display>strong{margin:auto 0;font-family:var(--font-display);font-size:var(--type-example-display);line-height:.98;letter-spacing:-.055em}.type-display p{color:var(--muted)}.type-ramp{display:grid}.type-ramp article{display:grid;grid-template-columns:88px 1fr auto;align-items:baseline;gap:16px;padding:22px 0;border-bottom:1px solid var(--border)}.type-ramp article:last-child{border-bottom:0}.type-ramp article>span,.type-ramp code{color:var(--muted);font-family:var(--font-mono);font-size:10px}.type-ramp strong{font-family:var(--font-display);font-weight:600}
.spacing-stage{display:grid;grid-template-columns:.7fr 1.3fr;gap:18px}.spacing-scale,.measure-demo{padding:36px;border-radius:var(--card-radius);background:var(--canvas);border:1px solid var(--border)}.spacing-scale article{display:grid;grid-template-columns:1fr 34px 50px;align-items:center;gap:14px;padding:18px 0;border-bottom:1px solid var(--border)}.spacing-scale article:last-child{border-bottom:0}.spacing-scale article>span{display:block;height:10px;border-radius:999px;background:var(--accent)}.spacing-scale article b,.spacing-scale article strong{font-family:var(--font-mono);font-size:11px}.measure-demo>span{color:var(--muted);font-family:var(--font-mono);font-size:11px}.measure-demo>div{display:grid;grid-template-columns:1fr 1.7fr 1fr;gap:10px;margin:52px 0}.measure-demo i{height:190px;border-radius:18px;background:var(--elevated)}.measure-demo i:nth-child(2){background:var(--text)}.measure-demo p{max-width:520px;margin:0;font-size:22px;line-height:1.35}
.shape-stage{display:grid;grid-template-columns:1.3fr .7fr .8fr;gap:14px}.surface-card,.button-stack{min-height:300px;padding:32px;border:1px solid var(--border);border-radius:var(--card-radius);background:var(--canvas)}.surface-card{display:flex;flex-direction:column}.surface-card h3{margin:auto 0 10px;font-family:var(--font-display);font-size:32px;line-height:1}.surface-card p{color:var(--muted)}.surface-card.elevated{background:var(--elevated)}.surface-card.elevated strong{margin:auto 0 0;font-size:64px;line-height:1;letter-spacing:-.06em}.button-stack{display:flex;flex-direction:column;justify-content:center;gap:10px}.button-stack button{padding:12px 16px;border:1px solid var(--action);border-radius:var(--control-radius);background:var(--action);color:var(--actionText)}.button-stack .button-secondary{background:transparent;color:var(--action)}.button-stack .button-quiet{border-color:transparent;background:transparent;color:var(--muted)}
.composition-stage{display:grid;grid-template-columns:.55fr 1.45fr;min-height:560px;overflow:hidden;border-radius:var(--card-radius);background:var(--text);color:var(--canvas)}.layout-label{display:flex;flex-direction:column;justify-content:flex-end;padding:42px}.layout-label strong{font-size:30px}.layout-label p{color:var(--body-muted,#cccccc)}.layout-canvas{display:grid;grid-template-rows:42px 1fr 28px;gap:10px;margin:28px;padding:18px;border-radius:26px;background:var(--canvas)}.layout-canvas header,.layout-canvas footer{border-radius:10px;background:var(--border)}.layout-canvas main{display:grid;grid-template-columns:1.5fr 1fr;grid-template-rows:1fr .6fr;gap:10px}.layout-canvas i{border-radius:16px;background:var(--surface)}.layout-canvas i:first-child{grid-row:1/-1;background:var(--text)}.layout-canvas i:nth-child(4),.layout-canvas i:nth-child(5){display:none}
.component-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.component-card{overflow:hidden;border:1px solid var(--border);border-radius:var(--card-radius);background:var(--canvas)}.component-card>header{display:flex;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border)}.component-card>header span{font-family:var(--font-mono);font-size:10px;color:var(--muted)}.component-card>p,.component-card>small{display:block;margin:0;padding:0 20px 12px;color:var(--muted)}.component-card>p{padding-top:18px;color:var(--text)}.component-hero,.component-metric,.component-contact,.component-card-preview{min-height:280px;padding:30px;background:var(--surface)}.component-hero,.component-card-preview{display:flex;flex-direction:column}.component-hero strong,.component-card-preview strong{margin:auto 0;font-family:var(--font-display);font-size:36px;line-height:1.05;letter-spacing:-.04em}.component-metric{display:grid;align-content:center}.component-metric strong{font-size:86px;line-height:1;letter-spacing:-.07em}.component-metric span{font-size:18px}.component-metric small{color:var(--muted)}.component-contact{display:flex;align-items:center;justify-content:center;gap:18px}.component-card-preview span{color:var(--muted);font-size:12px}
.imagery-stage{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}.imagery-stage>aside{display:flex;flex-direction:column;justify-content:center;padding:42px;border-radius:var(--card-radius);background:var(--text);color:var(--canvas)}.imagery-stage aside h3{margin:22px 0;font-family:var(--font-display);font-size:38px;line-height:1.05}.imagery-stage aside p{color:var(--body-muted,#cccccc)}.imagery-stage aside span{margin-top:32px;font-family:var(--font-mono);font-size:10px}.artifact-visual{position:relative;min-height:520px;overflow:hidden;border-radius:var(--card-radius);background:var(--elevated)}.artifact-window{position:absolute;inset:11% 9%;overflow:hidden;border:8px solid var(--text);border-radius:26px;background:var(--canvas)}.artifact-window i{display:inline-block;width:8px;height:8px;margin:14px 0 0 8px;border-radius:50%;background:var(--muted)}.artifact-copy{position:absolute;top:27%;left:18%;display:grid;gap:12px;width:42%}.artifact-copy b{height:16px;border-radius:9px;background:var(--text)}.artifact-copy b:nth-child(2){width:74%}.artifact-copy b:nth-child(3){width:52%;background:var(--action)}.artifact-chart{position:absolute;right:16%;bottom:23%;height:32%;display:flex;align-items:flex-end;gap:7px}.artifact-chart i{width:18px;background:var(--text)}.artifact-chart i:nth-child(1){height:32%}.artifact-chart i:nth-child(2){height:52%}.artifact-chart i:nth-child(3){height:74%}.artifact-chart i:nth-child(4){height:58%}.artifact-chart i:nth-child(5){height:100%;background:var(--action)}.artifact-status{position:absolute;left:18%;bottom:19%;font-size:44px;font-weight:700;letter-spacing:-.05em}.artifact-status small{display:block;color:var(--muted);font-size:10px;letter-spacing:0}
.motion-stage{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.motion-stage article{min-height:270px;display:grid;grid-template-columns:1fr auto;align-content:space-between;padding:28px;border:1px solid var(--border);border-radius:var(--card-radius);background:var(--canvas)}.motion-stage article>span,.motion-stage article>small{color:var(--muted);font-family:var(--font-mono);font-size:10px}.motion-block{grid-column:1/-1;justify-self:center;width:92px;height:92px;border-radius:24px;background:var(--action)}.motion-rise{animation:design-rise var(--motion-duration) var(--motion-easing) both}.motion-focus{animation:design-focus calc(var(--motion-duration)*2) var(--motion-easing) infinite alternate}.motion-still{background:var(--elevated);border:1px solid var(--border)}
@keyframes design-rise{from{opacity:.2;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes design-focus{from{transform:scale(.9)}to{transform:scale(1.05)}}
.rule-comparison{display:grid;grid-template-columns:1fr 1fr;gap:14px}.rule-comparison article{min-height:310px;padding:34px;border-radius:var(--card-radius);background:var(--canvas);border:1px solid var(--border)}.rule-comparison article:last-child{background:var(--text);color:var(--canvas)}.rule-comparison article>span{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em}.rule-comparison article p{display:flex;gap:12px;margin:26px 0;font-size:17px}.rule-comparison article i{display:grid;place-items:center;flex:0 0 24px;height:24px;border-radius:50%;background:var(--action);color:var(--actionText);font-style:normal}.rule-comparison article:last-child i{background:var(--canvas);color:var(--text)}
.portfolio-browser{overflow:hidden;border:1px solid var(--border);border-radius:30px;background:var(--canvas);box-shadow:0 36px 90px color-mix(in srgb,var(--text) 12%,transparent)}.browser-chrome{height:48px;display:flex;align-items:center;gap:7px;padding:0 18px;background:var(--text);color:var(--canvas)}.browser-chrome>span{width:8px;height:8px;border-radius:50%;background:var(--canvas);opacity:.5}.browser-chrome b{margin-left:12px;font-family:var(--font-mono);font-size:9px;font-weight:400;opacity:.65}.portfolio-page{padding:0 5%}.portfolio-nav{height:76px;display:flex;align-items:center;border-bottom:1px solid var(--border)}.portfolio-nav span{margin-left:auto;color:var(--muted);font-size:11px}.sample{position:relative}.sample-label{display:block;margin-bottom:14px}.portfolio-hero{min-height:590px;display:grid;grid-template-columns:1.25fr .75fr;align-items:center;gap:40px;border-bottom:1px solid var(--border)}.portfolio-hero-copy>p{color:var(--muted)}.portfolio-hero h3{max-width:720px;margin:18px 0 34px;font-family:var(--font-display);font-size:clamp(52px,7vw,92px);line-height:.96;letter-spacing:-.06em}.portfolio-hero-copy>div{display:flex;align-items:center;gap:18px}.hero-orbit{position:relative;aspect-ratio:1;border-radius:50%;background:var(--text)}.hero-orbit i{position:absolute;inset:20%;border:1px solid var(--canvas);border-radius:50%;opacity:.35}.hero-orbit i:nth-child(2){inset:36%}.hero-orbit b{position:absolute;right:20%;bottom:18%;color:var(--canvas);font-size:44px}.portfolio-metrics{display:grid;grid-template-columns:1fr 1.5fr;border-bottom:1px solid var(--border)}.portfolio-metrics .sample{min-height:230px;padding:38px 0}.portfolio-metrics .sample+ .sample{padding-left:38px;border-left:1px solid var(--border)}.portfolio-metrics strong{display:block;max-width:720px;font-family:var(--font-display);font-size:clamp(34px,5vw,68px);line-height:1;letter-spacing:-.05em}.portfolio-metrics p{color:var(--muted)}.portfolio-case-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:46px;padding:96px 0;border-bottom:1px solid var(--border)}.sample-case-study{display:flex;flex-direction:column;justify-content:center}.sample-case-study h3,.sample-long-body h3,.sample-no-image h3,.sample-tags h3{margin:12px 0 20px;font-family:var(--font-display);font-size:36px;line-height:1.08}.sample-case-study p,.sample-long-body p,.sample-no-image p{color:var(--muted)}.sample-image>p{color:var(--muted);font-size:11px}.sample-long-body{max-width:820px;padding:110px 0}.sample-long-body p{max-width:680px;font-size:18px;line-height:1.7}.portfolio-proof-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding-bottom:96px}.portfolio-proof-grid>.sample{min-height:300px;padding:36px;border-radius:var(--card-radius);background:var(--surface)}.proof-number{display:block;color:var(--muted);font-family:var(--font-mono);font-size:11px}.tags{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.tags li{padding:7px 11px;border:1px solid var(--border);border-radius:999px;font-family:var(--font-mono);font-size:10px}.sample-quote{display:grid;place-items:center;min-height:420px;padding:80px 10%;background:var(--text);color:var(--canvas);text-align:center}.sample-quote blockquote{max-width:850px;margin:0;font-family:var(--font-display);font-size:clamp(34px,5vw,62px);line-height:1.08;letter-spacing:-.04em}.sample-quote p{color:var(--body-muted,#cccccc)}.sample-link-contact{min-height:280px;display:flex;align-items:center;gap:30px;padding:54px 0;border-bottom:1px solid var(--border)}.sample-link-contact>div{margin-right:auto}.sample-link-contact p{color:var(--muted)}.sample-link-contact h3{margin:4px 0;font-family:var(--font-display);font-size:38px}.sample-footer{display:grid;grid-template-columns:auto 1fr auto;gap:28px;align-items:center;min-height:120px}.sample-footer p{color:var(--muted);font-size:12px}.sample-footer span:last-child{font-family:var(--font-mono);font-size:10px}
.source-stage{display:grid;grid-template-columns:repeat(3,1fr);overflow:hidden;border:1px solid var(--border);border-radius:var(--card-radius)}.source-stage>div{min-height:210px;display:flex;flex-direction:column;padding:30px;border-right:1px solid var(--border)}.source-stage>div:last-child{border-right:0}.source-stage small{color:var(--muted);font-family:var(--font-mono);font-size:10px}.source-stage strong{margin:auto 0 6px;font-size:22px}.source-stage span{color:var(--muted);font-size:11px}.rule-sheet{margin-top:26px;border-top:1px solid var(--border)}.rule-sheet summary{display:flex;align-items:center;gap:8px;padding:18px 0;color:var(--muted);font-size:11px;cursor:pointer}.rule-sheet summary span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--elevated);font-family:var(--font-mono);font-size:9px}.doc-lines{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px;padding:0 0 22px;margin:0;list-style:none;color:var(--muted);font-size:11px}.doc-lines li{padding:7px 0;border-bottom:1px solid var(--border)}
@media(max-width:900px){.preview-nav ul{display:none}.preview-cover,.direction-stage,.type-showcase,.spacing-stage,.imagery-stage,.portfolio-hero,.portfolio-case-grid{grid-template-columns:1fr}.preview-cover{padding-top:64px}.cover-object{min-height:440px}.token-grid{grid-template-columns:repeat(2,1fr)}.shape-stage{grid-template-columns:1fr 1fr}.button-stack{grid-column:1/-1;min-height:auto}.composition-stage{grid-template-columns:1fr}.component-grid{grid-template-columns:1fr}.portfolio-hero{padding:70px 0}.hero-orbit{display:none}}
@media(max-width:640px){.preview-nav{padding-inline:18px}.preview-cover{width:min(calc(100% - 28px),var(--content-width));min-height:auto}.cover-copy h1{font-size:56px}.cover-object{min-height:350px}.device-shell{inset:2%}.device-accent{width:110px;height:110px;font-size:30px}.system-section{padding:76px 18px}.section-heading{grid-template-columns:1fr;gap:8px}.section-heading h2{font-size:40px}.direction-stage>div,.direction-stage aside,.type-display,.type-ramp{padding:26px}.token-grid,.shape-stage,.motion-stage,.rule-comparison,.source-stage,.portfolio-metrics,.portfolio-proof-grid{grid-template-columns:1fr}.swatch>span{height:112px}.type-display{min-height:420px}.type-ramp article{grid-template-columns:70px 1fr}.type-ramp code{display:none}.composition-stage{min-height:460px}.component-contact{flex-direction:column}.motion-stage article{min-height:220px}.source-stage>div{min-height:150px;border-right:0;border-bottom:1px solid var(--border)}.portfolio-browser{border-radius:18px}.portfolio-page{padding-inline:18px}.portfolio-nav span{display:none}.portfolio-metrics .sample+ .sample{padding-left:0;border-left:0;border-top:1px solid var(--border)}.sample-link-contact{align-items:flex-start;flex-direction:column}.sample-footer{grid-template-columns:1fr}.doc-lines{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.motion-rise,.motion-focus{animation:none}}
</style>
</head>
<body>
  <nav class="preview-nav"><strong>${title}</strong><ul><li><a href="#colors">Colors</a></li><li><a href="#typography">Typography</a></li><li><a href="#components">Components</a></li><li><a href="#sample-portfolio">Live portfolio</a></li></ul><span>System preview · r${revision}</span></nav>
  <header class="preview-cover"><div class="cover-copy"><span>PORTFOLIO DESIGN SYSTEM / 01</span><h1>${title}</h1><p>${thesis}</p><div class="cover-actions"><a href="#sample-portfolio">Live portfolio 보기</a><a href="#colors">시스템 살펴보기 ↓</a></div><div class="cover-meta"><span><strong>Image first</strong>Content focus</span><span><strong>Spacious</strong>Information density</span><span><strong>AA</strong>Contrast target</span></div></div><div class="cover-object" aria-hidden="true"><div class="device-shell"><div class="device-bar"><i></i><i></i><i></i></div><div class="device-page"><div class="device-rail"><b></b><i></i><i></i><i></i></div><div class="device-content"><div class="device-card"><small>Featured outcome</small><strong>42%</strong></div><div class="device-card"><small>Case 01</small><b>Recovery</b></div><div class="device-card"><small>Case 02</small><b>System</b></div></div></div></div><div class="device-accent">↗</div></div></header>
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
