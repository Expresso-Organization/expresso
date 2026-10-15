import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StateProvider,
  VisibilityProvider,
  ActionProvider,
  Renderer,
  defineRegistry,
} from "@json-render/react";
import { z } from "zod";
import {
  PAGE_MAX_BYTES,
  STRUCTURED_GROUP_VARIANTS,
  StructuredDesignSchema,
  StructuredPortfolioContentSchema as content,
  StructuredSectionSchema,
  validateStructuredPortfolio,
  type StructuredPortfolioContent,
  type StructuredPortfolioSnapshot,
  type StructuredSection,
  type DesignSystemSpecV2,
} from "@expresso/contracts";
import {
  renderCollected,
  collectedSourceName,
  collectedBoundDetails,
  validateLibrarySelection,
  COLLECTED_PORTFOLIO_CSS,
} from "./library.js";
import { STRUCTURED_PORTFOLIO_CSS } from "./styles.js";
import { structuredCatalog } from "./catalog.js";
import { KitContext, kitCss, kitRegistry } from "./kit.js";

export { structuredCatalog };

// 수집한 레지스트리의 구도를 데이터에 연결할 수 있는 어댑터로 확장합니다.
export const STRUCTURED_COMPONENT_SOURCES = {
  ProjectIndex: {
    source: "Watermelon bento-2",
    material: "docs/library/materials/watermelon/registry/bento-2.json",
    adaptation: "가변 모자이크·목록·목차",
  },
  CaseGallery: {
    source: "Watermelon card / bento-2",
    material: "docs/library/materials/watermelon/registry/card.json",
    adaptation: "이미지를 중심으로 전시하는 작품 지면",
  },
  CareerTimeline: {
    source: "Magic Portfolio timeline",
    material: "docs/library/materials/magic-portfolio/timeline.json",
    adaptation: "경력 데이터와 CSS 등장 모션",
  },
  CaseEssay: {
    source: "Expresso v1 ProjectCaseStudy",
    material: "scripts/library/renderer/portfolio/v1/registry.jsx",
    adaptation: "제목·본문·근거의 편집 지면",
  },
  CaseTechnical: {
    source: "Expresso v1 ProjectCaseStudy",
    material: "scripts/library/renderer/portfolio/v1/registry.jsx",
    adaptation: "요약·도면·항목표를 나눈 기술 지면",
  },
  CaseProcess: {
    source: "Expresso v1 ProjectCaseStudy",
    material: "scripts/library/renderer/portfolio/v1/registry.jsx",
    adaptation: "과정별 설명과 자료",
  },
};
// shadcn Card의 구조를 유지하고 포트폴리오 의미 토큰으로 렌더링합니다.
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="card" className={`sp-card ${className}`}>
      {children}
    </div>
  );
}
function Media({ section }: { section: StructuredSection }) {
  return section.media.length ? (
    <div className="sp-media">
      {section.media.map((item, index) => (
        <figure key={`${item.src}-${index}`}>
          <img src={item.src} alt={item.alt} loading="lazy" />
          <figcaption>{item.alt}</figcaption>
        </figure>
      ))}
    </div>
  ) : null;
}
function SectionTitle({ section }: { section: StructuredSection }) {
  return (
    <header className="sp-case-head">
      <p className="sp-kicker">
        {section.pattern === "project" ? "PROJECT" : "PROFILE"}
      </p>
      <h2>{section.title}</h2>
      <p className="sp-summary">{section.summary}</p>
    </header>
  );
}
function Body({ value }: { value: string }) {
  return (
    <div className="sp-body">
      {value
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((part, i) => (
          <p key={i}>{part}</p>
        ))}
    </div>
  );
}
// 사례에서 근거 항목을 제목으로 가리키기 위해 입력의 근거 제목을 전달합니다.
const EvidenceTitles = React.createContext<ReadonlyMap<string, string>>(
  new Map(),
);
function Sources({ section }: { section: StructuredSection }) {
  const titles = React.useContext(EvidenceTitles);
  const links = section.sourceIds.flatMap((key) => {
    const title = titles.get(key);
    return title ? [{ key, title }] : [];
  });
  return links.length ? (
    <nav className="sp-sources" aria-label={`${section.title} 관련 자료`}>
      {links.map(({ key, title }) => (
        <a href={`#source-${key}`} key={key}>
          {title} ↗
        </a>
      ))}
    </nav>
  ) : null;
}
type CaseKind = "essay" | "gallery" | "technical" | "process" | "panel";
// 사례 유형별 항목 표현입니다. 원본을 고른 사례와 아닌 사례가 함께 씁니다.
function Details({
  section,
  kind,
  skip = 0,
}: {
  section: StructuredSection;
  kind: CaseKind;
  skip?: number;
}) {
  const details = section.details.slice(skip);
  if (!details.length) return null;
  return kind === "technical" ? (
    <table className="sp-facts">
      <caption className="sp-sr">{section.title} 작업 설명</caption>
      <tbody>
        {details.map((item, i) => (
          <tr key={i}>
            <th scope="row">{item.label}</th>
            <td>
              <Body value={item.text} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : kind === "process" ? (
    <ol className="sp-steps">
      {details.map((item, i) => (
        <li key={i}>
          <span className="sp-step-number">
            {String(skip + i + 1).padStart(2, "0")}
          </span>
          <div>
            <h3>{item.label}</h3>
            <Body value={item.text} />
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <div className="sp-details">
      {details.map((item, i) => (
        <section key={i}>
          <h3>{item.label}</h3>
          <Body value={item.text} />
        </section>
      ))}
    </div>
  );
}
function Case({
  section,
  kind,
  sourceId,
}: {
  section: StructuredSection;
  kind: CaseKind;
  sourceId?: string | undefined;
}) {
  if (sourceId) {
    const sourceName = collectedSourceName(sourceId);
    const isFeature = sourceName?.startsWith("feature-");
    const isAnnotation =
      sourceName === "annotated-text" || sourceName === "text-gradient";
    // 유형 클래스를 설명 블록에 붙여 원본이 아닌 사례와 같은 그리드·이미지 규칙을 적용합니다.
    const content = (
      <div className={`sp-source-details sp-case-${kind}`}>
        {!isFeature && !isAnnotation && <SectionTitle section={section} />}
        {isAnnotation && <p className="sp-summary">{section.summary}</p>}
        <Media section={section} />
        <Body value={section.body} />
        <Details
          section={section}
          kind={kind}
          skip={collectedBoundDetails(sourceId)}
        />
        <Sources section={section} />
      </div>
    );
    const inside = sourceName === "card";
    return (
      <article
        id={`section-${section.id}`}
        className="sp-case"
        data-case-type={kind}
      >
        {renderCollected(
          sourceId,
          {
            profile: { name: "", role: "", headline: "", intro: "", focus: [] },
            sections: [section],
            section,
          },
          inside ? content : undefined,
        )}
        {!inside && content}
      </article>
    );
  }
  return (
    <article
      id={`section-${section.id}`}
      className={`sp-case sp-case-${kind}`}
      data-case-type={kind}
      data-source-id={section.id}
    >
      <SectionTitle section={section} />
      <Media section={section} />
      <Body value={section.body} />
      <Details section={section} kind={kind} />
      <Sources section={section} />
    </article>
  );
}
const { registry } = defineRegistry(structuredCatalog, {
  components: {
    PortfolioPage: ({ props, children }) => (
      <main
        className="sp-page"
        data-layout={props.design.layout}
        data-palette={props.design.palette}
        data-font={props.design.font}
        data-motion={props.motion}
        aria-label={`${props.profile.name} 포트폴리오`}
      >
        {children}
      </main>
    ),
    NameIntro: ({ props: { profile, sections, sourceId } }) =>
      sourceId ? (
        <header id="intro" className="sp-intro">
          {renderCollected(sourceId, { profile, sections: sections || [] })}
          <div className="sp-source-details">
            <p className="sp-kicker">{profile.role}</p>
            <Body value={profile.intro} />
            <ul className="sp-focus">
              {profile.focus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </header>
      ) : (
        <header id="intro" className="sp-intro">
          <p className="sp-kicker">PERSONAL PORTFOLIO · {profile.role}</p>
          <h1>{profile.name}</h1>
          <p className="sp-definition">{profile.headline}</p>
          <Body value={profile.intro} />
          <ul className="sp-focus">
            {profile.focus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {sections?.[0]?.media[0] && (
            <a className="sp-intro-art" href={`#section-${sections[0].id}`}>
              <Card>
                <div data-slot="card-content">
                  <img
                    src={sections[0].media[0].src}
                    alt={sections[0].media[0].alt}
                  />
                </div>
                <div data-slot="card-header">
                  <small>FEATURED PROJECT</small>
                  <strong>{sections[0].title}</strong>
                </div>
                <div data-slot="card-footer" aria-hidden="true">
                  ↗
                </div>
              </Card>
            </a>
          )}
        </header>
      ),
    ProjectIndex: ({ props: { sections, variant } }) => (
      <nav
        id="work"
        className="sp-index"
        data-variant={variant}
        aria-label="프로젝트 목차"
      >
        <p className="sp-kicker">SELECTED WORK</p>
        <div className="sp-index-items">
          {sections.map((section, index) => (
            <a href={`#section-${section.id}`} key={section.id}>
              <Card>
                <div data-slot="card-content">
                  {variant === "mosaic" && section.media[0] && (
                    <img
                      src={section.media[0].src}
                      alt={section.media[0].alt}
                      loading="lazy"
                    />
                  )}
                </div>
                <div data-slot="card-header">
                  <span className="sp-index-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong data-slot="card-title">{section.title}</strong>
                  <span data-slot="card-description">{section.summary}</span>
                </div>
                <div data-slot="card-footer" aria-hidden="true">
                  ↗
                </div>
              </Card>
            </a>
          ))}
        </div>
      </nav>
    ),
    CaseEssay: ({ props }) => (
      <Case section={props.section} sourceId={props.sourceId} kind="essay" />
    ),
    CaseGallery: ({ props }) => (
      <Case section={props.section} sourceId={props.sourceId} kind="gallery" />
    ),
    CaseTechnical: ({ props }) => (
      <Case
        section={props.section}
        sourceId={props.sourceId}
        kind="technical"
      />
    ),
    CaseProcess: ({ props }) => (
      <Case section={props.section} sourceId={props.sourceId} kind="process" />
    ),
    ContentPanel: ({ props }) => (
      <Case section={props.section} sourceId={props.sourceId} kind="panel" />
    ),
    Columns: ({ props, children }) => (
      <div className="sp-group" data-group="columns" data-variant={props.variant}>
        <div className="sp-group-track">{children}</div>
      </div>
    ),
    Grid: ({ props, children }) => (
      <div className="sp-group" data-group="grid" data-variant={props.variant}>
        <div className="sp-group-track">{children}</div>
      </div>
    ),
    Band: ({ props, children }) => (
      <div className="sp-group" data-group="band" data-variant={props.variant}>
        <div className="sp-group-track">{children}</div>
      </div>
    ),
    CareerTimeline: ({ props: { career } }) => (
      <section id="career" className="sp-career">
        <p className="sp-kicker">EXPERIENCE</p>
        <h2>경력</h2>
        <ol>
          {career.map((item) => (
            <li key={item.id}>
              <span>{item.period}</span>
              <div>
                <h3>{item.organization}</h3>
                <p>{item.role}</p>
                <Body value={item.description} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    ),
    EvidenceGrid: ({ props: { evidence } }) => (
      <section id="evidence" className="sp-evidence">
        <p className="sp-kicker">SUPPORTING MATERIALS</p>
        <h2>관련 자료</h2>
        <div>
          {evidence.map((item) => (
            <details id={`source-${item.id}`} key={item.id}>
              <summary>
                <small>{item.kind}</small>
                <strong>{item.title}</strong>
                <span>{item.summary}</span>
              </summary>
              <Body value={item.body} />
            </details>
          ))}
        </div>
      </section>
    ),
    Contact: ({ props: { contact } }) =>
      contact ? (
        <footer id="contact" className="sp-contact">
          <p className="sp-kicker">CONTACT</p>
          <a href={contact.href}>{contact.label} ↗</a>
        </footer>
      ) : null,
  },
});

/** 렌더링 단계의 실패입니다. Spec 검사를 통과한 뒤에 나므로 Spec을 바꿔도 해결되지 않습니다. */
export class StructuredRenderError extends Error {
  constructor(
    readonly code: "RENDER_FAILED" | "PAGE_TOO_LARGE",
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "StructuredRenderError";
  }
}

/** Renderer 앞의 검사입니다. 계약·참조·순서와 수집 원본의 역할을 함께 확인합니다. */
export function validateRenderableSpec(
  spec: unknown,
  input: unknown,
): StructuredPortfolioSnapshot {
  const snapshot = validateStructuredPortfolio(spec, input);
  validateLibrarySelection(snapshot.spec);
  return snapshot;
}

/** Spec에 수집 원본이 하나라도 있으면 저장된 판입니다. 그 판은 원래 렌더러로 그려 모양을 보존합니다. */
function usesCollectedSources(spec: StructuredPortfolioSnapshot["spec"]): boolean {
  return Object.values(spec.elements).some(
    (node) => "sourceId" in node.props && node.props.sourceId,
  );
}

export type RenderStructuredOptions = {
  /** 키트 경로의 디자인 시스템 스펙입니다. 사용자 색 덮어쓰기는 호출하는 쪽이 이미 반영해 넘깁니다. */
  design?: DesignSystemSpecV2 | undefined;
  /** 수집 원본으로 그리는 저장된 판의 사용자 색입니다. 키트 경로에서는 쓰지 않습니다. */
  theme?: { background: string; text: string; accent: string } | undefined;
};

export function renderStructuredPortfolio(
  spec: unknown,
  input: unknown,
  options: RenderStructuredOptions = {},
): { html: string; css: string } {
  const snapshot = validateRenderableSpec(spec, input);
  const hasSources = usesCollectedSources(snapshot.spec);
  const design = hasSources ? undefined : options.design;
  const theme = options.theme;
  const state = {
    ...snapshot.content,
    sectionById: Object.fromEntries(
      snapshot.content.sections.map((section) => [section.id, section]),
    ),
  };
  const evidenceTitles = new Map(
    snapshot.content.evidence.map((item) => [item.id, item.title]),
  );
  let html: string;
  // 서버 렌더링에서는 json-render의 요소별 오류 경계가 동작하지 않아 컴포넌트 하나의 예외가 렌더링 전체를 멈춥니다.
  try {
    html = renderToStaticMarkup(
      <StateProvider initialState={state}>
        <VisibilityProvider>
          <ActionProvider handlers={{}}>
            {design ? (
              <KitContext.Provider value={{ content: snapshot.content, evidenceTitles, design }}>
                <Renderer spec={snapshot.spec} registry={kitRegistry} />
              </KitContext.Provider>
            ) : (
              <EvidenceTitles.Provider value={evidenceTitles}>
                <Renderer spec={snapshot.spec} registry={registry} />
              </EvidenceTitles.Provider>
            )}
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>,
    );
  } catch (error) {
    throw new StructuredRenderError(
      "RENDER_FAILED",
      `컴포넌트 렌더링 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  // 저장 계약을 넘는 지면은 판을 추가하기 전에 거부합니다.
  if (html.length > PAGE_MAX_BYTES)
    throw new StructuredRenderError(
      "PAGE_TOO_LARGE",
      "지면이 저장 크기 제한을 넘었습니다. 내용을 줄여 주세요.",
    );
  if (design) {
    const css = kitCss(design);
    if (css.length > PAGE_MAX_BYTES)
      throw new StructuredRenderError("PAGE_TOO_LARGE", "스타일이 저장 크기 제한을 넘었습니다.");
    return { html, css };
  }
  const colors = theme
    ? z
        .object({
          background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        })
        .parse(theme)
    : null;
  const overrides = colors
    ? `\n.sp-page[data-palette]{--sp-bg:${colors.background};--sp-ink:${colors.text};--sp-accent:${colors.accent};--sp-panel:color-mix(in srgb,${colors.background},${colors.text} 7%);--sp-muted:color-mix(in srgb,${colors.background},${colors.text} 70%);--sp-line:color-mix(in srgb,${colors.background},${colors.text} 25%)}`
    : "";
  const css =
    STRUCTURED_PORTFOLIO_CSS +
    (hasSources ? COLLECTED_PORTFOLIO_CSS : "") +
    overrides;
  if (css.length > PAGE_MAX_BYTES)
    throw new StructuredRenderError(
      "PAGE_TOO_LARGE",
      "스타일이 저장 크기 제한을 넘었습니다.",
    );
  return { html, css };
}
