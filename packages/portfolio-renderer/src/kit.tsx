import React from "react";
import { defineRegistry } from "@json-render/react";
import type {
  DesignSystemSpecV2,
  StructuredPortfolioContent,
  StructuredSection,
} from "@expresso/contracts";

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
  return `${fontImportCss(spec)}.xp-page{${cssVariables(spec)}--xp-muted:${readable.mutedOnCanvas};--xp-muted-surface:${readable.mutedOnSurface};--xp-accent-text:${readable.accentText};--xp-action-text:${readable.actionText};--xp-weight:${strong};--xp-weight-mid:${mid};--xp-tracking:${tracking}}\n${KIT_CSS}`;
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

type CaseKind = "essay" | "technical" | "process" | "gallery" | "panel";

function Case({ section, kind }: { section: StructuredSection; kind: CaseKind }) {
  const first = section.media[0];
  const isSkills = section.pattern === "skills";
  let body: React.ReactNode;
  if (kind === "technical")
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
    <article id={`section-${section.id}`} className="xp-block xp-case" data-case-type={kind}>
      <CaseHead section={section} />
      {/* 본문 조각을 한 묶음으로 둡니다. 넓은 여백 배치에서 제목 칸 높이가 본문 첫 조각의 행 높이를 늘리지 않습니다. */}
      <div className="xp-case-body">
        {body}
        <Sources section={section} />
      </div>
    </article>
  );
}

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
    NameIntro: ({ props: { profile, sections, variant } }) => {
      const { content } = useKit();
      const art = sections?.find((section) => section.media.length)?.media[0];
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
          <header id="intro" className="xp-hero" data-variant="split">
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
          </header>
        );
      if (mode === "media")
        return (
          <header id="intro" className="xp-hero" data-variant="media">
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
          </header>
        );
      return (
        <header id="intro" className="xp-hero" data-variant="statement">
          <p className="xp-eyebrow">{profile.role}</p>
          <h1 className="xp-name">{profile.name}</h1>
          <p className="xp-headline">{profile.headline}</p>
          <Paragraphs value={profile.intro} className="xp-body xp-lead" />
          {focus}
          {actions}
        </header>
      );
    },
    ProjectIndex: ({ props: { sections, variant } }) => {
      const { caseNumbers } = useKit();
      const number = (id: string, index: number) => twoDigits(caseNumbers.get(id) ?? index + 1);
      const projects = sections.filter((section) => section.pattern === "project");
      const items = projects.length ? projects : sections;
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
    CaseEssay: ({ props }) => <Case section={props.section} kind="essay" />,
    CaseGallery: ({ props }) => <Case section={props.section} kind="gallery" />,
    CaseTechnical: ({ props }) => <Case section={props.section} kind="technical" />,
    CaseProcess: ({ props }) => <Case section={props.section} kind="process" />,
    ContentPanel: ({ props }) => <Case section={props.section} kind="panel" />,
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
        <div className="xp-evidence-list">
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
    if (id && projects.has(id) && !numbers.has(id)) numbers.set(id, numbers.size + 1);
    for (const child of node.children ?? []) visit(child);
  };
  visit(spec.root);
  return numbers;
}
