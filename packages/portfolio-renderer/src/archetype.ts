import type { PortfolioArchetype } from "@expresso/contracts";

/**
 * 유형(페이지 짜임새)을 Spec 생성 모델이 읽을 문단으로 씁니다. 키트가 유형마다 그리는 방식과 같은 내용입니다.
 * 고를 수 있는 컴포넌트 자체는 출력 스키마가 정하고, 이 문단은 그 안에서 고르는 기준을 알립니다.
 */
export function describeArchetype(archetype: PortfolioArchetype): string {
  if (archetype === "poster")
    return [
      "사용자가 고른 유형은 포스터형입니다.",
      "첫 화면(NameIntro poster)은 행동색 면 위에 이름을 화면 폭에 가깝게 크게 쓰고 한 문장만 둡니다. 소개 문단은 그 아래 큰 글자 단락으로 실립니다.",
      "목차(ProjectIndex poster)는 번호와 큰 글자 제목 행입니다. 사례는 큰 번호와 큰 제목, 넓은 그림으로 이어집니다.",
      "이미지가 있는 사례는 그림이 크게 보이는 CaseGallery · CaseEssay가 어울리고, 설명 항목이 많은 사례는 CaseTechnical · CaseProcess를 씁니다. 컨테이너는 쓰지 않습니다. 마지막 연락은 행동색 면입니다.",
    ].join("\n");
  if (archetype === "list")
    return [
      "사용자가 고른 유형은 글 · 목록형입니다.",
      "첫 화면(NameIntro sentence)은 작은 이름과 직무 아래 소개를 큰 문장으로 둡니다. 태그와 버튼이 없습니다.",
      "모든 사례는 CaseRow 한 줄(기간 · 제목 · 요약)이고, 펼치면 본문 · 항목 · 이미지가 나옵니다. 목차와 컨테이너는 없습니다.",
      "사례 행은 기간이 있으면 최근 것부터 놓고, 경력 · 근거 · 연락은 그 뒤에 둡니다.",
    ].join("\n");
  return [
    "사용자가 고른 유형은 사례 상세형입니다.",
    "첫 화면 → 목차 → 사례 상세 → 경력 → 근거 → 연락 순서가 기본이고, 사례마다 자료에 맞는 사례 유형을 고릅니다.",
  ].join("\n");
}
