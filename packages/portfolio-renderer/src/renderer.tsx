import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import {
  StateProvider,
  VisibilityProvider,
  ActionProvider,
  Renderer,
  defineRegistry,
} from "@json-render/react";
import { z } from "zod";
import {
  StructuredDesignSchema,
  StructuredPortfolioContentSchema as content,
  StructuredSectionSchema,
  validateStructuredPortfolio,
  type StructuredPortfolioContent,
  type StructuredSection,
} from "@expresso/contracts";
import { STRUCTURED_PORTFOLIO_CSS } from "./styles.js";

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
const projectProps = z.object({ section: StructuredSectionSchema });
export const structuredCatalog = defineCatalog(schema, {
  components: {
    PortfolioPage: {
      props: z.object({
        profile: content.shape.profile,
        design: StructuredDesignSchema,
        motion: z.enum(["none", "subtle", "showcase"]),
        rationale: z.string(),
      }),
      slots: ["default"],
      description:
        "전체 구도: editorial=고정 소개와 기사 두 열, gallery=전면 작품 전시, dossier=목차와 상세 두 열.",
    },
    NameIntro: {
      props: z.object({
        profile: content.shape.profile,
        sections: content.shape.sections.optional(),
      }),
      description:
        "이름을 가장 크게, 그 아래 짧은 자기 정의와 제공된 대표 작품을 표시합니다.",
    },
    ProjectIndex: {
      props: z.object({
        sections: content.shape.sections,
        variant: z.enum(["rows", "mosaic", "rail"]),
      }),
      description:
        "rows=짧은 목록, mosaic=이미지 중심 비대칭 타일, rail=측면 목차.",
    },
    CaseEssay: {
      props: projectProps,
      description: "문장과 판단을 읽는 기사형. 설명이 긴 자료에 적합합니다.",
    },
    CaseGallery: {
      props: projectProps,
      description:
        "제공 이미지를 크게 전시합니다. 이미지가 있는 작품에 사용합니다.",
    },
    CaseTechnical: {
      props: projectProps,
      description: "도면과 근거, 담당 작업, 결과의 항목표를 나누는 기술형.",
    },
    CaseProcess: {
      props: projectProps,
      description:
        "문제·작업·결과 등 두 개 이상의 설명을 단계별로 표시하는 과정형.",
    },
    ContentPanel: {
      props: projectProps,
      description: "자기소개·능력·추가 설명을 표시합니다.",
    },
    CareerTimeline: {
      props: z.object({ career: content.shape.career }),
      description: "제공된 경력을 시간순으로 표시합니다.",
    },
    EvidenceGrid: {
      props: z.object({ evidence: content.shape.evidence }),
      description: "표시용으로 선택한 근거 제목과 설명을 펼칩니다.",
    },
    Contact: {
      props: z.object({ contact: content.shape.contact }),
      description: "입력에 제공된 연락처를 표시합니다.",
    },
  },
  actions: {},
});

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
function Sources({ section }: { section: StructuredSection }) {
  return section.sourceIds.length ? (
    <nav className="sp-sources" aria-label={`${section.title} 관련 자료`}>
      {section.sourceIds.map((key, i) => (
        <a href={`#source-${key}`} key={key}>
          관련 자료 {i + 1} ↗
        </a>
      ))}
    </nav>
  ) : null;
}
function Case({
  section,
  kind,
}: {
  section: StructuredSection;
  kind: "essay" | "gallery" | "technical" | "process" | "panel";
}) {
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
      {kind === "technical" ? (
        <table className="sp-facts">
          <caption className="sp-sr">{section.title} 작업 설명</caption>
          <tbody>
            {section.details.map((item, i) => (
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
          {section.details.map((item, i) => (
            <li key={i}>
              <span className="sp-step-number">
                {String(i + 1).padStart(2, "0")}
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
          {section.details.map((item, i) => (
            <section key={i}>
              <h3>{item.label}</h3>
              <Body value={item.text} />
            </section>
          ))}
        </div>
      )}
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
    NameIntro: ({ props: { profile, sections } }) => (
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
    CaseEssay: ({ props }) => <Case section={props.section} kind="essay" />,
    CaseGallery: ({ props }) => <Case section={props.section} kind="gallery" />,
    CaseTechnical: ({ props }) => (
      <Case section={props.section} kind="technical" />
    ),
    CaseProcess: ({ props }) => <Case section={props.section} kind="process" />,
    ContentPanel: ({ props }) => <Case section={props.section} kind="panel" />,
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

export function renderStructuredPortfolio(
  spec: unknown,
  input: unknown,
  theme?: { background: string; text: string; accent: string },
): { html: string; css: string } {
  const snapshot = validateStructuredPortfolio(spec, input);
  const state = {
    ...snapshot.content,
    sectionById: Object.fromEntries(
      snapshot.content.sections.map((section) => [section.id, section]),
    ),
  };
  const html = renderToStaticMarkup(
    <StateProvider initialState={state}>
      <VisibilityProvider>
        <ActionProvider handlers={{}}>
          <Renderer spec={snapshot.spec} registry={registry} />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>,
  );
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
  return { html, css: STRUCTURED_PORTFOLIO_CSS + overrides };
}
