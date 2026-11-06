import type { Persona, PersonaRecord } from "./types.js";

// 기록이 아주 많은 사람. 15년 동안 회사 다섯 곳을 거치며 쌓은 기록을 꾸준히 정리해 온 경우를 흉내 낸다.
// 오래된 기록은 짧고, 최근 기록은 자세하다. 사람 · 회사 · 학교 · 행사 이름은 모두 지어낸 것이다.

const experiences: readonly PersonaRecord[] = [
  {
    ref: "exp-si-backend",
    category: "experience",
    title: "대양정보시스템 공공사업팀 백엔드 개발자",
    body: `**2011.01 – 2012.06 · 대양정보시스템 공공사업팀**

졸업하고 들어간 첫 회사. 지자체 민원 시스템 구축 사업에 투입되어 민원 접수 · 조회 API와 Oracle 프로시저를 맡았다.

- 민원 조회 응답 시간 4.2초 → 1.1초 (인덱스 재설계)
- 납품 후 하자 보수 기간에 결함 37건 처리`,
    props: { competencies: ["Java 백엔드", "DB 설계"], period: "2011-01/2012-06" },
  },
  {
    ref: "exp-si-batch",
    category: "experience",
    title: "대양정보시스템 운영지원팀 배치 · 운영 자동화",
    body: `**2012.07 – 2013.12 · 대양정보시스템 운영지원팀**

납품한 시스템 세 곳의 야간 배치와 운영을 맡았다. 수작업 점검을 스크립트로 바꾸는 일을 주로 했다.

- 야간 배치 실패 알림을 문자로 받도록 바꿔 다음 날 아침 발견 → 10분 안 발견
- 월말 정산 배치 수행 시간 6시간 → 2시간`,
    props: { competencies: ["배치 처리", "운영 자동화", "Shell 스크립트"], period: "2012-07/2013-12" },
  },
  {
    ref: "exp-portal-search",
    category: "experience",
    title: "누리포털 검색개발팀 백엔드 엔지니어",
    body: `**2014.01 – 2015.06 · 누리포털 검색개발팀**

일 방문자 800만 명 규모 포털의 검색 API를 맡았다. 트래픽이 큰 서비스는 처음이라 캐시와 타임아웃 설정을 여기서 제대로 배웠다.

- 자동완성 API p99 120ms → 35ms
- 검색 결과 캐시 적중률 41% → 78%`,
    props: { competencies: ["대용량 트래픽", "캐시 설계", "Java 백엔드"], period: "2014-01/2015-06" },
  },
  {
    ref: "exp-portal-infra",
    category: "experience",
    title: "누리포털 인프라개발팀 배포 · 모니터링 담당",
    body: `**2015.07 – 2017.06 · 누리포털 인프라개발팀**

검색팀에서 배포 스크립트를 고치다가 인프라개발팀으로 옮겼다. 서비스 40여 개의 배포 파이프라인과 모니터링을 맡았다. 이때 Go를 처음 업무에 썼다.

- 배포 횟수 주 2회 → 하루 평균 5회
- 배포 한 번에 드는 시간 40분 → 8분
- 모니터링을 Graphite에서 Prometheus로 전환, 대시보드 120개 이관`,
    props: { competencies: ["배포 자동화", "모니터링", "Go"], period: "2015-07/2017-06" },
  },
  {
    ref: "exp-fintech-sre",
    category: "experience",
    title: "셈들페이 SRE팀 시니어 엔지니어",
    body: `**2017.07 – 2018.12 · 셈들페이 SRE팀**

간편결제 서비스의 SRE팀 세 번째 멤버로 합류했다. 당시에는 장애가 나면 고객 문의로 먼저 알게 되는 경우가 많았다. 결제 API부터 SLO를 정하고, 알림을 SLO 기준으로 다시 짰다.

결제 DB는 PostgreSQL 단일 주 서버 구조였다. 장애 조치를 사람이 하고 있어서 자동화를 우선순위로 올렸다.

- 결제 API 가용성 99.5% → 99.95%
- 장애 인지 시간 중앙값 14분 → 2분
- DB 장애 조치 시간 25분 → 30초 이내
- 분기 장애 건수 11건 → 4건`,
    props: { competencies: ["SRE", "SLO 설계", "장애 대응", "PostgreSQL 운영"], period: "2017-07/2018-12" },
  },
  {
    ref: "exp-fintech-k8s",
    category: "experience",
    title: "셈들페이 컨테이너 플랫폼 전환 리드",
    status: "verified",
    body: `**2019.01 – 2020.03 · 셈들페이 SRE팀 → 플랫폼파트**

VM 위에서 돌던 결제 서비스 32개를 Kubernetes로 옮기는 일을 맡았다. 엔지니어 4명으로 파트를 꾸려 1년 동안 진행했다. 결제 서비스라서 무중단 이전이 조건이었다. 서비스마다 트래픽을 1% → 10% → 50% → 100%로 옮기는 절차를 만들었다.

인프라는 Terraform으로 코드화했고, 시크릿은 Vault로 모았다.

- 서비스 32개 이전 완료, 이전 중 결제 장애 0건
- 인프라 비용 월 1억 2천만 원 → 8천만 원 (33% 절감)
- 신규 서비스 환경 준비 2주 → 1일
- 감사 대응용 접근 기록을 Vault 감사 로그로 일원화`,
    props: { competencies: ["Kubernetes", "마이그레이션 리드", "인프라 코드화"], period: "2019-01/2020-03" },
  },
  {
    ref: "exp-mobility-platform",
    category: "experience",
    title: "타고모빌리티 플랫폼팀 엔지니어",
    body: `**2020.04 – 2021.06 · 타고모빌리티 플랫폼팀**

차량 호출 서비스의 플랫폼팀에 합류했다. 차량 위치 데이터가 초당 8만 건씩 들어오는데, 기존 수집 서버가 피크 시간마다 밀렸다. Kafka 기반 파이프라인으로 다시 만들었다.

서비스 간 호출이 늘면서 재시도 폭주로 장애가 번지는 일이 잦았다. Envoy 사이드카로 타임아웃 · 재시도 · 서킷 브레이커를 공통으로 걸었다.

- 위치 수집 지연 p99 2.3초 → 180ms
- 연쇄 장애 분기 3건 → 0건
- 플랫폼팀 온보딩 문서 30쪽 작성`,
    props: { competencies: ["스트리밍 처리", "서비스 메시", "Kubernetes"], period: "2020-04/2021-06" },
  },
  {
    ref: "exp-mobility-lead",
    category: "experience",
    title: "타고모빌리티 플랫폼팀 리드",
    body: `**2021.07 – 2023.02 · 타고모빌리티 플랫폼팀 (팀원 7명)**

팀장이 이직하면서 플랫폼팀 리드를 맡았다. 처음 맡은 리드 역할이었다. 기술 과제와 팀 운영을 같이 챙겨야 했다.

배포는 팀마다 방식이 달라서 Jenkins 잡이 400개가 넘었다. ArgoCD 기반 GitOps로 통일했다. 온콜은 2명이 돌아가며 맡고 있어서 소진이 심했다. 서비스팀이 자기 서비스를 직접 받는 구조로 바꿨다. 단일 가용 영역에 몰려 있던 핵심 서비스는 멀티 존으로 옮겼다.

- 배포 방식 통일: Jenkins 잡 412개 → ArgoCD 애플리케이션 300개
- 배포 실패율 7.8% → 1.2%
- 플랫폼팀 야간 호출 월 45건 → 9건
- 가용 영역 장애 모의 훈련에서 호출 성공률 99.9% 유지
- 팀원 2명 시니어로 승진`,
    props: { competencies: ["팀 리딩", "GitOps", "온콜 운영", "가용성 설계"], period: "2021-07/2023-02" },
  },
  {
    ref: "exp-commerce-idp",
    category: "experience",
    title: "바로마켓 개발자 플랫폼팀 시니어 엔지니어",
    body: `**2023.03 – 2024.06 · 바로마켓 개발자 플랫폼팀**

이커머스 회사의 개발자 플랫폼팀으로 옮겼다. 개발 조직이 2년 사이 120명에서 350명으로 늘면서, 새 서비스 하나를 띄우는 데 티켓이 평균 9장 필요했다. 누가 어떤 서비스를 가지고 있는지도 정리되어 있지 않았다.

첫 6개월은 서비스 카탈로그와 개발자 포털을 만들었다. 이후 Go 서비스 템플릿과 CI 빌드 시간 단축을 맡았다.

- 서비스 카탈로그 등록 서비스 0 → 410개 (전체의 96%)
- 신규 서비스 준비 시간 평균 3주 → 2일
- CI 빌드 시간 중앙값 18분 → 6분
- 개발자 만족도 설문 플랫폼 항목 2.9 → 4.1 (5점 척도)`,
    props: { competencies: ["내부 개발자 플랫폼", "CI/CD", "Go"], period: "2023-03/2024-06" },
  },
  {
    ref: "exp-commerce-staff",
    category: "experience",
    title: "바로마켓 스태프 엔지니어 · 플랫폼 기술 리드",
    status: "verified",
    body: `**2024.07 – 현재 · 바로마켓 플랫폼 본부**

스태프 엔지니어로 승격했다. 개발자 플랫폼 · SRE · 데이터 인프라 세 팀(28명)의 기술 방향을 정하고, 팀 사이에 걸친 과제를 직접 리드한다. 분기마다 플랫폼 로드맵을 쓰고 본부장과 우선순위를 맞춘다.

맡은 과제는 세 가지다. Kubernetes 클러스터 업그레이드 자동화, 카나리 기반 점진 배포, PR마다 띄우는 임시 환경. 설계 리뷰 위원회를 만들어 큰 변경은 문서로 리뷰하게 했다.

- 클러스터 업그레이드 주기 연 1회 → 분기 1회, 업그레이드 중 장애 0건
- 배포로 인한 장애 분기 9건 → 2건
- 하루 배포 횟수 평균 140회 → 310회
- 설계 리뷰 문서 2년 동안 64건 리뷰
- 스태프 · 시니어 승격 후보 4명 멘토링, 3명 승격`,
    props: { competencies: ["기술 리더십", "아키텍처 의사결정", "플랫폼 엔지니어링"], period: "2024-07/" },
  },
  {
    ref: "exp-commerce-incident",
    category: "experience",
    title: "바로마켓 인시던트 커맨더 · 장애 대응 체계 담당",
    body: `**2023.09 – 현재**

플랫폼팀 업무와 별도로 인시던트 커맨더 로테이션을 맡고 있다. 처음 합류했을 때는 장애 등급 기준이 없어서 매번 누가 지휘할지부터 정했다. 등급 기준과 커맨더 로테이션, 포스트모템 양식을 만들었다.

- 장애 등급 4단계 기준 수립, 커맨더 12명 양성
- 1등급 장애 복구 시간 중앙값 52분 → 19분
- 포스트모템 작성률 40% → 100%, 후속 조치 이행률 85%`,
    props: { competencies: ["장애 대응", "포스트모템", "SRE"], period: "2023-09/" },
  },
  {
    ref: "exp-commerce-cost",
    category: "experience",
    title: "바로마켓 클라우드 비용 절감 TF",
    body: `**2025.01 – 2025.12**

클라우드 비용이 전년 대비 38% 늘어 비용 절감 TF가 꾸려졌다. 플랫폼 쪽 대표로 들어가 비용을 팀별로 나눠 보이게 하는 일을 맡았다.

- 팀별 비용 대시보드 공개, 비용 태그 적용률 55% → 98%
- 연간 클라우드 비용 약 21% 절감 (요청 리소스 조정 · 스팟 노드 확대)`,
    props: { competencies: ["FinOps", "비용 분석"], period: "2025-01/2025-12" },
  },
];

const projects: readonly PersonaRecord[] = [
  {
    ref: "prj-si-civil",
    category: "project",
    title: "지자체 민원 접수 시스템 구축",
    body: `**2011.03 – 2012.02**

민원 접수 · 조회 API와 Oracle 프로시저 개발. 화면은 협력사가 맡았다.

- 민원 조회 응답 4.2초 → 1.1초`,
    props: {
      role: "백엔드 개발 (5명 중 1명)",
      technologies: ["Java", "Spring", "Oracle"],
      period: "2011-03/2012-02",
      outcome: "기한 내 납품, 조회 응답 4.2초 → 1.1초",
      experiences: { refs: ["exp-si-backend"] },
    },
  },
  {
    ref: "prj-si-batch",
    category: "project",
    title: "월말 정산 배치 재작성",
    status: "draft",
    body: "정산 배치를 단계별로 나눠 다시 짬. 6시간 → 2시간.",
    props: {
      role: "단독 개발",
      technologies: ["Java", "Shell", "Oracle"],
      period: "2012-08/2013-06",
      experiences: { refs: ["exp-si-batch"] },
    },
  },
  {
    ref: "prj-portal-autocomplete",
    category: "project",
    title: "검색어 자동완성 API 개편",
    body: `**2014.03 – 2014.12**

자동완성 API가 피크 시간에 p99 120ms를 넘었다. 접두어 사전을 Redis에 올리고 조회 경로를 단순하게 바꿨다.

- p99 120ms → 35ms
- 자동완성 서버 12대 → 6대`,
    props: {
      role: "백엔드 개발",
      technologies: ["Java", "Redis"],
      period: "2014-03/2014-12",
      outcome: "p99 120ms → 35ms, 서버 절반으로 축소",
      experiences: { refs: ["exp-portal-search"] },
    },
  },
  {
    ref: "prj-portal-cache",
    category: "project",
    title: "검색 결과 캐시 계층 도입",
    body: `**2015.01 – 2015.06**

검색 엔진 앞에 결과 캐시를 두고, 인기 검색어는 미리 채워 두도록 했다.

- 캐시 적중률 41% → 78%
- 검색 엔진 클러스터 부하 45% 감소`,
    props: {
      role: "설계 · 개발",
      technologies: ["Java", "Redis", "Elasticsearch"],
      period: "2015-01/2015-06",
      outcome: "캐시 적중률 41% → 78%",
      experiences: { refs: ["exp-portal-search"] },
    },
  },
  {
    ref: "prj-portal-deploy",
    category: "project",
    title: "사내 배포 파이프라인 표준화",
    body: `**2015.08 – 2016.04**

서비스마다 배포 스크립트가 달라서 배포 날을 주 2회로 묶어 두고 있었다. Jenkins 파이프라인 템플릿을 만들고 서비스 40여 개를 옮겼다. 롤백 버튼을 파이프라인에 넣었다.

- 배포 횟수 주 2회 → 하루 평균 5회
- 배포 소요 시간 40분 → 8분
- 롤백 시간 30분 → 3분`,
    props: {
      role: "파이프라인 설계 · 이관 리드",
      technologies: ["Jenkins", "Groovy", "Shell", "Ansible"],
      period: "2015-08/2016-04",
      outcome: "배포 주 2회 → 하루 5회",
      experiences: { refs: ["exp-portal-infra"] },
    },
  },
  {
    ref: "prj-portal-monitoring",
    category: "project",
    title: "Graphite에서 Prometheus로 모니터링 전환",
    body: `**2016.05 – 2017.03**

Graphite 서버 디스크가 석 달마다 찼고, 지표 이름 규칙이 없어 대시보드를 찾기 어려웠다. Prometheus로 옮기면서 지표 이름 규칙과 공통 익스포터를 만들었다. 익스포터 일부는 Go로 새로 썼다.

- 대시보드 120개 이관, 지표 이름 규칙 문서화
- 알림 규칙 340개 → 95개로 정리
- 모니터링 서버 디스크 장애 연 4회 → 0회`,
    props: {
      role: "전환 담당",
      technologies: ["Prometheus", "Grafana", "Go"],
      period: "2016-05/2017-03",
      outcome: "대시보드 120개 이관, 알림 규칙 72% 정리",
      experiences: { refs: ["exp-portal-infra"] },
    },
  },
  {
    ref: "prj-fin-slo",
    category: "project",
    title: "결제 API SLO 도입과 알림 재설계",
    body: `**2017.09 – 2018.04**

결제 API 장애를 고객 문의로 먼저 아는 경우가 많았다. 결제 승인 · 취소 · 조회 API의 SLO를 정하고, 알림을 에러 버짓 소진 속도 기준으로 다시 만들었다. 제품팀과 매달 SLO 리뷰를 열었다.

- 장애 인지 시간 중앙값 14분 → 2분
- 야간 알림 월 60건 → 12건 (오탐 대부분 제거)
- 결제 API 가용성 99.5% → 99.95%`,
    props: {
      role: "SLO 설계 · 도입 리드",
      technologies: ["Prometheus", "Grafana", "PagerDuty"],
      period: "2017-09/2018-04",
      outcome: "장애 인지 14분 → 2분, 가용성 99.95%",
      experiences: { refs: ["exp-fintech-sre"] },
    },
  },
  {
    ref: "prj-fin-db-failover",
    category: "project",
    title: "결제 DB PostgreSQL 장애 조치 자동화",
    body: `**2018.03 – 2018.11**

결제 DB 주 서버가 죽으면 당직자가 수동으로 복제 서버를 승격시켰다. 평균 25분이 걸렸고, 그 동안 결제가 멈췄다. Patroni로 자동 장애 조치를 구성하고 연결 풀을 앞에 뒀다. 분기마다 실제 장애 조치 훈련을 했다.

- 장애 조치 시간 25분 → 30초 이내
- 장애 조치 훈련 6회, 데이터 유실 0건
- 읽기 쿼리 40%를 복제 서버로 분산`,
    props: {
      role: "설계 · 구축",
      technologies: ["PostgreSQL", "Patroni", "PgBouncer", "etcd"],
      period: "2018-03/2018-11",
      outcome: "장애 조치 25분 → 30초",
      experiences: { refs: ["exp-fintech-sre"] },
    },
  },
  {
    ref: "prj-fin-terraform",
    category: "project",
    title: "결제 인프라 Terraform 코드화",
    body: `**2018.10 – 2019.06**

콘솔에서 손으로 만든 리소스가 1,800개였다. 누가 언제 바꿨는지 알 수 없었다. Terraform으로 가져오고, 변경은 PR 리뷰를 거쳐서만 적용하도록 바꿨다.

- 리소스 1,800개 중 1,720개 코드화
- 설정 변경 사고 분기 5건 → 0건
- 감사 대응 자료 준비 2주 → 2일`,
    props: {
      role: "코드화 리드",
      technologies: ["Terraform", "AWS", "Atlantis"],
      period: "2018-10/2019-06",
      outcome: "리소스 96% 코드화, 설정 변경 사고 0건",
      experiences: { refs: ["exp-fintech-sre", "exp-fintech-k8s"] },
    },
  },
  {
    ref: "prj-fin-k8s",
    category: "project",
    title: "결제 서비스 Kubernetes 무중단 이전",
    status: "verified",
    body: `**2019.01 – 2019.12**

VM 위의 결제 서비스 32개를 Kubernetes로 옮겼다. 결제 서비스라 무중단이 조건이었다. 서비스마다 VM과 클러스터를 동시에 띄우고 로드밸런서 가중치로 트래픽을 1% → 10% → 50% → 100% 옮겼다. 각 단계에서 에러율과 지연을 비교해 기준을 넘으면 되돌렸다.

이전 순서는 의존성이 적은 조회 서비스부터 정했다. 승인 서비스는 마지막에 옮겼다.

- 서비스 32개 이전, 이전 중 결제 장애 0건
- 되돌림 7회, 모두 5분 안에 완료
- 인프라 비용 33% 절감
- 배포 소요 25분 → 6분`,
    props: {
      role: "이전 리드 (엔지니어 4명)",
      technologies: ["Kubernetes", "Helm", "Terraform", "Prometheus"],
      period: "2019-01/2019-12",
      outcome: "서비스 32개 무중단 이전, 비용 33% 절감",
      experiences: { refs: ["exp-fintech-k8s"] },
    },
  },
  {
    ref: "prj-fin-vault",
    category: "project",
    title: "Vault 기반 시크릿 관리 통합",
    body: `**2019.07 – 2020.02**

DB 비밀번호와 API 키가 설정 파일과 CI 변수에 흩어져 있었다. Vault로 모으고 DB 계정은 동적 발급으로 바꿨다.

- 하드코딩된 시크릿 214건 제거
- DB 계정 수명 무기한 → 24시간
- 시크릿 접근 기록을 감사 로그 한 곳으로 모음`,
    props: {
      role: "설계 · 도입",
      technologies: ["Vault", "Kubernetes", "PostgreSQL"],
      period: "2019-07/2020-02",
      outcome: "하드코딩 시크릿 214건 제거",
      experiences: { refs: ["exp-fintech-k8s"] },
    },
  },
  {
    ref: "prj-mob-kafka",
    category: "project",
    title: "차량 위치 수집 파이프라인 Kafka 전환",
    body: `**2020.05 – 2021.02**

차량 위치가 초당 8만 건씩 들어오는데, 기존 HTTP 수집 서버가 출퇴근 시간마다 밀렸다. 수집 서버는 받기만 하고 Kafka에 넣도록 바꿨다. 배차 · 요금 계산은 각자 컨슈머로 읽게 했다.

파티션 키는 차량 ID로 정해 차량별 순서를 보장했다. 컨슈머 지연을 지표로 보고 오토스케일링 기준으로 썼다.

- 수집 지연 p99 2.3초 → 180ms
- 피크 처리량 초당 8만 → 22만 건까지 부하 시험 통과
- 수집 서버 48대 → 16대`,
    props: {
      role: "설계 · 구현 리드",
      technologies: ["Kafka", "Go", "Kubernetes", "Prometheus"],
      period: "2020-05/2021-02",
      outcome: "수집 지연 p99 2.3초 → 180ms",
      experiences: { refs: ["exp-mobility-platform"] },
    },
  },
  {
    ref: "prj-mob-mesh",
    category: "project",
    title: "Envoy 서비스 메시 도입",
    status: "verified",
    body: `**2020.09 – 2021.08**

서비스 간 호출에서 재시도가 몰려 장애가 다른 서비스로 번지는 일이 분기 3건 정도 있었다. 서비스마다 HTTP 클라이언트 설정이 달라서 한 곳에서 고치기 어려웠다.

Envoy 사이드카를 붙이고 타임아웃 · 재시도 예산 · 서킷 브레이커를 공통 설정으로 내렸다. 서비스 90개에 단계적으로 적용했다. 사이드카 때문에 늘어나는 지연을 먼저 재고 팀들과 기준을 합의했다.

- 연쇄 장애 분기 3건 → 0건 (적용 후 4개 분기)
- 사이드카 추가 지연 p99 1.8ms
- 서비스 간 호출 지표가 전 서비스에 같은 이름으로 수집됨`,
    props: {
      role: "도입 리드",
      technologies: ["Envoy", "Kubernetes", "Go", "Prometheus"],
      period: "2020-09/2021-08",
      outcome: "연쇄 장애 분기 3건 → 0건",
      experiences: { refs: ["exp-mobility-platform", "exp-mobility-lead"] },
    },
  },
  {
    ref: "prj-mob-gitops",
    category: "project",
    title: "ArgoCD 기반 GitOps 배포 통일",
    body: `**2021.03 – 2021.12**

배포 방식이 팀마다 달라서 Jenkins 잡이 412개였다. 클러스터에 무엇이 배포되어 있는지 확인하려면 각 잡의 기록을 뒤져야 했다. 배포 상태를 Git 저장소 하나로 모으고 ArgoCD가 클러스터에 맞추게 했다.

- Jenkins 잡 412개 → ArgoCD 애플리케이션 300개
- 배포 실패율 7.8% → 1.2%
- 롤백은 Git revert 한 번으로 통일, 평균 2분`,
    props: {
      role: "설계 · 이관 리드",
      technologies: ["ArgoCD", "Kubernetes", "Helm", "Kustomize"],
      period: "2021-03/2021-12",
      outcome: "배포 실패율 7.8% → 1.2%",
      experiences: { refs: ["exp-mobility-lead"] },
    },
  },
  {
    ref: "prj-mob-oncall",
    category: "project",
    title: "온콜 체계를 서비스팀 소유로 개편",
    body: `**2021.09 – 2022.03**

플랫폼팀 2명이 전사 알림을 다 받고 있었다. 알림마다 소유 팀을 붙이고 서비스팀이 자기 서비스 알림을 직접 받도록 바꿨다. 플랫폼팀은 인프라 알림만 받는다.

- 플랫폼팀 야간 호출 월 45건 → 9건
- 알림 규칙 780개 → 260개
- 서비스팀 온콜 런북 52개 작성 지원`,
    props: {
      role: "기획 · 운영",
      technologies: ["Prometheus", "Alertmanager", "PagerDuty"],
      period: "2021-09/2022-03",
      outcome: "야간 호출 80% 감소",
      experiences: { refs: ["exp-mobility-lead"] },
    },
  },
  {
    ref: "prj-mob-multizone",
    category: "project",
    title: "핵심 서비스 멀티 존 이중화",
    body: `**2022.01 – 2022.09**

배차 · 결제 · 위치 수집이 한 가용 영역에 몰려 있었다. 2021년 말 그 영역의 네트워크 장애로 40분간 호출이 멈췄다. 세 서비스와 의존하는 DB · Kafka를 세 영역에 나눠 배치했다.

- 가용 영역 하나를 끄는 훈련에서 호출 성공률 99.9% 유지
- 영역 간 트래픽 비용 월 900만 원 증가, 경영진 승인 후 진행`,
    props: {
      role: "설계 리드",
      technologies: ["Kubernetes", "Kafka", "PostgreSQL", "Terraform"],
      period: "2022-01/2022-09",
      outcome: "가용 영역 장애 훈련에서 성공률 99.9%",
      experiences: { refs: ["exp-mobility-lead"] },
    },
  },
  {
    ref: "prj-com-portal",
    category: "project",
    title: "사내 개발자 포털 · 서비스 카탈로그",
    body: `**2023.04 – 2024.03**

개발자가 350명으로 늘면서 어떤 서비스를 누가 가지고 있는지 아무도 정확히 몰랐다. 장애가 나면 담당자를 찾는 데만 10분 넘게 걸렸다.

서비스마다 저장소에 소유 팀 · 의존 서비스 · 런북 위치를 적는 파일을 두게 하고, 포털이 이를 읽어 카탈로그를 만든다. 배포 기록 · 알림 · 비용을 같은 화면에 붙였다. 등록을 강제하지 않고, 등록한 서비스만 템플릿과 배포 기능을 쓰게 해서 자연스럽게 늘렸다.

- 등록 서비스 0 → 410개 (전체의 96%)
- 장애 중 담당자 찾는 시간 10분 이상 → 1분 이내
- 포털 주간 활성 사용자 280명`,
    props: {
      role: "기술 리드 (엔지니어 3명)",
      technologies: ["Go", "TypeScript", "PostgreSQL", "Kubernetes"],
      period: "2023-04/2024-03",
      outcome: "서비스 410개 등록, 담당자 찾기 1분 이내",
      experiences: { refs: ["exp-commerce-idp"] },
    },
  },
  {
    ref: "prj-com-template",
    category: "project",
    title: "Go 서비스 템플릿과 신규 서비스 자동 준비",
    body: `**2023.07 – 2024.02**

새 서비스 하나를 띄우려면 저장소 · CI · 네임스페이스 · DB · 알림을 각각 다른 팀에 티켓으로 요청했다. 평균 9장, 3주가 걸렸다.

Go 서비스 템플릿을 만들고, 포털에서 템플릿을 고르면 저장소부터 배포 파이프라인, 기본 대시보드까지 한 번에 만들어지게 했다. 로그 형식 · 지표 이름 · 헬스 체크가 템플릿에 들어 있어서 운영 규칙을 따로 안내할 필요가 줄었다.

- 신규 서비스 준비 3주 → 2일
- 1년 동안 템플릿으로 만든 서비스 87개
- 신규 서비스의 첫 달 장애 건수 평균 2.1건 → 0.4건`,
    props: {
      role: "설계 · 구현",
      technologies: ["Go", "Terraform", "ArgoCD", "GitHub Actions"],
      period: "2023-07/2024-02",
      outcome: "신규 서비스 준비 3주 → 2일",
      experiences: { refs: ["exp-commerce-idp"] },
    },
  },
  {
    ref: "prj-com-ci",
    category: "project",
    title: "CI 빌드 시간 단축 (원격 캐시 · 러너 자동 확장)",
    status: "verified",
    body: `**2023.10 – 2024.05**

CI 빌드 중앙값이 18분이었고, 오전 10시 전후에는 대기만 15분이었다. 빌드 원격 캐시를 붙이고, 러너를 Kubernetes 위에서 대기열 길이에 맞춰 늘리게 했다. 테스트는 변경된 모듈만 돌리도록 바꿨다.

- 빌드 시간 중앙값 18분 → 6분
- 오전 피크 대기 시간 15분 → 1분 이내
- CI 비용 월 2,400만 원 → 1,500만 원`,
    props: {
      role: "기술 리드",
      technologies: ["GitHub Actions", "Kubernetes", "Bazel", "Go"],
      period: "2023-10/2024-05",
      outcome: "빌드 18분 → 6분, CI 비용 37% 절감",
      experiences: { refs: ["exp-commerce-idp"] },
    },
  },
  {
    ref: "prj-com-incident-bot",
    category: "project",
    title: "장애 대응 채팅 봇",
    body: `**2023.11 – 2024.06**

장애를 선언하면 채널 생성, 커맨더 호출, 타임라인 기록, 상태 페이지 갱신을 봇이 처리한다. 장애가 끝나면 타임라인으로 포스트모템 초안을 만든다.

- 장애 선언부터 지휘 체계 구성까지 8분 → 1분
- 포스트모템 작성률 40% → 100%
- 1년 동안 장애 132건에 사용`,
    props: {
      role: "단독 개발",
      technologies: ["Go", "PostgreSQL", "Kubernetes"],
      period: "2023-11/2024-06",
      outcome: "지휘 체계 구성 8분 → 1분",
      experiences: { refs: ["exp-commerce-incident"] },
    },
  },
  {
    ref: "prj-com-cluster-upgrade",
    category: "project",
    title: "Kubernetes 클러스터 업그레이드 자동화",
    body: `**2024.03 – 2024.10**

클러스터 14개를 해마다 한 번 몰아서 업그레이드했다. 매번 2주 동안 엔지니어 3명이 붙었고, 지원이 끝난 버전을 쓰는 기간이 생겼다.

새 노드 그룹을 띄우고 워크로드를 옮긴 뒤 이전 노드를 내리는 방식으로 바꿨다. 폐기 예정 API를 쓰는 매니페스트는 CI에서 미리 막는다. 업그레이드 전 개발 클러스터에서 서비스별 스모크 테스트를 자동으로 돌린다.

- 업그레이드 주기 연 1회 → 분기 1회
- 클러스터 하나당 업그레이드 작업 3일 → 4시간
- 업그레이드 중 장애 0건 (6회 연속)
- 지원 종료 버전 사용 기간 0일`,
    props: {
      role: "설계 리드",
      technologies: ["Kubernetes", "Terraform", "Go", "ArgoCD"],
      period: "2024-03/2024-10",
      outcome: "업그레이드 연 1회 → 분기 1회, 장애 0건",
      experiences: { refs: ["exp-commerce-staff"] },
    },
  },
  {
    ref: "prj-com-canary",
    category: "project",
    title: "카나리 기반 점진 배포 도입",
    body: `**2024.06 – 2025.03**

배포로 인한 장애가 분기 9건이었다. 대부분 배포 직후 에러율이 올라가는데 사람이 알아채는 데 10분 이상 걸린 경우였다.

배포를 카나리로 바꾸고, 트래픽을 5% → 25% → 100%로 옮기면서 에러율 · 지연을 이전 버전과 자동으로 비교한다. 기준을 넘으면 자동으로 되돌린다. 비교 기준은 서비스 카탈로그의 SLO 값을 그대로 쓴다. 직접 만든 오픈소스 rollkeeper를 사내 요구에 맞게 확장해서 썼다.

- 배포로 인한 장애 분기 9건 → 2건
- 자동 되돌림 1년 동안 214회, 평균 3분 안에 완료
- 하루 배포 횟수 140회 → 310회
- 적용 서비스 380개 (전체의 89%)`,
    props: {
      role: "기술 리드 (엔지니어 5명)",
      technologies: ["Argo Rollouts", "Envoy", "Prometheus", "Go"],
      period: "2024-06/2025-03",
      outcome: "배포 장애 분기 9건 → 2건",
      experiences: { refs: ["exp-commerce-staff"] },
    },
  },
  {
    ref: "prj-com-cost",
    category: "project",
    title: "팀별 클라우드 비용 가시화",
    body: `**2025.01 – 2025.09**

비용 청구서는 계정 단위였고 팀별로 나눌 방법이 없었다. 리소스 태그 규칙을 정하고 CI에서 태그 없는 리소스를 막았다. Kubernetes 워크로드는 요청 리소스 기준으로 비용을 나눴다. 팀별 비용과 사용률을 개발자 포털에 붙였다.

- 비용 태그 적용률 55% → 98%
- 요청 대비 실제 사용률 평균 23% → 51%
- 연간 클라우드 비용 약 21% 절감`,
    props: {
      role: "설계 · 구현",
      technologies: ["Kubernetes", "Terraform", "PostgreSQL", "Grafana"],
      period: "2025-01/2025-09",
      outcome: "태그 적용률 98%, 연간 비용 21% 절감",
      experiences: { refs: ["exp-commerce-cost"] },
    },
  },
  {
    ref: "prj-com-preview-env",
    category: "project",
    title: "PR별 임시 환경",
    body: `**2025.06 – 진행 중**

QA 환경 3개를 40개 팀이 나눠 쓰느라 예약 대기가 평균 2일이었다. PR을 열면 그 서비스와 직접 의존하는 서비스만 네임스페이스에 띄우고, 나머지는 공용 스테이징으로 보낸다. PR이 닫히면 지운다.

비용이 걱정이라 처음 3개월은 12개 팀으로 시작했다. 2026년 상반기에 전사로 넓혔다.

- QA 환경 대기 2일 → 평균 7분
- 임시 환경 하루 평균 160개, 환경당 비용 시간당 약 300원
- QA 환경 3개 중 2개 폐기, 월 1,100만 원 절감
- 남은 과제: DB 데이터 준비 시간이 평균 4분으로 가장 김`,
    props: {
      role: "기술 리드",
      technologies: ["Kubernetes", "ArgoCD", "Envoy", "Go", "PostgreSQL"],
      period: "2025-06/",
      outcome: "QA 대기 2일 → 7분",
      experiences: { refs: ["exp-commerce-staff"] },
    },
  },
  {
    ref: "prj-com-otel",
    category: "project",
    title: "OpenTelemetry 기반 관측 전환",
    status: "draft",
    body: `**2025.10 – 진행 중**

트레이싱 도구가 두 가지로 나뉘어 있어서 서비스 경계를 넘는 추적이 끊긴다. OpenTelemetry 수집기로 통일하는 중.

- 현재 서비스 120개 적용
- (성과 수치 정리 필요)`,
    props: {
      role: "기술 리드",
      technologies: ["OpenTelemetry", "Go", "Kubernetes"],
      period: "2025-10/",
      experiences: { refs: ["exp-commerce-staff"] },
    },
  },
];

const history: readonly PersonaRecord[] = [
  {
    category: "education_history",
    title: "한빛공과대학교 컴퓨터공학과 학사",
    body: `**2007.03 – 2011.02**

학점 3.6 / 4.5. 4학년 때 운영체제 수업 조교. 졸업 프로젝트로 리눅스 서버 로그 분석 도구를 만들었다.`,
    props: { period: "2007-03/2011-02", organization: "한빛공과대학교" },
  },
  {
    category: "education_history",
    title: "대양정보시스템",
    body: `**2011.01 – 2013.12 · 공공사업팀 → 운영지원팀**

공공 SI 사업의 백엔드 개발과 납품 후 운영을 맡았다.`,
    props: {
      employmentType: "정규직",
      period: "2011-01/2013-12",
      organization: "대양정보시스템",
      projects: { refs: ["prj-si-civil", "prj-si-batch"] },
      experiences: { refs: ["exp-si-backend", "exp-si-batch"] },
    },
  },
  {
    category: "education_history",
    title: "누리포털",
    body: `**2014.01 – 2017.06 · 검색개발팀 → 인프라개발팀**

검색 API 백엔드로 들어가서 배포 · 모니터링을 맡는 인프라개발팀으로 옮겼다.`,
    props: {
      employmentType: "정규직",
      period: "2014-01/2017-06",
      organization: "누리포털",
      projects: { refs: ["prj-portal-autocomplete", "prj-portal-cache", "prj-portal-deploy", "prj-portal-monitoring"] },
      experiences: { refs: ["exp-portal-search", "exp-portal-infra"] },
    },
  },
  {
    category: "education_history",
    title: "셈들페이",
    body: `**2017.07 – 2020.03 · SRE팀 → 플랫폼파트**

간편결제 서비스의 SRE. 마지막 1년은 컨테이너 플랫폼 전환을 리드했다.`,
    props: {
      employmentType: "정규직",
      period: "2017-07/2020-03",
      organization: "셈들페이",
      projects: { refs: ["prj-fin-slo", "prj-fin-db-failover", "prj-fin-terraform", "prj-fin-k8s", "prj-fin-vault"] },
      experiences: { refs: ["exp-fintech-sre", "exp-fintech-k8s"] },
    },
  },
  {
    category: "education_history",
    title: "타고모빌리티",
    body: `**2020.04 – 2023.02 · 플랫폼팀**

차량 호출 서비스의 플랫폼팀. 2021년 7월부터 팀 리드(팀원 7명).`,
    props: {
      employmentType: "정규직",
      period: "2020-04/2023-02",
      organization: "타고모빌리티",
      projects: { refs: ["prj-mob-kafka", "prj-mob-mesh", "prj-mob-gitops", "prj-mob-oncall", "prj-mob-multizone"] },
      experiences: { refs: ["exp-mobility-platform", "exp-mobility-lead"] },
    },
  },
  {
    category: "education_history",
    title: "바로마켓",
    body: `**2023.03 – 현재 · 개발자 플랫폼팀 → 플랫폼 본부 스태프 엔지니어**

개발자 350명 규모 이커머스 회사의 내부 개발자 플랫폼을 맡고 있다. 2024년 7월 스태프 엔지니어로 승격했다.`,
    props: {
      employmentType: "정규직",
      period: "2023-03/",
      organization: "바로마켓",
      projects: {
        refs: [
          "prj-com-portal", "prj-com-template", "prj-com-ci", "prj-com-incident-bot", "prj-com-cluster-upgrade",
          "prj-com-canary", "prj-com-cost", "prj-com-preview-env", "prj-com-otel",
        ],
      },
      experiences: { refs: ["exp-commerce-idp", "exp-commerce-staff", "exp-commerce-incident", "exp-commerce-cost"] },
    },
  },
];

const certifications: readonly PersonaRecord[] = [
  {
    category: "certification_award",
    title: "소프트웨어 개발 기사",
    body: "졸업 전 취득.",
    props: { issuer: "정보운영자격평가원", issuedMonth: "2010-11" },
  },
  {
    category: "certification_award",
    title: "리눅스 시스템 관리사 1급",
    body: "인프라 쪽 일을 더 해 보려고 준비했다.",
    props: { issuer: "오픈시스템실무협회", issuedMonth: "2014-06" },
  },
  {
    category: "certification_award",
    title: "누리포털 사내 해커톤 대상",
    status: "draft",
    body: "배포 대기열 시각화 도구. 팀원 3명.",
    props: { issuer: "누리포털", issuedMonth: "2015-11" },
  },
  {
    category: "certification_award",
    title: "셈들페이 올해의 엔지니어상",
    body: "결제 API SLO 도입과 DB 장애 조치 자동화로 수상. 전사 엔지니어 140명 중 2명 선정.",
    props: { issuer: "셈들페이", issuedMonth: "2018-12" },
  },
  {
    category: "certification_award",
    title: "쿠버네티스 운영 전문가",
    body: "실기 시험. 결제 서비스 이전을 시작하면서 준비했다.",
    props: { issuer: "클라우드네이티브기술협회", issuedMonth: "2019-04" },
  },
  {
    category: "certification_award",
    title: "쿠버네티스 보안 전문가",
    body: "실기 시험. 서비스 메시 도입 중 네트워크 정책과 인증서 관리를 정리하면서 취득.",
    props: { issuer: "클라우드네이티브기술협회", issuedMonth: "2021-05" },
  },
  {
    category: "certification_award",
    title: "타고모빌리티 장애 대응 공로상",
    body: "가용 영역 장애 대응과 멀티 존 이중화로 수상.",
    props: { issuer: "타고모빌리티", issuedMonth: "2022-08" },
  },
  {
    category: "certification_award",
    title: "바로마켓 기술 리더십상",
    body: "점진 배포 도입과 클러스터 업그레이드 자동화로 수상. 연 1회, 본부별 1명.",
    props: { issuer: "바로마켓", issuedMonth: "2025-12" },
  },
];

const writings: readonly PersonaRecord[] = [
  {
    category: "academic_writing",
    title: "검색어 자동완성 응답 시간을 3분의 1로 줄인 방법",
    body: "자동완성 API를 Redis 접두어 사전으로 바꾼 과정. p99 120ms → 35ms.",
    props: { kind: "기술 글", publication: "누리포털 기술 블로그", publishedMonth: "2015-02", url: "https://example.com/nuri-tech/autocomplete-latency" },
  },
  {
    category: "academic_writing",
    title: "배포를 주 2회에서 하루 5회로",
    body: "Jenkins 파이프라인 템플릿과 롤백 버튼을 만든 과정. 사내 블로그 조회수 1위(2016년).",
    props: { kind: "기술 글", publication: "누리포털 기술 블로그", publishedMonth: "2016-06", url: "https://example.com/nuri-tech/deploy-five-times-a-day" },
  },
  {
    category: "academic_writing",
    title: "Graphite에서 Prometheus로 옮기며 정한 지표 이름 규칙",
    body: `첫 외부 발표. 30분 세션, 청중 약 150명.

- 지표 이름 규칙과 알림 규칙 정리 방법
- 이관하면서 버린 대시보드를 고르는 기준`,
    props: { kind: "발표", publication: "인프라 엔지니어링 데이 2017", publishedMonth: "2017-05", url: "https://example.com/infra-day/2017/prometheus-migration" },
  },
  {
    category: "academic_writing",
    title: "결제 API에 SLO를 처음 붙였을 때",
    body: "SLO를 정한 순서, 제품팀과 에러 버짓을 합의한 방법, 알림을 소진 속도 기준으로 바꾼 뒤 야간 알림이 줄어든 결과.",
    props: { kind: "기술 글", publication: "셈들페이 엔지니어링 블로그", publishedMonth: "2018-06", url: "https://example.com/payon-eng/first-slo" },
  },
  {
    category: "academic_writing",
    title: "PostgreSQL 장애 조치를 30초 안에",
    body: `Patroni 기반 자동 장애 조치 구성과 분기별 훈련 결과. 40분 세션.

- 장애 조치 25분 → 30초
- 훈련 6회에서 확인한 실패 사례 3가지`,
    props: { kind: "발표", publication: "운영기술 컨퍼런스 2018", publishedMonth: "2018-11", url: "https://example.com/opscon/2018/postgres-failover" },
  },
  {
    category: "academic_writing",
    title: "컨테이너 오케스트레이션 환경에서 결제 서비스 가용성 분석",
    body: "공저(제2저자). 결제 서비스 이전 전후 12개월의 장애 기록으로 가용성과 복구 시간을 비교했다. 모교 연구실과 함께 쓴 산학 공동 논문.",
    props: { kind: "논문", publication: "한국정보운영학회 논문지 제14권 3호", publishedMonth: "2019-08", url: "https://example.com/kios-journal/14-3/payment-availability" },
  },
  {
    category: "academic_writing",
    title: "결제 서비스 32개를 쿠버네티스로 옮긴 12개월",
    body: `무중단 이전 절차(1% → 10% → 50% → 100%)와 되돌림 기준. 45분 세션, 청중 약 400명.

- 이전 순서를 정한 기준
- 되돌림 7회의 원인`,
    props: { kind: "발표", publication: "플랫폼엔지니어링 서울 2019", publishedMonth: "2019-10", url: "https://example.com/pe-seoul/2019/payment-k8s-migration" },
  },
  {
    category: "academic_writing",
    title: "초당 8만 건 차량 위치를 Kafka로 받기",
    body: "수집 서버를 받기 전용으로 바꾸고 파티션 키를 차량 ID로 정한 이유. 컨슈머 지연을 오토스케일링 기준으로 쓴 방법.",
    props: { kind: "기술 글", publication: "타고 테크 블로그", publishedMonth: "2020-12", url: "https://example.com/tago-tech/vehicle-location-kafka" },
  },
  {
    category: "academic_writing",
    title: "Envoy 서비스 메시 도입 후 1년",
    body: `서비스 90개에 사이드카를 붙인 순서와 재시도 예산 설정. 40분 세션.

- 연쇄 장애 분기 3건 → 0건
- 사이드카 추가 지연을 잰 방법`,
    props: { kind: "발표", publication: "플랫폼엔지니어링 서울 2021", publishedMonth: "2021-06", url: "https://example.com/pe-seoul/2021/envoy-one-year" },
  },
  {
    category: "academic_writing",
    title: "온콜 알림을 70% 줄인 과정",
    body: "알림마다 소유 팀을 붙이고 서비스팀이 직접 받도록 바꾼 과정. 알림 규칙 780개를 260개로 정리한 기준.",
    props: { kind: "기술 글", publication: "타고 테크 블로그", publishedMonth: "2022-04", url: "https://example.com/tago-tech/oncall-alert-reduction" },
  },
  {
    category: "academic_writing",
    title: "ArgoCD로 서비스 300개 배포하기",
    body: `Jenkins 잡 412개를 ArgoCD 애플리케이션으로 옮긴 과정. 저장소 구조와 권한 설계. 40분 세션.`,
    props: { kind: "발표", publication: "운영기술 컨퍼런스 2022", publishedMonth: "2022-10", url: "https://example.com/opscon/2022/argocd-300-services" },
  },
  {
    category: "academic_writing",
    title: "개발자 포털을 만들며 정한 원칙",
    body: "등록을 강제하지 않고 등록한 서비스에만 기능을 열어 준 이유. 서비스 410개가 등록되기까지의 순서.",
    props: { kind: "기술 글", publication: "바로마켓 기술 블로그", publishedMonth: "2023-12", url: "https://example.com/baro-tech/developer-portal-principles" },
  },
  {
    category: "academic_writing",
    title: "골든 패스는 강제하지 않는다",
    status: "verified",
    body: `키노트 발표. 50분, 청중 약 900명.

- 서비스 템플릿과 개발자 포털을 강제 없이 확산한 방법
- 템플릿 사용률 0 → 87%까지의 데이터
- 템플릿을 쓰지 않는 팀을 위해 남겨 둔 선택지`,
    props: { kind: "발표", publication: "플랫폼엔지니어링 서울 2024", publishedMonth: "2024-09", url: "https://example.com/pe-seoul/2024/keynote-golden-path" },
  },
  {
    category: "academic_writing",
    title: "클라우드 비용을 팀별로 나누는 방법",
    body: "태그 규칙, Kubernetes 워크로드 비용을 요청 리소스 기준으로 나눈 방법, 공용 비용 배분 기준.",
    props: { kind: "기술 글", publication: "우진의 운영 노트", publishedMonth: "2025-05", url: "https://example.com/woojin-ops/cost-allocation" },
  },
  {
    category: "academic_writing",
    title: "PR마다 임시 환경을 띄우는 비용과 효과",
    status: "draft",
    body: "발표 확정. 슬라이드 작성 중. QA 대기 2일 → 7분, 환경당 시간당 비용 정리 필요.",
    props: { kind: "발표", publication: "이음 개발자 서밋 2026", publishedMonth: "2026-11", url: "https://example.com/devon-summit/2026/preview-environments" },
  },
];

const activities: readonly PersonaRecord[] = [
  {
    category: "activity_leadership",
    title: "오픈소스 동아리 회장",
    status: "draft",
    body: "2009 – 2010. 회원 20명. 리눅스 설치 스터디 운영.",
    props: { role: "회장", organization: "한빛공과대학교 오픈소스 동아리" },
  },
  {
    category: "activity_leadership",
    title: "사내 Go 스터디 운영",
    body: "2016.03 – 2016.12. 격주 모임, 참여 12명. 스터디에서 만든 익스포터 2개를 모니터링 전환에 실제로 썼다.",
    props: { role: "운영자", outcome: "참여 12명, 사내 도구 2개 실사용", organization: "누리포털" },
  },
  {
    category: "activity_leadership",
    title: "포스트모템 리뷰 진행자",
    body: `**2018.01 – 2020.03**

장애 회고를 책임 추궁 없이 원인과 후속 조치 중심으로 진행하는 규칙을 만들고, 매주 리뷰를 진행했다.

- 2년 동안 포스트모템 리뷰 74건 진행
- 후속 조치 이행률 30% → 82%`,
    props: { role: "진행자", outcome: "리뷰 74건, 후속 조치 이행률 82%", organization: "셈들페이" },
  },
  {
    category: "activity_leadership",
    title: "rollkeeper 창시자 · 메인테이너",
    body: `**2020.02 – 현재**

Kubernetes에서 지표 기반으로 점진 배포를 판단하는 컨트롤러. 셈들페이에서 이전 단계를 판단하던 스크립트를 일반화해 공개했다. 메인테이너 4명 중 리드.

- GitHub 스타 4,100개, 기여자 130명
- 릴리스 1.0(2021.11) ~ 3.2(2026.07)
- 공개적으로 사용을 밝힌 회사 30곳 이상
- 바로마켓 점진 배포에 사내 확장으로 사용`,
    props: { role: "창시자 · 리드 메인테이너", outcome: "스타 4,100개, 기여자 130명", organization: "rollkeeper 오픈소스 프로젝트" },
  },
  {
    category: "activity_leadership",
    title: "tfdrift 기여자",
    body: "Terraform 상태와 실제 리소스 차이를 찾는 도구. 2019 – 2022. PR 23건 병합, 병렬 조회 기능으로 대규모 계정 스캔 시간 40분 → 6분.",
    props: { role: "기여자", outcome: "PR 23건 병합", organization: "tfdrift 오픈소스 프로젝트" },
  },
  {
    category: "activity_leadership",
    title: "주니어 인프라 엔지니어 멘토링",
    body: `**2019 – 2021 · 3기**

협회가 주관하는 6개월 멘토링 프로그램 멘토. 기수마다 멘티 4명.

- 멘티 12명 중 10명 인프라 · SRE 직군 취업 또는 전환`,
    props: { role: "멘토", outcome: "멘티 12명 중 10명 직군 전환", organization: "클라우드엔지니어 실무모임" },
  },
  {
    category: "activity_leadership",
    title: "SRE 길드 리드",
    body: `**2021.07 – 2023.02**

서비스팀 SRE 담당자들이 모이는 격주 길드. SLO 템플릿, 런북 양식, 온콜 인수인계 양식을 길드에서 만들었다.

- 참여 서비스팀 6개 → 18개
- 서비스 SLO 정의율 15% → 70%`,
    props: { role: "리드", outcome: "SLO 정의율 15% → 70%", organization: "타고모빌리티" },
  },
  {
    category: "activity_leadership",
    title: "플랫폼엔지니어링 서울 프로그램 위원",
    body: "2022 – 2024. 3년 동안 발표 제안 약 600건 심사. 인프라 · 운영 트랙 담당.",
    props: { role: "프로그램 위원", outcome: "발표 제안 약 600건 심사", organization: "플랫폼엔지니어링 서울" },
  },
  {
    category: "activity_leadership",
    title: "운영기술 컨퍼런스 2025 프로그램 위원장",
    body: `프로그램 위원 9명과 발표 제안 340건 중 32건 선정.

- 처음 발표하는 사람을 위한 발표 리허설 프로그램 신설, 신규 발표자 비율 25% → 44%
- 참가자 만족도 4.3 / 5`,
    props: { role: "프로그램 위원장", outcome: "신규 발표자 비율 25% → 44%", organization: "운영기술 컨퍼런스" },
  },
  {
    category: "activity_leadership",
    title: "플랫폼 길드 운영",
    body: `**2023.06 – 현재**

플랫폼을 쓰는 서비스팀 대표들과 월 1회 모여 요청과 불편을 받는다. 길드에서 나온 요청을 분기 로드맵에 반영한다.

- 참여 팀 35개
- 길드 요청 142건 중 98건 반영`,
    props: { role: "운영자", outcome: "요청 142건 중 98건 반영", organization: "바로마켓" },
  },
  {
    category: "activity_leadership",
    title: "신규 입사자 온보딩 멘토",
    body: "2023 – 현재. 플랫폼 본부 신규 입사자 첫 3개월 멘토. 지금까지 14명.",
    props: { role: "멘토", outcome: "신규 입사자 14명", organization: "바로마켓" },
  },
  {
    category: "activity_leadership",
    title: "기술 면접관 · 채용 위원",
    body: "2023.09 – 현재. 시니어 이상 인프라 · 플랫폼 직군 면접 약 120회. 시스템 설계 면접 문항과 평가 기준을 새로 썼다.",
    props: { role: "면접관 · 채용 위원", outcome: "면접 약 120회, 설계 면접 평가 기준 작성", organization: "바로마켓" },
  },
];

const skill = (
  title: string,
  group: string,
  firstUsedMonth: string,
  lastUsedMonth: string,
  body: string,
  links: { projects?: string[]; experiences?: string[] },
  status?: PersonaRecord["status"],
): PersonaRecord => ({
  category: "skill_tool",
  title,
  ...(status ? { status } : {}),
  body,
  props: {
    group,
    firstUsedMonth,
    lastUsedMonth,
    ...(links.projects ? { projects: { refs: links.projects } } : {}),
    ...(links.experiences ? { experiences: { refs: links.experiences } } : {}),
  },
});

const LANG = "언어 · 쿼리";
const DATA = "데이터 · 파이프라인";
const INFRA = "인프라 · 운영";

const skills: readonly PersonaRecord[] = [
  skill("Java", LANG, "2011-01", "2019-06", "첫 6년 동안 주력 언어. Spring 기반 API와 배치를 썼다. 2019년 이후로는 코드 리뷰 정도만 한다.", {
    projects: ["prj-si-civil", "prj-si-batch", "prj-portal-autocomplete", "prj-portal-cache"],
    experiences: ["exp-si-backend", "exp-portal-search"],
  }),
  skill("Go", LANG, "2016-03", "2026-10", "2016년부터 주력. 익스포터, 수집 서버, 개발자 포털 백엔드, 배포 컨트롤러를 Go로 썼다. 사내 Go 서비스 템플릿 관리자. rollkeeper도 Go.", {
    projects: ["prj-portal-monitoring", "prj-mob-kafka", "prj-com-portal", "prj-com-template", "prj-com-canary", "prj-com-incident-bot"],
    experiences: ["exp-portal-infra", "exp-commerce-idp", "exp-commerce-staff"],
  }),
  skill("Python", LANG, "2013-02", "2026-08", "운영 스크립트, 비용 분석, 데이터 정리용.", {
    experiences: ["exp-si-batch", "exp-fintech-sre", "exp-commerce-cost"],
  }),
  skill("Bash", LANG, "2011-03", "2026-10", "배치 · 배포 스크립트. 지금도 매일 쓴다.", {
    projects: ["prj-si-batch", "prj-portal-deploy"],
  }),
  skill("SQL", LANG, "2011-01", "2026-09", "Oracle 프로시저부터 시작. 지금은 비용 · 장애 데이터 분석에 PostgreSQL로 쓴다.", {
    projects: ["prj-si-civil", "prj-si-batch", "prj-com-cost"],
  }),
  skill("PromQL", LANG, "2016-05", "2026-10", "SLO 알림 규칙, 카나리 비교 쿼리 작성.", {
    projects: ["prj-portal-monitoring", "prj-fin-slo", "prj-mob-oncall", "prj-com-canary"],
  }),
  skill("Kubernetes", INFRA, "2018-09", "2026-10", `2018년부터 운영. 클러스터 14개(노드 약 2,300대) 운영 책임.

- 결제 서비스 32개 무중단 이전
- 클러스터 업그레이드 자동화(분기 1회)
- 컨트롤러 · 오퍼레이터 개발`, {
    projects: ["prj-fin-k8s", "prj-mob-mesh", "prj-com-cluster-upgrade", "prj-com-preview-env"],
    experiences: ["exp-fintech-k8s", "exp-mobility-platform", "exp-commerce-staff"],
  }),
  skill("Terraform", INFRA, "2018-10", "2026-10", "결제 인프라 리소스 1,800개 코드화부터 시작. 지금은 사내 Terraform 모듈 40여 개 관리.", {
    projects: ["prj-fin-terraform", "prj-mob-multizone", "prj-com-cluster-upgrade", "prj-com-cost"],
  }),
  skill("ArgoCD", INFRA, "2021-02", "2026-10", "GitOps 배포 표준. 타고에서 300개, 바로마켓에서 420개 애플리케이션 운영.", {
    projects: ["prj-mob-gitops", "prj-com-template", "prj-com-preview-env"],
  }),
  skill("Envoy", INFRA, "2020-08", "2026-09", "서비스 메시 사이드카, 카나리 트래픽 분할.", {
    projects: ["prj-mob-mesh", "prj-com-canary", "prj-com-preview-env"],
  }),
  skill("Prometheus", INFRA, "2016-05", "2026-10", "Graphite에서 옮긴 이후 계속 사용. SLO 알림과 카나리 판단의 기준 지표.", {
    projects: ["prj-portal-monitoring", "prj-fin-slo", "prj-mob-kafka", "prj-com-canary"],
  }),
  skill("Grafana", INFRA, "2016-05", "2026-10", "대시보드. 팀별 비용 대시보드도 Grafana로 만들었다.", {
    projects: ["prj-portal-monitoring", "prj-com-cost"],
  }),
  skill("Vault", INFRA, "2019-07", "2023-02", "시크릿 관리, DB 계정 동적 발급.", {
    projects: ["prj-fin-vault"],
  }),
  skill("Jenkins", INFRA, "2015-08", "2021-12", "파이프라인 템플릿 작성. 2021년 ArgoCD로 옮긴 뒤로 안 쓴다.", {
    projects: ["prj-portal-deploy", "prj-mob-gitops"],
  }),
  skill("Helm", INFRA, "2019-01", "2025-06", "차트 작성 · 사내 차트 저장소 운영.", {
    projects: ["prj-fin-k8s", "prj-mob-gitops"],
  }),
  skill("AWS", INFRA, "2017-07", "2026-10", "EC2 · EKS · RDS · VPC 설계. 멀티 존 이중화와 비용 최적화.", {
    projects: ["prj-fin-terraform", "prj-mob-multizone", "prj-com-cost"],
    experiences: ["exp-fintech-sre", "exp-commerce-cost"],
  }),
  skill("OpenTelemetry", INFRA, "2025-10", "2026-10", "수집기 구성 중.", {
    projects: ["prj-com-otel"],
  }, "draft"),
  skill("Linux", INFRA, "2011-01", "2026-10", "서버 운영 전반. 커널 파라미터 튜닝, 성능 분석(perf · eBPF 도구).", {
    experiences: ["exp-si-batch", "exp-portal-infra", "exp-fintech-sre"],
  }),
  skill("Kafka", DATA, "2020-05", "2023-02", "차량 위치 수집 파이프라인. 브로커 18대, 초당 8만 건 운영.", {
    projects: ["prj-mob-kafka", "prj-mob-multizone"],
    experiences: ["exp-mobility-platform"],
  }),
  skill("PostgreSQL", DATA, "2017-07", "2026-10", "결제 DB 운영, 자동 장애 조치. 지금은 플랫폼 도구들의 기본 DB.", {
    projects: ["prj-fin-db-failover", "prj-fin-vault", "prj-com-portal", "prj-com-incident-bot"],
  }),
  skill("Redis", DATA, "2014-03", "2024-12", "검색 캐시, 자동완성 사전.", {
    projects: ["prj-portal-autocomplete", "prj-portal-cache"],
  }),
  skill("Elasticsearch", DATA, "2014-01", "2017-06", "검색 클러스터 운영 보조.", {
    projects: ["prj-portal-cache"],
  }),
];

export const staffPlatform: Persona = {
  key: "dummy-staff-platform",
  displayName: "정우진",
  headline: "플랫폼 · 인프라 스태프 엔지니어 · 15년차",
  profile: { targetRoles: ["DevOps", "백엔드"], experienceYears: 12, primaryGoal: "organize" },
  records: [...experiences, ...projects, ...history, ...certifications, ...writings, ...activities, ...skills],
};
