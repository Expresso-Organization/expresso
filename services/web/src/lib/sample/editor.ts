/**
 * 04 · 04b · 04c가 쓰는 예시 데이터. `GET /v1/portfolios/:id`가 생기면 교체한다.
 * 문자열은 화면 정의서의 확정 문구다.
 */

export const EDITOR_SECTIONS = [
  { id: "intro", title: "소개", meta: "이름 · 한 문장", hidden: false },
  { id: "competency", title: "핵심 역량", meta: "역량 5개 · 공고 기준", hidden: false },
  { id: "projects", title: "대표 프로젝트", meta: "3건 · 카드형", hidden: false },
  { id: "incident", title: "장애 대응 경험", meta: "대화에서 추가됨", hidden: false },
  { id: "stack", title: "기술 스택", meta: "4개 강조", hidden: false },
  { id: "contact", title: "연락처", meta: "이메일 · GitHub", hidden: false },
  { id: "awards", title: "수상 내역", meta: "숨김 · 공고와 무관", hidden: true },
] as const;

export const EDITOR_SUGGESTION = {
  text: '"장애 대응 경험"을 프로젝트보다 위로 올리면 공고 요구와 먼저 만납니다',
} as const;

/** 04 채팅 탭 — 마지막 왕복 하나. */
export const EDIT_EXCHANGE = {
  at: "오늘 14:21",
  target: "소개 · 성과 숫자 3개",
  request: "이 섹션 숫자를 더 크게 하고, 세 개 말고 두 개만 남겨줘",
  answer: "“3천만”과 “24분”만 남기고 글자를 키웠어요. “0건”은 아래 문장으로 옮겼습니다.",
  elapsed: "1.4s",
  patch: [
    { label: "숫자 개수", before: "3", after: "2" },
    { label: "숫자 크기", before: "28", after: "44px" },
  ],
} as const;

export const QUICK_COMMANDS = [
  "이 문장 더 짧게",
  "숫자 강조",
  "내 커리어에서 가져오기",
] as const;

/** 04c 이력 탭. */
export const REVISIONS = [
  { actor: "ai" as const, summary: "소개 문단을 공고 문장에 맞춰 다시 씀", at: "2분 전", current: true },
  { actor: "user" as const, summary: "제목 글자 크기 38 → 34px", at: "9분 전", current: false },
  { actor: "user" as const, summary: '"믿을 수 있게"에 형광 표시 추가', at: "11분 전", current: false },
  { actor: "ai" as const, summary: "지표를 3개에서 2개로 줄이고 숫자를 키움", at: "14분 전", current: false },
  { actor: "user" as const, summary: "자격 · 수상 섹션 숨김", at: "22분 전", current: false },
];

export const CHECKPOINTS = [
  { name: "AI 추출 직후", at: "오늘 오전 11:02 · 6개 섹션" },
  { name: "직접 편집 시작 전", at: "오늘 오후 1:44" },
] as const;
