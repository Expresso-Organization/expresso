import { z } from "zod";

/**
 * 포트폴리오 유형(페이지 짜임새)입니다. 색 · 글꼴 · 간격은 디자인 시스템이, 섹션 순서와 쓸 수
 * 있는 컴포넌트는 유형이 정합니다. 근거: `docs/architecture/portfolio-archetype-research.md`.
 *
 * - `case-study`: 첫 화면 → 목차 → 사례 상세(문단 · 항목표) → 경력 → 근거 → 연락. 유형을 고르지 않았을 때의 값입니다.
 * - `poster`: 화면 폭에 가까운 이름 글자와 색면으로 시작하고, 큰 글자 목차와 사례가 이어집니다.
 * - `list`: 큰 소개 문장과 "기간 · 제목 · 요약" 목록으로 짭니다. 상세는 목록 행을 펼쳐 봅니다.
 */
export const PORTFOLIO_ARCHETYPES = ["case-study", "poster", "list"] as const;
export const PortfolioArchetypeSchema = z.enum(PORTFOLIO_ARCHETYPES);
export type PortfolioArchetype = z.infer<typeof PortfolioArchetypeSchema>;
export const DEFAULT_PORTFOLIO_ARCHETYPE: PortfolioArchetype = "case-study";
