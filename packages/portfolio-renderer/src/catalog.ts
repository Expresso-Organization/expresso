import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import {
  STRUCTURED_GROUP_VARIANTS,
  STRUCTURED_INTRO_VARIANTS,
  StructuredDesignSchema,
  StructuredPortfolioContentSchema as content,
  StructuredSectionSchema,
} from "@expresso/contracts";

/**
 * 구조화 지면의 json-render 카탈로그입니다(계약). 수집 원본 렌더러와 토큰 키트가 같은
 * 카탈로그에 각자의 레지스트리(구현)를 붙입니다.
 */
const projectProps = z.object({
  section: StructuredSectionSchema,
  sourceId: z.string().optional(),
});
export const structuredCatalog = defineCatalog(schema, {
  components: {
    PortfolioPage: {
      props: z.object({
        profile: content.shape.profile,
        design: StructuredDesignSchema,
        motion: z.enum(["none", "subtle", "showcase"]),
        rationale: z.string(),
        referenceIds: z.array(z.string()).optional(),
      }),
      slots: ["default"],
      description:
        "페이지 루트. 배치·색·서체는 사용자가 고른 디자인 시스템이 정합니다. 자식 순서가 읽는 순서입니다.",
    },
    NameIntro: {
      props: z.object({
        profile: content.shape.profile,
        sections: content.shape.sections.optional(),
        sourceId: z.string().optional(),
        variant: z.enum(STRUCTURED_INTRO_VARIANTS).optional(),
      }),
      description:
        "이름을 가장 크게, 그 아래 짧은 자기 정의를 표시합니다. statement=큰 이름과 한 문장, split=이름과 소개를 좌우로 나눔, media=제공된 대표 이미지와 함께.",
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
    Columns: {
      props: z.object({ variant: z.enum(STRUCTURED_GROUP_VARIANTS.Columns) }),
      slots: ["default"],
      description:
        "두 요소를 나란히 놓는 두 열. even=같은 폭, wide-start=왼쪽이 넓음, wide-end=오른쪽이 넓음. 사례와 근거·경력·목차를 나란히 둘 때 사용합니다.",
    },
    Grid: {
      props: z.object({ variant: z.enum(STRUCTURED_GROUP_VARIANTS.Grid) }),
      slots: ["default"],
      description:
        "2–3개 요소를 같은 폭의 열로 나열합니다. 비슷한 비중의 짧은 사례를 비교해 보여 줄 때 사용합니다.",
    },
    Band: {
      props: z.object({ variant: z.enum(STRUCTURED_GROUP_VARIANTS.Band) }),
      slots: ["default"],
      description:
        "1–3개 요소를 한 묶음으로 구분합니다. panel=면 배경, accent=강조색 상단 선. 지면의 흐름을 나눌 때 사용합니다.",
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

