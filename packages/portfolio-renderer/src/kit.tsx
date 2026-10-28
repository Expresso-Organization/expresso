import React from "react";
import { defineRegistry } from "@json-render/react";
import type {
  DesignSystemSpecV2,
  StructuredBackdrop,
  StructuredPortfolioContent,
  StructuredSection,
} from "@expresso/contracts";

import { Backdrop, BACKDROP_CSS, backdropAttributes, backdropCss, resolveBackdrop } from "./backdrop.js";
import { structuredCatalog } from "./catalog.js";
import { cssVariables, fontImportCss, readableColors } from "./design-tokens.js";
import { KIT_CSS } from "./kit-styles.js";

/** 키트 컴포넌트가 함께 읽는 문맥입니다. 연락처 유무와 근거 제목처럼 한 요소의 props 밖에 있는 값입니다. */
export const KitContext = React.createContext<{
  content: StructuredPortfolioContent;
  evidenceTitles: ReadonlyMap<string, string>;
  design: DesignSystemSpecV2;
  /** 읽는 순서로 매긴 프로젝트 사례 번호(섹션 ID → 1부터). 목차와 사례 머리가 같은 값을 씁니다. CSS 카운터는 컨테이너 쿼리의 style containment에 갇혀 쓰지 않습니다. */
  caseNumbers: ReadonlyMap<string, number>;
  /** 글 · 목록형에서 읽는 순서로 첫 사례 행의 섹션 ID. 그 행 위에 목록 제목을 둡니다. */
  firstRowId?: string | undefined;
} | null>(null);

function useKit() {
  const value = React.useContext(KitContext);
  if (!value) throw new Error("키트 문맥이 없습니다.");
  return value;
}

/** 디자인 시스템 토큰과 키트 보정 변수로 지면 CSS를 만듭니다. 글꼴 불러오기가 맨 앞입니다. */
export function kitCss(spec: DesignSystemSpecV2): string {
  const readable = readableColors(spec);
  const weights = [...spec.typography.weights].sort((a, b) => a - b);
  const strong = Math.min(weights.at(-1) ?? 600, 700);
  const mid = weights.find((weight) => weight >= 500 && weight < strong) ?? strong;
  // 자간은 디자인이 고른 값 중 가장 좁은 것을 제목에 씁니다.
  const tracking = spec.typography.letterSpacing.find((value) => value.trim().startsWith("-")) ?? "-0.01em";
  return `${fontImportCss(spec)}.xp-page{${cssVariables(spec)}--xp-muted:${readable.mutedOnCanvas};--xp-muted-surface:${readable.mutedOnSurface};--xp-accent-text:${readable.accentText};--xp-action-text:${readable.actionText};--xp-muted-field:${readable.mutedOnField};--xp-muted-inverse:${readable.mutedOnInverse};--xp-accent-inverse:${readable.accentOnInverse};--xp-weight:${strong};--xp-weight-mid:${mid};--xp-tracking:${tracking}}\n${KIT_CSS}\n${backdropCss(spec)}\n${BACKDROP_CSS}`;
}

const PATTERN_LABEL: Record<StructuredSection["pattern"], string> = {
  project: "프로젝트",
  about: "소개",
  skills: "역량",
  career: "경력",
};

function Paragraphs({ value, className = "xp-body" }: { value: string; className?: string }) {
  const parts = value.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className={className}>
      {parts.map((part, index) => (
        <p key={index}>{part}</p>
      ))}
    </div>
  );
}

function Figure({ media, caption = true }: { media: StructuredSection["media"][number]; caption?: boolean }) {
  return (
    <figure className="xp-figure">
      <img src={media.src} alt={media.alt} loading="lazy" />
      {caption ? <figcaption className="xp-small">{media.alt}</figcaption> : null}
    </figure>
  );
}

function Sources({ section }: { section: StructuredSection }) {
  const { evidenceTitles } = useKit();
  if (!section.sourceIds.length) return null;
  return (
    <nav className="xp-sources" aria-label={`${section.title} 관련 자료`}>
      {section.sourceIds.map((key) => (
        <a href={`#source-${key}`} key={key}>
          {evidenceTitles.get(key) ?? "관련 자료"} ↗
        </a>
      ))}
    </nav>
  );
}

/** 짧은 항목은 이름표와 값의 표로, 긴 항목은 제목과 문단으로 둡니다. */
function Details({ details }: { details: StructuredSection["details"] }) {
  if (!details.length) return null;
  const short = details.every((item) => [...item.text].length <= 60);
  if (short)
    return (
      <dl className="xp-par">
        {details.map((item, index) => (
          <React.Fragment key={index}>
            <dt>{item.label}</dt>
            <dd>{item.text}</dd>
          </React.Fragment>
        ))}
      </dl>
    );
  return (
    <div className="xp-notes">
      {details.map((item, index) => (
        <section key={index}>
          <h3 className="xp-h3">{item.label}</h3>
          <Paragraphs value={item.text} />
        </section>
      ))}
    </div>
  );
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

function CaseHead({ section }: { section: StructuredSection }) {
  const { caseNumbers } = useKit();
  const number = caseNumbers.get(section.id);
  return (
    <header className="xp-head">
      <p className="xp-eyebrow">
        {number ? (
          <>
            <span className="xp-num">{twoDigits(number)}</span> ·{" "}
          </>
        ) : null}
        {PATTERN_LABEL[section.pattern]}
      </p>
      <h2 className="xp-h2">{section.title}</h2>
      {section.summary ? <p className="xp-lead">{section.summary}</p> : null}
    </header>
  );
}

/** 이름 글자 수 단계. 화면 폭에 가까운 크기를 쓰는 포스터 이름이 넘치지 않게 CSS가 단계마다 크기를 정합니다. */
function nameLength(name: string): "short" | "medium" | "long" {
  const count = [...name].length;
  return count <= 4 ? "short" : count <= 10 ? "medium" : "long";
}

type Profile = StructuredPortfolioContent["profile"];

/** 포스터형 첫 화면: 행동색 면 위에 화면 폭에 가까운 이름, 한 문장, 집중 분야 글자 띠. */
function PosterIntro({ profile, backdrop }: { profile: Profile; backdrop: StructuredBackdrop }) {
  const strip = profile.focus.length ? profile.focus : [profile.role];
  return (
    <>
    {/* data-bleed: 본문 폭 밖까지 일부러 넓힌 면입니다. 검증의 열 이탈 검사가 이 안을 건너뜁니다(가로 넘침 검사는 그대로). */}
    <header id="intro" className="xp-hero" data-variant="poster" data-bleed="" {...backdropAttributes(backdrop)}>
      <p className="xp-poster-role">{profile.role}</p>
      <h1 className="xp-poster-name" data-name-length={nameLength(profile.name)}>
        {profile.name}
      </h1>
      <p className="xp-poster-line">{profile.headline}</p>
      <a className="xp-poster-cue" href="#work">
        대표 작업 보기 <span aria-hidden="true">↓</span>
      </a>
      {/* 같은 띠를 두 번 이어 붙여 끊김 없이 흐르게 합니다. 두 번째 띠는 보조 기술이 읽지 않습니다. */}
      <div className="xp-marquee" aria-label="집중하는 일">
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1 ? "true" : undefined}>
            {strip.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ))}
      </div>
      <Backdrop backdrop={backdrop} />
    </header>
    {/* 첫 화면은 짧게 두고, 소개 문단은 바로 아래 큰 글자 단락으로 싣습니다. */}
    <section className="xp-poster-about" aria-label="소개">
      <Paragraphs value={profile.intro} className="xp-poster-about-text" />
    </section>
    </>
  );
}

/** 글 · 목록형 첫 화면: 작은 이름과 직무 아래 소개를 큰 문장으로. */
function SentenceIntro({ profile, backdrop }: { profile: Profile; backdrop: StructuredBackdrop }) {
  const { content } = useKit();
  return (
    <header id="intro" className="xp-hero" data-variant="sentence" {...backdropAttributes(backdrop)}>
      <p className="xp-sentence-meta">
        <strong>{profile.name}</strong> · {profile.role}
      </p>
      <h1 className="xp-sentence">{profile.headline}</h1>
      <Paragraphs value={profile.intro} className="xp-body xp-sentence-intro" />
      {profile.focus.length ? (
        <ul className="xp-sentence-focus" aria-label="집중하는 일">
          {profile.focus.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {content.contact ? (
        <p className="xp-small">
          <a href="#contact">연락하기 ↗</a>
        </p>
      ) : null}
      <Backdrop backdrop={backdrop} />
    </header>
  );
}

/** 글 · 목록형의 사례 한 줄: 기간 · 제목 · 요약. 펼치면 본문 · 항목 · 이미지 · 관련 자료가 나옵니다. */
function CaseRow({ section }: { section: StructuredSection }) {
  const { firstRowId } = useKit();
  return (
    <>
      {firstRowId === section.id ? (
        <header className="xp-row-heading">
          <p className="xp-eyebrow">Work</p>
          <h2 className="xp-h2">작업</h2>
        </header>
      ) : null}
      <article id={`section-${section.id}`} className="xp-row" data-case-type="row">
        <details>
          <summary>
            {section.period ? <span className="xp-row-period xp-small">{section.period}</span> : null}
            <span className="xp-row-title">{section.title}</span>
            <span className="xp-row-summary">{section.summary}</span>
            <span className="xp-row-toggle" aria-hidden="true">+</span>
          </summary>
          <div className="xp-row-body">
            {section.media.map((media, index) => (
              <Figure media={media} key={`${media.src}-${index}`} />
            ))}
            <Paragraphs value={section.body} />
            {section.details.map((item, index) => (
              <p className="xp-body xp-row-detail" key={index}>
                <strong>{item.label}</strong> {item.text}
              </p>
            ))}
            <Sources section={section} />
          </div>
        </details>
      </article>
    </>
  );
}

type CaseKind = "essay" | "technical" | "process" | "gallery" | "panel" | "before-after" | "flow" | "showcase";

/** 요소 하나의 지면 변화입니다. 계약 `STRUCTURED_SCALES` · `STRUCTURED_SURFACES` · `STRUCTURED_WIDTHS`와 같은 값입니다. */
type Stage = { scale?: "lead" | "standard" | "compact" | undefined; surface?: "canvas" | "field" | "inverse" | undefined; width?: "content" | "bleed" | undefined };

/**
 * 지면 변화를 최상위 블록의 data 속성으로 옮깁니다. 값이 없으면 기본(standard · canvas · content)이라 속성을 달지 않습니다.
 * 창 폭으로 넓힌 블록에는 `data-bleed`를 함께 달아 측정의 열 이탈 검사가 건너뜁니다.
 */
function stageAttributes(stage: Stage): Record<string, string> {
  return {
    ...(stage.scale && stage.scale !== "standard" ? { "data-scale": stage.scale } : {}),
    ...(stage.surface && stage.surface !== "canvas" ? { "data-surface": stage.surface } : {}),
    ...(stage.width === "bleed" ? { "data-width": "bleed", "data-bleed": "" } : {}),
  };
}

type Metric = NonNullable<StructuredSection["metrics"]>[number];

/**
 * "3.8초" · "420KB" · "1,200만 건"처럼 숫자로 시작하는 값에서 그 숫자를 읽습니다. 숫자로 시작하지 않으면 null입니다.
 * 글 중간의 숫자는 읽지 않습니다. 청사진의 자리 표지(`⟦12⟧`)나 "약 3배" 같은 값에서 엉뚱한 비율이 나오지 않습니다.
 */
export function metricNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/^[+\-−~≈]?\s?(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

/**
 * 전후 수치를 막대 두 줄로 비교합니다. 막대 길이는 둘 중 큰 값을 100%로 둔 비율이고, 값은 막대 옆 글자로 둡니다.
 * 숫자를 읽지 못하면 두 막대를 같은 중립 너비의 외곽선으로 그리고(`data-bars="neutral"`), 값 글자는 그대로 둡니다.
 * 단위는 원문 그대로라 막대는 같은 단위끼리만 비교합니다.
 */
function Compare({ metric }: { metric: Metric }) {
  const before = metric.before ? metricNumber(metric.before) : null;
  const after = metricNumber(metric.value);
  const readable = after !== null && (!metric.before || before !== null);
  const top = readable ? Math.max(Math.abs(before ?? 0), Math.abs(after)) : 0;
  const width = (value: number | null) => (top > 0 && value !== null ? `${Math.max(4, Math.round((Math.abs(value) / top) * 100))}%` : undefined);
  return (
    <div className="xp-compare" data-bars={top > 0 ? "on" : "neutral"}>
      <p className="xp-compare-label">{metric.label}</p>
      {metric.before ? (
        <p className="xp-bar" data-tone="before">
          <span className="xp-bar-fill" style={{ "--w": width(before) } as React.CSSProperties} aria-hidden="true" />
          <span className="xp-small">이전</span>
          <span className="xp-bar-value">{metric.before}</span>
        </p>
      ) : null}
      <p className="xp-bar" data-tone="after">
        <span className="xp-bar-fill" style={{ "--w": width(after) } as React.CSSProperties} aria-hidden="true" />
        <span className="xp-small">{metric.before ? "이후" : "결과"}</span>
        <span className="xp-bar-value">{metric.value}</span>
      </p>
      {metric.note ? <p className="xp-small">{metric.note}</p> : null}
    </div>
  );
}

function Case({ section, kind, stage = {} }: { section: StructuredSection; kind: CaseKind; stage?: Stage }) {
  const first = section.media[0];
  const isSkills = section.pattern === "skills";
  if (kind === "showcase") return <Showcase section={section} stage={stage} />;
  let body: React.ReactNode;
  if (kind === "flow")
    body = (
      <>
        <Flow steps={section.steps ?? []} />
        {first ? <Figure media={first} /> : null}
        <Paragraphs value={section.body} />
        <Details details={section.details} />
      </>
    );
  else if (kind === "before-after")
    body = (
      <div className="xp-case-grid" data-form="before-after">
        <div className="xp-compare-list">
          {(section.metrics ?? []).map((metric, index) => (
            <Compare metric={metric} key={index} />
          ))}
        </div>
        <div className="xp-body-stack">
          {first ? <Figure media={first} /> : null}
          <Paragraphs value={section.body} />
          <Details details={section.details} />
        </div>
      </div>
    );
  else if (kind === "technical")
    body = (
      <div className="xp-case-grid">
        <div className="xp-body-stack">
          {first ? <Figure media={first} /> : null}
          <Paragraphs value={section.body} />
        </div>
        {section.details.length ? (
          <div className="xp-panel">
            <Details details={section.details} />
          </div>
        ) : null}
      </div>
    );
  else if (kind === "process")
    body = (
      <>
        {first ? <Figure media={first} /> : null}
        <Paragraphs value={section.body} />
        <ol className="xp-steps">
          {section.details.map((item, index) => (
            <li key={index}>
              <span className="xp-num" aria-hidden="true">
                {twoDigits(index + 1)}
              </span>
              <div>
                <h3 className="xp-h3">{item.label}</h3>
                <Paragraphs value={item.text} />
              </div>
            </li>
          ))}
        </ol>
      </>
    );
  else if (kind === "gallery")
    body = (
      <>
        <div className="xp-gallery">
          {section.media.map((media, index) => (
            <Figure media={media} key={`${media.src}-${index}`} />
          ))}
        </div>
        <div className="xp-case-grid">
          <Paragraphs value={section.body} />
          <Details details={section.details} />
        </div>
      </>
    );
  else if (kind === "panel" && isSkills)
    body = (
      <>
        <ul className="xp-tags">
          {section.details.map((item, index) => (
            <li key={index}>{item.label}</li>
          ))}
        </ul>
        <Paragraphs value={section.body} />
        <Details details={section.details} />
      </>
    );
  else
    body = (
      <>
        {first ? <Figure media={first} /> : null}
        <Paragraphs value={section.body} />
        <Details details={section.details} />
      </>
    );
  return (
    <article id={`section-${section.id}`} className="xp-block xp-case" data-case-type={kind} {...stageAttributes(stage)}>
      <CaseHead section={section} />
      {/* 본문 조각을 한 묶음으로 둡니다. 넓은 여백 배치에서 제목 칸 높이가 본문 첫 조각의 행 높이를 늘리지 않습니다. */}
      <div className="xp-case-body">
        {body}
        <Sources section={section} />
      </div>
    </article>
  );
}

/**
 * 과정 흐름: 번호 · 연결선 · 단계 이름 · 짧은 설명을 가로로 잇습니다. 좁은 폭에서는 CSS가 세로로 바꿉니다.
 * 번호는 배열 순서로 매기고 글에서 읽지 않습니다.
 */
function Flow({ steps }: { steps: NonNullable<StructuredSection["steps"]> }) {
  if (!steps.length) return null;
  return (
    <ol className="xp-flow" data-count={steps.length}>
      {steps.map((step, index) => (
        <li key={index}>
          <span className="xp-flow-mark" aria-hidden="true">
            <span className="xp-flow-num">{twoDigits(index + 1)}</span>
            <span className="xp-flow-line" />
          </span>
          <h3 className="xp-flow-label">{step.label}</h3>
          {step.text ? <p className="xp-flow-text">{step.text}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** 이미지 전시: 첫 이미지를 지면 폭으로 크게 두고, 그 아래 머리와 본문을 두 단으로 둡니다. */
function Showcase({ section, stage }: { section: StructuredSection; stage: Stage }) {
  const [first, ...rest] = section.media;
  return (
    <article id={`section-${section.id}`} className="xp-block xp-case xp-showcase" data-case-type="showcase" {...stageAttributes(stage)}>
      {first ? (
        <figure className="xp-showcase-art">
          <img src={first.src} alt={first.alt} loading="lazy" />
          <figcaption className="xp-small">{first.alt}</figcaption>
        </figure>
      ) : null}
      <div className="xp-showcase-text">
        <CaseHead section={section} />
        <div className="xp-case-body">
          <Paragraphs value={section.body} />
          <Details details={section.details} />
          {rest.length ? (
            <div className="xp-gallery">
              {rest.map((media, index) => (
                <Figure media={media} key={`${media.src}-${index}`} />
              ))}
            </div>
          ) : null}
          <Sources section={section} />
        </div>
      </div>
    </article>
  );
}

/** 큰 인용: 한 섹션의 quote를 큰 글자로, 그 작업으로 가는 링크를 아래에 둡니다. 글은 받은 그대로 둡니다. */
function PullQuote({ section, stage }: { section: StructuredSection; stage: Stage }) {
  if (!section.quote) return null;
  return (
    <figure className="xp-block xp-quote" {...stageAttributes(stage)}>
      <blockquote className="xp-quote-text">
        <p>{section.quote}</p>
      </blockquote>
      <figcaption className="xp-small">
        <a href={`#section-${section.id}`}>{section.title}</a>
      </figcaption>
    </figure>
  );
}

const stageOf = (props: Stage): Stage => ({ scale: props.scale, surface: props.surface, width: props.width });

const { registry: kitRegistry } = defineRegistry(structuredCatalog, {
  components: {
    PortfolioPage: ({ props, children }) => {
      const { design } = useKit();
      return (
        <main
          className="xp-page"
          data-layout={design.composition.layout}
          data-density={design.composition.density}
          data-chrome={design.componentKit.chrome}
          data-marker={design.componentKit.marker}
          data-emphasis={design.componentKit.emphasis}
          data-divider={design.componentKit.divider}
          data-motion={props.motion}
          data-archetype={props.archetype ?? "case-study"}
          aria-label={`${props.profile.name} 포트폴리오`}
        >
          <div className="xp-inner">
            {children}
            <footer className="xp-footer xp-small">
              <span>{props.profile.name}</span>
              <span>{props.profile.role}</span>
            </footer>
          </div>
        </main>
      );
    },
    NameIntro: ({ props: { profile, sections, variant, backdrop: chosen } }) => {
      const { content } = useKit();
      const art = sections?.find((section) => section.media.length)?.media[0];
      const backdrop = resolveBackdrop(chosen, variant);
      const layer = <Backdrop backdrop={backdrop} />;
      const attributes = backdropAttributes(backdrop);
      if (variant === "poster") return <PosterIntro profile={profile} backdrop={backdrop} />;
      if (variant === "sentence") return <SentenceIntro profile={profile} backdrop={backdrop} />;
      const mode = variant === "media" && art ? "media" : variant === "split" ? "split" : "statement";
      const actions = (
        <div className="xp-actions">
          <a className="xp-act" href="#work">
            대표 작업 보기 <span aria-hidden="true">↓</span>
          </a>
          {content.contact ? (
            <a className="xp-quiet" href="#contact">
              연락하기 ↗
            </a>
          ) : null}
        </div>
      );
      const focus = profile.focus.length ? (
        <ul className="xp-tags" aria-label="집중하는 일">
          {profile.focus.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null;
      if (mode === "split")
        return (
          <header id="intro" className="xp-hero" data-variant="split" {...attributes}>
            <div>
              <p className="xp-eyebrow">{profile.role}</p>
              <h1 className="xp-name">{profile.name}</h1>
            </div>
            <div className="xp-hero-side">
              <p className="xp-headline">{profile.headline}</p>
              <Paragraphs value={profile.intro} className="xp-body xp-lead" />
              {focus}
              {actions}
            </div>
            {layer}
          </header>
        );
      if (mode === "media")
        return (
          <header id="intro" className="xp-hero" data-variant="media" {...attributes}>
            <div className="xp-hero-text">
              <p className="xp-eyebrow">{profile.role}</p>
              <h1 className="xp-name">{profile.name}</h1>
              <p className="xp-headline">{profile.headline}</p>
              <Paragraphs value={profile.intro} className="xp-body xp-lead" />
              {focus}
              {actions}
            </div>
            <figure className="xp-hero-art">
              <img src={art!.src} alt={art!.alt} />
              <figcaption className="xp-small">{art!.alt}</figcaption>
            </figure>
            {layer}
          </header>
        );
      return (
        <header id="intro" className="xp-hero" data-variant="statement" {...attributes}>
          <p className="xp-eyebrow">{profile.role}</p>
          <h1 className="xp-name">{profile.name}</h1>
          <p className="xp-headline">{profile.headline}</p>
          <Paragraphs value={profile.intro} className="xp-body xp-lead" />
          {focus}
          {actions}
          {layer}
        </header>
      );
    },
    ProjectIndex: ({ props: { sections, variant } }) => {
      const { caseNumbers } = useKit();
      const number = (id: string, index: number) => twoDigits(caseNumbers.get(id) ?? index + 1);
      const projects = sections.filter((section) => section.pattern === "project");
      // 목차는 페이지에서 읽는 순서를 따릅니다. 내용의 섹션 순서와 Spec의 배치 순서가 다를 수 있습니다.
      const items = (projects.length ? projects : sections)
        .map((section, index) => ({ section, order: caseNumbers.get(section.id) ?? Number.POSITIVE_INFINITY, index }))
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map(({ section }) => section);
      if (variant === "poster")
        return (
          <nav id="work" className="xp-poster-index" aria-label="선택한 작업">
            <p className="xp-eyebrow">Selected work</p>
            <ol>
              {items.map((section, index) => (
                <li key={section.id}>
                  <a href={`#section-${section.id}`}>
                    <span className="xp-num">{number(section.id, index)}</span>
                    <strong>{section.title}</strong>
                    <span className="xp-small">{section.summary}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        );
      return (
        <nav id="work" className="xp-block xp-index" data-variant={variant} aria-label="선택한 작업">
          <header className="xp-head">
            <p className="xp-eyebrow">Selected work</p>
            <h2 className="xp-h2">선택한 작업</h2>
          </header>
          {variant === "mosaic" ? (
            <div className="xp-mosaic">
              {items.map((section, index) => (
                <a href={`#section-${section.id}`} key={section.id} className="xp-panel">
                  {section.media[0] ? <img src={section.media[0].src} alt={section.media[0].alt} loading="lazy" /> : null}
                  <span className="xp-num xp-small">{number(section.id, index)}</span>
                  <strong>{section.title}</strong>
                  <span className="xp-small">{section.summary}</span>
                </a>
              ))}
            </div>
          ) : (
            <ol className="xp-index-list">
              {items.map((section, index) => (
                <li key={section.id}>
                  <a href={`#section-${section.id}`}>
                    <span className="xp-num">{number(section.id, index)}</span>
                    <span>
                      <strong>{section.title}</strong>
                      <small className="xp-small">{section.summary}</small>
                    </span>
                    <span className="xp-arrow" aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </nav>
      );
    },
    CaseBeforeAfter: ({ props }) => <Case section={props.section} kind="before-after" stage={stageOf(props)} />,
    CaseFlow: ({ props }) => <Case section={props.section} kind="flow" stage={stageOf(props)} />,
    CaseShowcase: ({ props }) => <Case section={props.section} kind="showcase" stage={stageOf(props)} />,
    PullQuote: ({ props }) => <PullQuote section={props.section} stage={stageOf(props)} />,
    MetricStrip: ({ props }) => {
      const { sections } = props;
      const { caseNumbers } = useKit();
      // 섹션마다 첫 수치 하나를, 페이지에서 읽는 순서로 네 개까지 보입니다.
      const items = sections
        .flatMap((section, index) => (section.metrics?.[0] ? [{ section, metric: section.metrics[0], order: caseNumbers.get(section.id) ?? 100 + index }] : []))
        .sort((a, b) => a.order - b.order)
        .slice(0, 4);
      return (
        <section className="xp-block xp-metrics" aria-label="주요 수치" {...stageAttributes(stageOf(props))}>
          <ul className="xp-metric-strip">
            {items.map(({ section, metric }) => (
              <li key={section.id}>
                <a href={`#section-${section.id}`}>
                  <strong className="xp-metric-value">{metric.value}</strong>
                  <span className="xp-metric-label">{metric.label}</span>
                  {metric.before ? <span className="xp-small">이전 {metric.before}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      );
    },
    CaseEssay: ({ props }) => <Case section={props.section} kind="essay" stage={stageOf(props)} />,
    CaseGallery: ({ props }) => <Case section={props.section} kind="gallery" stage={stageOf(props)} />,
    CaseTechnical: ({ props }) => <Case section={props.section} kind="technical" stage={stageOf(props)} />,
    CaseProcess: ({ props }) => <Case section={props.section} kind="process" stage={stageOf(props)} />,
    ContentPanel: ({ props }) => <Case section={props.section} kind="panel" stage={stageOf(props)} />,
    CaseRow: ({ props }) => <CaseRow section={props.section} />,
    Columns: ({ props, children }) => (
      <div className="xp-group" data-group="columns" data-variant={props.variant}>
        {children}
      </div>
    ),
    Grid: ({ props, children }) => (
      <div className="xp-group" data-group="grid" data-variant={props.variant}>
        {children}
      </div>
    ),
    Band: ({ props, children }) => (
      <div className="xp-group" data-group="band" data-variant={props.variant}>
        {children}
      </div>
    ),
    CareerTimeline: ({ props: { career } }) => (
      <section id="career" className="xp-block xp-career">
        <header className="xp-head">
          <p className="xp-eyebrow">Experience</p>
          <h2 className="xp-h2">경력</h2>
        </header>
        <ol className="xp-timeline">
          {career.map((item) => (
            <li key={item.id}>
              <span className="xp-small">{item.period}</span>
              <div>
                <h3 className="xp-h3">{item.organization}</h3>
                <p className="xp-small">{item.role}</p>
                <Paragraphs value={item.description} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    ),
    EvidenceGrid: ({ props: { evidence } }) => (
      <section id="evidence" className="xp-block xp-evidence">
        <header className="xp-head">
          <p className="xp-eyebrow">Evidence</p>
          <h2 className="xp-h2">근거 자료</h2>
        </header>
        <div className="xp-evidence-list" data-reveal="stagger">
          {evidence.map((item) => (
            <details id={`source-${item.id}`} key={item.id}>
              <summary>
                <span className="xp-eyebrow">{item.kind}</span>
                <strong>{item.title}</strong>
                <span className="xp-small">{item.summary}</span>
              </summary>
              <Paragraphs value={item.body} />
            </details>
          ))}
        </div>
      </section>
    ),
    Contact: ({ props: { contact } }) =>
      contact ? (
        <section id="contact" className="xp-block">
          <div className="xp-panel xp-contact">
            <p className="xp-eyebrow">Contact</p>
            <h2 className="xp-h2">연락</h2>
            <a className="xp-act" href={contact.href}>
              {contact.label} ↗
            </a>
          </div>
        </section>
      ) : null,
  },
});

export { kitRegistry };

/** Spec 트리를 읽는 순서로 따라가 프로젝트 사례에 번호를 매깁니다. 소개·역량·경력 사례는 번호 없이 둡니다. */
export function caseNumbers(
  spec: { root: string; elements: Record<string, { type: string; props: unknown; children?: string[] }> },
  content: StructuredPortfolioContent,
): Map<string, number> {
  const projects = new Set(content.sections.filter((section) => section.pattern === "project").map((section) => section.id));
  const numbers = new Map<string, number>();
  const visit = (key: string) => {
    const node = spec.elements[key];
    if (!node) return;
    // 사례 props.section은 {$state: "/sectionById/<id>"} 바인딩입니다.
    const binding = (node.props as { section?: { $state?: unknown } }).section?.$state;
    const id = typeof binding === "string" ? binding.match(/^\/sectionById\/(.+)$/)?.[1] : undefined;
    // 큰 인용도 섹션을 참조하지만 사례가 아닙니다. 인용이 사례보다 앞에 있어도 번호는 사례의 순서로 매깁니다.
    if (id && node.type !== "PullQuote" && projects.has(id) && !numbers.has(id)) numbers.set(id, numbers.size + 1);
    for (const child of node.children ?? []) visit(child);
  };
  visit(spec.root);
  return numbers;
}

/** 읽는 순서로 첫 사례 행(CaseRow)의 섹션 ID를 찾습니다. */
export function firstRowId(
  spec: { root: string; elements: Record<string, { type: string; props: unknown; children?: string[] }> },
): string | undefined {
  const visit = (key: string): string | undefined => {
    const node = spec.elements[key];
    if (!node) return undefined;
    if (node.type === "CaseRow") {
      const binding = (node.props as { section?: { $state?: unknown } }).section?.$state;
      return typeof binding === "string" ? binding.match(/^\/sectionById\/(.+)$/)?.[1] : undefined;
    }
    for (const child of node.children ?? []) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  return visit(spec.root);
}
