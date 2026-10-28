import type { Persona } from "./types.js";

/** 기록이 적은 사람. UI 디자이너로 5년 일한 뒤 프론트엔드 개발자로 옮긴 지 1년이 됐다. */
export const careerSwitch: Persona = {
  key: "dummy-career-switch",
  displayName: "오태민",
  headline: "UI 디자이너 5년 뒤 프론트엔드로 전직한 1년차",
  profile: { targetRoles: ["프론트엔드", "디자인"], experienceYears: 6, primaryGoal: "build" },
  records: [
    {
      ref: "exp-design",
      category: "experience",
      title: "누리여행 UI 디자이너",
      body: "2019.02 — 2024.03\n\n여행 예약 앱의 검색 · 결제 화면을 맡았다. 화면마다 따로 그리던 버튼과 입력 칸을 하나의 컴포넌트 목록으로 정리했고, 개발자와 같은 이름으로 부르도록 디자인 토큰 표를 만들었다.\n\n- 결제 단계 4개를 2개로 줄인 개편안 설계, 결제 완료율 61% → 68%\n- 디자인 컴포넌트 140개를 48개로 정리",
      props: { competencies: ["UI 디자인", "디자인 시스템", "사용성 테스트"], period: "2019-02/2024-03" },
    },
    {
      ref: "exp-frontend",
      category: "experience",
      title: "바름회계 프론트엔드 개발자",
      body: "2025.09 — 현재\n\n중소기업용 회계 웹 서비스의 프론트엔드를 맡고 있다. 디자이너 출신이라 디자인 시안을 컴포넌트로 옮기는 일과 화면 접근성 점검을 주로 한다.\n\n- 거래 내역 표를 가상 스크롤로 바꿔 5천 행 화면의 첫 표시 3.2초 → 0.9초\n- 키보드만으로 전표 입력이 끝나도록 포커스 순서 정리",
      props: { competencies: ["React", "TypeScript", "웹 접근성"], period: "2025-09/" },
    },
    {
      ref: "edu-bootcamp",
      category: "education_history",
      title: "온새미 코딩스쿨 프론트엔드 집중 과정",
      body: "2024.04 — 2024.10\n\n6개월 과정. JavaScript 기초부터 React, 테스트 작성까지 배웠고 팀 프로젝트 2개를 끝냈다.",
      props: { organization: "온새미 코딩스쿨", period: "2024-04/2024-10", projects: { refs: ["proj-bootcamp"] } },
    },
    {
      category: "education_history",
      title: "한결대학교 시각디자인학과",
      body: "2013.03 — 2019.02 졸업",
      props: { organization: "한결대학교", period: "2013-03/2019-02" },
    },
    {
      ref: "proj-bootcamp",
      category: "project",
      title: "동네 도서관 좌석 현황 웹앱",
      body: "2024.08 — 2024.10\n\n집중 과정의 최종 팀 프로젝트. 도서관 열람실 좌석이 몇 개 남았는지 지도에서 보여 주는 웹앱을 만들었다. 나는 화면 설계와 지도 컴포넌트를 맡았다.\n\n- 과정 내 발표 평가 1위",
      props: { role: "프론트엔드 · 화면 설계", technologies: ["React", "TypeScript", "Kakao Map API"], period: "2024-08/2024-10", outcome: "과정 내 발표 평가 1위" },
    },
    {
      ref: "proj-ledger-table",
      category: "project",
      title: "거래 내역 표 성능 개선",
      body: "2026.01 — 2026.03\n\n거래가 많은 고객사에서 거래 내역 화면이 멈춘다는 문의가 반복됐다. 표 전체를 한 번에 그리던 구조를 가상 스크롤로 바꾸고, 정렬은 서버에 맡겼다.\n\n- 5천 행 기준 첫 표시 3.2초 → 0.9초\n- 관련 고객 문의 월 12건 → 1건",
      props: { role: "프론트엔드 개발", technologies: ["React", "TanStack Table", "TypeScript"], period: "2026-01/2026-03", outcome: "5천 행 첫 표시 3.2초 → 0.9초", experiences: { refs: ["exp-frontend"] } },
    },
    {
      category: "project",
      title: "전표 입력 화면 접근성 개선",
      status: "draft",
      body: "스크린리더로 전표 입력이 끝까지 되도록 레이블과 포커스 순서를 고쳤다. 결과 정리 중.",
      props: { role: "프론트엔드 개발", technologies: ["React", "axe-core"], period: "2026-05/2026-07", experiences: { refs: ["exp-frontend"] } },
    },
    {
      category: "certification_award",
      title: "웹 접근성 실무 과정 수료",
      body: "바른웹 교육센터에서 40시간 과정을 수료했다.",
      props: { issuer: "바른웹 교육센터", issuedMonth: "2025-11" },
    },
    {
      category: "skill_tool",
      title: "React",
      body: "집중 과정부터 실무까지 2년째 쓰고 있다. 상태 관리는 TanStack Query와 Zustand를 쓴다.",
      props: { firstUsedMonth: "2024-05", lastUsedMonth: "2026-10", projects: { refs: ["proj-bootcamp", "proj-ledger-table"] }, experiences: { refs: ["exp-frontend"] } },
    },
    {
      category: "skill_tool",
      title: "Figma",
      body: "디자이너로 일할 때 5년 동안 주 도구로 썼다. 지금은 시안을 읽고 컴포넌트 속성을 맞출 때 쓴다.",
      props: { firstUsedMonth: "2019-03", lastUsedMonth: "2026-10", experiences: { refs: ["exp-design", "exp-frontend"] } },
    },
  ],
};
