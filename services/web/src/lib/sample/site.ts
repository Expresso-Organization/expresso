/** 08 · 08b · 09 · 00c가 쓰는 예시 데이터. 문자열은 정의서의 확정 문구다. */

// ── 08 공개 사이트 ────────────────────────────────────────────────────

export const PUBLIC_SITE = {
  version: "v3 · 2일 전 배포 · jiwon.xpresso.me",
  name: "Jiwon Kim",
  nav: ["경험", "프로젝트", "스킬", "연락하기"],
  eyebrow: "BACKEND ENGINEER · SEOUL",
  headline: "결제 트래픽을 견디는 서버를 만듭니다",
  lede: "5년간 커머스와 핀테크에서 정산·결제 시스템을 맡았습니다. 초당 4천 건 트래픽에서 장애 없이 동작하는 구조를 설계하고, 팀의 배포 주기를 주 1회에서 하루 3회로 줄였습니다.",
  metrics: [
    { value: "4,200 TPS", label: "처리량" },
    { value: "0건 · 14개월", label: "장애" },
    { value: "3회 / 일", label: "배포" },
  ],
  works: [
    {
      title: "정산 파이프라인 재설계",
      year: "2024",
      body: "일 220만 건 정산을 배치에서 스트리밍으로 옮겨 마감 시간을 6시간에서 40분으로 줄였습니다.",
    },
    {
      title: "결제 이중화",
      year: "2023",
      body: "외부 PG 장애 시 30초 안에 우회하는 이중 경로를 구성했습니다.",
    },
  ],
  mobileNotes: [
    "한 컬럼으로 접힘",
    "지표 카드는 가로 스크롤",
    "연락 버튼 하단 고정",
  ],
  share: {
    title: "Jiwon Kim · Backend",
    headline: "결제 트래픽을 견디는 서버를 만듭니다",
    domain: "jiwon.xpresso.me",
    ogTitle: "김지원 — 백엔드 엔지니어",
    ogDescription: "정산·결제 시스템 5년. 초당 4천 건 트래픽 처리.",
    note: "og:image는 첫 배포 시 자동 생성됩니다",
  },
} as const;

// ── 08b 배포 · 버전 ───────────────────────────────────────────────────

export const DEPLOY = {
  intro:
    "주소를 발급하고 버전 단위로 공개합니다. 배포하면 이전 버전은 남고, 언제든 되돌릴 수 있습니다.",
  slug: "jiwon",
  domain: ".xpresso.me",
  slugState: "사용 가능",
  customDomain: { host: "jiwon.dev", state: "DNS 확인 중" },
  /** 배포 전 확인 3항목. 하나라도 실패하면 고치기 링크가 붙는다. */
  preflight: [
    { state: "pass" as const, title: "모든 섹션에 내용이 있습니다", note: "6개 섹션 · 빈 블록 없음" },
    {
      state: "fail" as const,
      title: "연락처가 비어 있습니다",
      note: "공개 사이트에서 연락 버튼이 동작하지 않습니다",
      action: "고치기",
    },
    { state: "pass" as const, title: "모바일에서 깨지는 블록 없음", note: "390px 기준 검사 통과" },
  ],
  versions: [
    { name: "v3", summary: "정산 프로젝트 성과 수치 보강", at: "2일 전 · 김지원", current: true },
    { name: "v2", summary: "요약 문단 톤 조정", at: "9일 전 · AI 편집", current: false },
    { name: "v1", summary: "최초 배포", at: "3주 전 · 김지원", current: false },
  ],
  exports: [
    { icon: "file-pdf", title: "PDF로 내보내기", note: "A4 · 6쪽 · 인쇄 여백 적용" },
    { icon: "file-doc", title: "Word 문서", note: "편집 가능한 .docx" },
    { icon: "paperclip", title: "이력서 파일 첨부", note: "resume_2026.pdf · 240KB" },
  ],
  footNote:
    "공개를 중단해도 문서와 기록은 지워지지 않습니다. 주소만 접근할 수 없게 됩니다.",
} as const;
