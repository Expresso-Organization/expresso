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

function renderSample(entry: DesignSampleEntry): string {
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

function renderSection(model: DesignDocumentModel, value: DesignDocumentSection): string {
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
                    ? `<div class="sample-grid">${model.sampleEntries.map(renderSample).join("")}</div>`
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

export function renderDesignHtml(
  modelInput: DesignDocumentModel,
  markdownSha256: string,
): string {
  const model = DesignDocumentModelSchema.parse(modelInput);
  const hash = zodHash(markdownSha256);
  const sections = model.sections.map((value) => renderSection(model, value)).join("");
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
