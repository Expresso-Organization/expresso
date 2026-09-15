import { z } from "zod";

/**
 * 02 레시피의 어휘 — 섹션의 역할, 보여주는 형식, 문장의 종류.
 *
 * 형식 이름은 기획서 §7.9 의 목록 그대로다. id 는 그 줄을 영문 kebab-case 로
 * 옮긴 것이고 사람이 읽는 이름은 `PRESENTATION_LABEL` 에 있다. 새 이름을 짓지
 * 않는다 — 웹 · 플래너 · 03 이 같은 표를 본다.
 *
 * 2026-09-15 되돌림: 형식은 사용자가 02 에서 고른다. 어느 디자인을 골랐든 같은
 * 목록이고, 그 형식을 디자인 안에서 조판하는 일이 03 이다(§7.8 의 디자인별 제한은
 * 하지 않는다).
 */

export const RECIPE_SECTION_ROLES = ["hero", "profile", "research", "experience", "projects", "contact", "other"] as const;
export const RecipeV2SectionRoleSchema = z.enum(RECIPE_SECTION_ROLES);
export type RecipeV2SectionRole = z.infer<typeof RecipeV2SectionRoleSchema>;

export const SECTION_ROLE_LABEL: Record<RecipeV2SectionRole, string> = {
  hero: "히어로",
  profile: "프로필",
  research: "연구",
  experience: "경력",
  projects: "프로젝트",
  contact: "연락",
  other: "그 밖",
};

export const RECIPE_PRESENTATIONS = [
  // Hero
  "hero-big-statement", "hero-split", "hero-metric", "hero-image", "hero-profile-card",
  // 프로젝트
  "project-par", "project-case-study", "project-artifact", "project-metric", "project-process-timeline", "project-comparison",
  // 수치
  "metric-single", "metric-before-after", "metric-group", "metric-bars", "metric-gauge", "metric-annotated",
  // 경력
  "career-timeline", "career-by-org", "career-role", "career-outcome", "career-project-linked",
  // 기술
  "skill-tags", "skill-categories", "skill-evidence", "skill-project-linked", "skill-stack-table",
  // 기타
  "body", "image-gallery", "quote", "profile", "contact-action", "footer",
] as const;
export const RecipeV2PresentationSchema = z.enum(RECIPE_PRESENTATIONS);
export type RecipeV2Presentation = z.infer<typeof RecipeV2PresentationSchema>;

export const PRESENTATION_LABEL: Record<RecipeV2Presentation, string> = {
  "hero-big-statement": "큰 문장",
  "hero-split": "좌우 분할",
  "hero-metric": "대표 수치 중심",
  "hero-image": "이미지 중심",
  "hero-profile-card": "짧은 프로필 카드",
  "project-par": "문제-행동-결과",
  "project-case-study": "긴 사례 연구",
  "project-artifact": "아티팩트 중심",
  "project-metric": "수치 중심",
  "project-process-timeline": "과정 타임라인",
  "project-comparison": "여러 프로젝트 비교",
  "metric-single": "큰 숫자 하나",
  "metric-before-after": "전후 비교",
  "metric-group": "수치 묶음",
  "metric-bars": "막대 비교",
  "metric-gauge": "도넛 또는 게이지",
  "metric-annotated": "설명이 붙은 지표",
  "career-timeline": "세로 타임라인",
  "career-by-org": "조직별 묶음",
  "career-role": "역할 중심",
  "career-outcome": "성과 중심",
  "career-project-linked": "프로젝트 연결형",
  "skill-tags": "태그",
  "skill-categories": "카테고리 목록",
  "skill-evidence": "숙련 근거",
  "skill-project-linked": "프로젝트 연결",
  "skill-stack-table": "기술 스택 표",
  "body": "본문",
  "image-gallery": "이미지 갤러리",
  "quote": "인용",
  "profile": "프로필",
  "contact-action": "연락 행동",
  "footer": "푸터",
};

/** 역할마다 고를 수 있는 형식. 화면은 이 순서대로 보인다. */
export const PRESENTATIONS_BY_ROLE: Record<RecipeV2SectionRole, readonly RecipeV2Presentation[]> = {
  hero: ["hero-big-statement", "hero-split", "hero-metric", "hero-image", "hero-profile-card"],
  profile: ["profile", "hero-profile-card", "body", "quote", "skill-tags", "skill-categories"],
  research: ["project-case-study", "project-par", "metric-group", "metric-annotated", "metric-single", "body", "quote"],
  experience: ["career-timeline", "career-by-org", "career-role", "career-outcome", "career-project-linked"],
  projects: ["project-par", "project-case-study", "project-artifact", "project-metric", "project-process-timeline", "project-comparison", "image-gallery"],
  contact: ["contact-action", "footer", "profile"],
  other: [
    "body", "image-gallery", "quote",
    "metric-single", "metric-before-after", "metric-group", "metric-bars", "metric-gauge", "metric-annotated",
    "skill-tags", "skill-categories", "skill-evidence", "skill-project-linked", "skill-stack-table",
  ],
};

/** 플래너 v1 의 `contentPattern` 을 역할로 옮길 때 쓰는 표. */
export const ROLE_OF_CONTENT_PATTERN: Record<string, RecipeV2SectionRole> = {
  hero: "hero",
  about: "profile",
  contact: "contact",
  "case-study": "projects",
  timeline: "experience",
  metrics: "other",
  capabilities: "other",
};

export const RECIPE_ITEM_KINDS = ["point", "metric", "media", "link"] as const;
export const RecipeV2ItemKindSchema = z.enum(RECIPE_ITEM_KINDS);
export type RecipeV2ItemKind = z.infer<typeof RecipeV2ItemKindSchema>;

export const ITEM_KIND_LABEL: Record<RecipeV2ItemKind, string> = {
  point: "점",
  metric: "수치",
  media: "미디어",
  link: "링크",
};
