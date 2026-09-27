// 공개 예제에만 쓰는 가상 포트폴리오입니다. 실제 인물·경력·성과를 담지 않습니다.
export const portfolioProjects=[
  {
    title:'모아 지도',category:'지역 정보 · 가상 프로젝트',
    description:'동네의 공공 공간을 찾는 흐름을 정리한 탐색 서비스 콘셉트입니다. 장소를 비교하고 방문 계획을 저장하는 화면을 설계했습니다.',
    image:'./assets/portfolio-moa-map.svg',imageAlt:'가상 프로젝트 모아 지도의 장소 탐색 화면',
    background:'#143e4a',foreground:'#f2fbf9',accent:'#b5e0d2',
  },
  {
    title:'루멘 노트',category:'지식 정리 · 가상 프로젝트',
    description:'읽은 자료를 주제별로 연결하는 개인 지식 도구 콘셉트입니다. 기록·연결·재발견을 하나의 작업 흐름으로 구성했습니다.',
    image:'./assets/portfolio-lumen-note.svg',imageAlt:'가상 프로젝트 루멘 노트의 자료 연결 화면',
    background:'#392b54',foreground:'#faf6ff',accent:'#ddd0f4',
  },
  {
    title:'온길 안내',category:'접근성 · 가상 프로젝트',
    description:'낯선 건물에서 필요한 시설을 찾도록 돕는 안내 화면 콘셉트입니다. 큰 글자와 간단한 선택지로 이동 경로를 표현했습니다.',
    image:'./assets/portfolio-ongil-guide.svg',imageAlt:'가상 프로젝트 온길 안내의 경로 선택 화면',
    background:'#854629',foreground:'#fffaf3',accent:'#f5d5a9',
  },
];

export const portfolioFixtureNames=new Set([
  'case-study-flip-stack','sticky-scroll-cards','orbit-card-stack','scroll-split-card',
]);
