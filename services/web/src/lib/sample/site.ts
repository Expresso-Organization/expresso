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

// ── 09 계정 · 요금제 ──────────────────────────────────────────────────

export const ACCOUNT = {
  tabs: ["프로필", "요금제 · 사용량", "결제", "알림", "데이터 관리"],
  intro:
    "한도에 닿기 전에 미리 알려드립니다. 플랜을 내리거나 해지해도 이미 만든 기록과 포트폴리오는 그대로 남습니다.",
  usage: [
    { label: "포트폴리오 생성", used: 2, limit: 3, resets: "3월 12일 초기화" },
    { label: "AI 인터뷰", used: 4, limit: 10, resets: "3월 12일 초기화" },
    { label: "배포 사이트", used: 3, limit: 5, resets: "3월 12일 초기화" },
  ],
  plans: [
    {
      name: "Espresso",
      price: "무료",
      features: ["포트폴리오 1개", "월 1회 생성", "기본 템플릿 3종"],
      cta: "이 플랜으로",
      current: false,
    },
    {
      name: "Double Shot",
      price: "₩12,900 / 월",
      features: ["포트폴리오 5개", "월 3회 생성", "전체 템플릿", "커스텀 도메인"],
      cta: "플랜 해지",
      current: true,
    },
    {
      name: "Barista",
      price: "₩29,000 / 월",
      features: ["무제한 생성", "방문 분석 전체", "팀 공유", "우선 지원"],
      cta: "이 플랜으로",
      current: false,
    },
  ],
  billing: [
    { date: "2026.07.12", item: "Double Shot 월 구독", amount: "₩12,900", state: "결제 완료" },
    { date: "2026.06.12", item: "Double Shot 월 구독", amount: "₩12,900", state: "결제 완료" },
  ],
  data: [
    { title: "내 데이터 내보내기", note: "기록 · 포트폴리오 전체를 JSON으로" },
    { title: "계정 삭제 요청", note: "30일 뒤 완전 삭제 · 그 전까지 취소 가능", danger: true },
  ],
  footNote:
    "이번 달 생성 1회가 남았습니다. 한도를 넘으면 생성 버튼 대신 남은 횟수와 다음 초기화 날짜를 보여줍니다.",
} as const;

// ── 00c 통합 검색 · 알림 ─────────────────────────────────────────────

export const PALETTE = {
  query: "정산",
  groups: [
    {
      label: "기록",
      count: 4,
      items: [
        { title: "정산 파이프라인 재설계", meta: "프로젝트 · 3일 전", kind: "RECORD" },
        { title: "정산 마감 자동화 회고", meta: "경험 · 2주 전", kind: "RECORD" },
      ],
    },
    {
      label: "공고",
      count: 2,
      items: [{ title: "토스 · 정산 플랫폼 백엔드", meta: "일치도 92", kind: "JOB" }],
    },
    {
      label: "포트폴리오",
      count: 1,
      items: [
        { title: "토스 지원용 · 정산 섹션", meta: "블록 3개에서 발견", kind: "BLOCK" },
      ],
    },
    {
      label: "동작",
      count: 1,
      items: [{ title: '"정산"으로 새 기록 만들기', meta: "", kind: "ACTION" }],
    },
  ],
  shortcuts: ["↑↓ 이동", "↵ 열기", "⌘↵ 새 탭", "⌘K 닫기"],
  recentCount: "최근 검색 3건",
} as const;

export const NOTIFICATIONS = {
  unread: 3,
  filters: ["전체", "마감", "생성", "방문"],
  items: [
    { title: "당근 · 서버 지원 마감 D-2", body: "레시피까지 끝냈습니다. 생성만 남았습니다", at: "10분 전", unread: true },
    { title: "토스 지원용 생성 완료", body: "6개 섹션 · 편집으로 이동하기", at: "2시간 전", unread: true },
    { title: "토스 도메인에서 방문 4건", body: "정산 섹션에서 평균 42초 머물렀습니다", at: "어제", unread: true },
    { title: "새 공고 7건이 조건과 맞습니다", body: '저장한 검색 "정산 · 백엔드"', at: "2일 전", unread: false },
    { title: "이번 달 생성 1회 남음", body: "3월 12일에 초기화됩니다", at: "3일 전", unread: false },
  ],
} as const;
