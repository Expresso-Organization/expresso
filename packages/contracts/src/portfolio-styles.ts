import { z } from "zod";

import { UuidSchema } from "./common.js";
import { PortfolioStyleMetadataSchema, TemplateStyleSchema } from "./templates.js";

export const PortfolioStylePresetSchema = PortfolioStyleMetadataSchema.extend({
  templateId: UuidSchema,
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1_000),
  order: z.number().int().positive(),
  style: TemplateStyleSchema,
  prompt: z.string().min(1).max(12_000),
});
export type PortfolioStylePreset = z.infer<typeof PortfolioStylePresetSchema>;

/**
 * Design Prompts의 2026-08-28 목록·시각 규칙을 참고해 작성한 포트폴리오용 지시.
 * 원문의 개발 에이전트 역할·SaaS 예시·실행 코드는 복사하지 않는다.
 * 앱 UI의 토큰과 별개인, 생성된 포트폴리오 안에서만 쓰는 색과 표현이다.
 * 번호는 저장된 템플릿 식별자에 쓰므로 새 스타일은 끝에 추가한다.
 */
function preset(
  order: number, slug: string, name: string, description: string,
  mode: PortfolioStylePreset["mode"], font: PortfolioStylePreset["style"]["font"],
  density: PortfolioStylePreset["style"]["density"], structure: PortfolioStylePreset["style"]["structure"],
  colors: [string, string, string], prompt: string,
): PortfolioStylePreset {
  return PortfolioStylePresetSchema.parse({
    templateId: `d3510000-0000-4000-8000-${String(order).padStart(12, "0")}`,
    code: `designprompts-${slug}`, name, description, order, mode,
    sourceUrl: `https://www.designprompts.dev/${slug}`, version: 1,
    style: { background: colors[0], text: colors[1], accent: colors[2], font, density, structure },
    prompt,
  });
}

export const PORTFOLIO_STYLE_PRESETS: readonly PortfolioStylePreset[] = [
  preset(1, "monochrome", "Monochrome", "흑백 대비 · 큰 명조 제목 · 선으로 나눈 지면",
    "light", "serif", "spacious", "wide-margin", ["#ffffff", "#000000", "#000000"],
    "큰 명조 제목을 첫 화면의 중심으로 삼는다. 모든 면은 흰색·검정·회색으로 한정하고, 대표 성과는 흑백 반전 구획으로 강조한다. 모서리는 직각이고 그림자는 없다. 굵기가 다른 가로선과 넓은 여백으로 섹션을 구분한다. 제목과 본문의 크기 차이를 크게 두되 모바일에서 제목이 잘리지 않게 한다. 호버는 짧은 색 반전으로 표현한다."),
  preset(2, "bauhaus", "Bauhaus", "원색과 기본 도형 · 비대칭 구성",
    "light", "sans", "comfortable", "wide-margin", ["#f0f0f0", "#121212", "#d02020"],
    "원·사각형·삼각형과 굵은 검정 선을 구성의 기본으로 삼는다. 기하학적 고딕 제목과 비대칭 정렬로 작업의 문제·기여·결과를 나눈다. 파랑 #1040c0과 노랑 #f0c020은 작은 보조 면에 쓴다. 장식 도형은 본문을 가리지 않고 섹션 위계를 돕는다. 흐린 그림자와 유리 효과를 피하고, 평면의 크기와 위치로 구분한다."),
  preset(3, "modern-dark", "Modern Dark", "깊은 어두운 면 · 은은한 빛 · 정밀한 타이포",
    "dark", "sans", "comfortable", "wide-margin", ["#050506", "#ededef", "#5e6ad2"],
    "거의 검정인 바탕 위에 명도가 조금씩 다른 면을 겹친다. 인디고 빛과 얇은 반투명 경계를 대표 프로젝트 주변에 제한해서 쓴다. 제목은 정밀한 고딕, 메타정보는 작은 고정폭 라벨로 정렬한다. 깊이를 표현하되 모든 섹션을 같은 카드로 만들지 않는다. 유리 효과를 지원하지 않아도 본문을 읽을 수 있는 불투명 바탕을 둔다."),
  preset(4, "newsprint", "Newsprint", "신문 편집 · 명조 제목 · 촘촘한 구획",
    "light", "serif", "compact", "dense-grid", ["#f9f9f7", "#111111", "#cc0000"],
    "신문의 제호처럼 큰 명조 제목과 작은 날짜·역할 라벨을 배치한다. 프로젝트를 기사처럼 묶고, 가로선과 세로선으로 열의 관계를 보인다. 모서리와 경계는 직각이며 그림자와 유리 효과는 쓰지 않는다. 빨강은 핵심 표식에만 쓴다. 좁은 화면에서는 기사 읽는 순서대로 한 열로 접고, 본문의 폭과 줄간격을 확보한다."),
  preset(5, "saas", "SaaS", "명료한 고딕 본문 · 파란 강조 · 넓은 간격",
    "light", "sans", "comfortable", "single-column", ["#ffffff", "#111827", "#0052ff"],
    "명료한 정보 위계와 파란 강조를 사용한다. 첫 화면은 한 가지 강점과 대표 프로젝트로 구성하고, 상세 사례와 성과 구획의 배치를 달리한다. 제목에는 개성 있는 디스플레이 서체를 보조로 쓸 수 있다. 부드러운 라운드와 짧은 상태 전환을 사용한다. 가격표·구독·고객 후기·제품 통계 같은 SaaS 예시를 넣지 않고 사용자 경력만 표현한다."),
  preset(6, "luxury", "Luxury", "절제된 명조 제목 · 비대칭 여백 · 차분한 전환",
    "light", "serif", "spacious", "wide-margin", ["#f9f8f6", "#1a1a1a", "#b09a7a"],
    "여백을 넓게 두고 큰 명조 제목과 작고 정돈된 본문을 대비시킨다. 프로젝트 이미지와 설명을 비대칭으로 배치하되 동일한 정렬선을 공유한다. 가는 선과 절제된 금빛 표식만 사용하고 버튼·배지를 남발하지 않는다. 이미지가 없으면 타이포와 실제 기록으로 구성한다. 느린 장식 때문에 내용을 기다려야 하거나 스크롤이 막히지 않게 한다."),
  preset(7, "terminal", "Terminal", "고정폭 서체 · 터미널 창 · 명령행 표식",
    "dark", "mono", "compact", "dense-grid", ["#0a0a0a", "#33ff00", "#33ff00"],
    "제목과 본문 모두 고정폭 계열을 기본으로 쓰고 한국어는 읽기 쉬운 대체 서체를 지정한다. 프로젝트를 테두리가 얇은 터미널 창으로 나누고 제목 앞에 > 또는 $ 표식을 둔다. 실제 성과 수치는 정렬된 로그나 텍스트 막대로 표현한다. 모서리는 직각이고 그림자는 없다. 커서·주사선 효과는 본문을 방해하지 않게 제한하며, 타이핑 효과로 핵심 내용을 숨기지 않는다."),
  preset(8, "swiss-minimalist", "Swiss Minimalist", "정확한 격자 · 굵은 고딕 · 빨간 표식",
    "light", "sans", "comfortable", "dense-grid", ["#ffffff", "#000000", "#ff3000"],
    "일관된 격자와 왼쪽 정렬을 기준으로 제목·번호·본문의 위치를 맞춘다. 큰 고딕 제목과 작은 역할 라벨의 대비로 위계를 만든다. 검정 선은 구조를 표시하고 빨강은 핵심 행동이나 한 가지 성과에만 사용한다. 모서리는 직각이며 그림자·곡선 장식을 피한다. 영문 대문자 스타일을 한국어에 억지로 적용하지 않는다."),
  preset(9, "kinetic", "Kinetic", "큰 타이포 · 강한 리듬 · 노란 강조",
    "dark", "sans", "spacious", "single-column", ["#09090b", "#fafafa", "#dfe104"],
    "짧은 강점 문장을 포스터처럼 크게 두고, 굵은 제목과 비어 있는 면을 교차시킨다. 라임 노랑은 제목 일부나 핵심 행동에 집중한다. CSS 이동·밑줄·반전으로 제목에 리듬을 줄 수 있지만 핵심 본문은 정적으로 읽히게 한다. 반복 흐름이 필요하면 장식에만 적용하고 모션 감소 설정에서는 멈춘다. 이미지보다 글자 크기·정렬·굵기로 성격을 만든다."),
  preset(10, "flat-design", "Flat Design", "평면 색면 · 기하학적 고딕 · 명료한 위계",
    "light", "sans", "comfortable", "single-column", ["#ffffff", "#111827", "#3b82f6"],
    "그림자·입체 경사·질감·그라데이션 없이 평면으로 구성한다. 고딕 제목의 크기, 단색 면, 간격으로 정보 위계를 만든다. 초록 #10b981과 주황 #f59e0b은 서로 다른 의미의 보조 표식에 한정한다. 프로젝트의 문제·기여·결과를 구별하고, 단순한 도형·선 아이콘을 사용한다. 호버와 포커스는 색과 테두리로 분명히 표시한다."),
  preset(11, "art-deco", "Art Deco", "금빛 선 · 대칭 기하 · 고전적인 제목",
    "dark", "serif", "spacious", "wide-margin", ["#0a0a0a", "#f2f0e4", "#d4af37"],
    "검은 바탕에 금빛 가는 선, 계단형 경계, 부채꼴이나 마름모 표식을 사용한다. 첫 화면은 대칭에 가깝게 구성하고 제목은 고전적인 명조로 크게 둔다. 프로젝트 상세는 읽는 흐름을 유지하며 장식 프레임은 제목 주변에 제한한다. 긴 문장에 과한 자간을 주지 않는다. 금빛은 모든 본문을 칠하는 대신 구획과 강조에 쓴다."),
  preset(12, "material-design", "Material Design", "보라 계열 색면 · 둥근 구획 · 부드러운 반응",
    "light", "sans", "comfortable", "single-column", ["#fffbfe", "#1c1b1f", "#6750a4"],
    "보라색에서 파생된 밝은 면과 넉넉한 라운드로 친근한 지면을 만든다. 중간 굵기의 고딕 제목과 충분한 간격으로 위계를 유지한다. 관련 증거는 같은 색면에 모으고 주제 전환은 면의 명도로 구분한다. 둥근 행동 버튼과 명확한 포커스를 제공한다. 그림자와 부드러운 상태 변화는 인터랙션의 역할을 설명할 때만 쓴다."),
  preset(13, "neo-brutalism", "Neo Brutalism", "굵은 검정 테두리 · 원색 면 · 단단한 그림자",
    "light", "sans", "comfortable", "dense-grid", ["#fffdf5", "#000000", "#ff6b6b"],
    "굵은 검정 경계와 흐림 없는 어긋난 그림자로 면을 분리한다. 무거운 고딕 제목, 노랑 #ffd93d·보라 #c4b5fd 보조 면을 사용한다. 대표 프로젝트는 크기와 위치를 달리해 강조하고 스티커 같은 작은 라벨을 붙인다. 클릭 가능한 요소는 눌린 상태를 보여준다. 과한 회전이나 겹침으로 본문·링크를 가리지 않는다."),
  preset(14, "bold-typography", "Bold Typography", "초대형 제목 · 주홍 강조 · 포스터 구성",
    "dark", "sans", "spacious", "wide-margin", ["#0a0a0a", "#fafafa", "#ff3d00"],
    "첫 화면의 강점 문장을 가장 큰 시각 요소로 삼는다. 제목·부제·본문·행동의 크기를 확실히 나누고, 넓은 어두운 여백으로 제목을 감싼다. 주홍은 한 단어나 얇은 강조선에만 쓴다. 사진을 억지로 넣지 않고 글자의 행갈이와 정렬로 구성한다. 한국어 제목은 단어 단위로 줄바꿈하고 모바일에서 문장이 누락되지 않게 한다."),
  // 사이트 목록의 Light 표시와 달리 실제 프롬프트는 어두운 팔레트다.
  preset(15, "academia", "Academia", "고전 서재 · 따뜻한 명조 · 주석과 구획선",
    "dark", "serif", "comfortable", "wide-margin", ["#1c1714", "#e8dfd4", "#c9a962"],
    "짙은 갈색 바탕과 따뜻한 종이색 본문으로 서재의 분위기를 만든다. 명조 제목·장 번호·가는 이중선으로 프로젝트를 구분한다. 출처가 있는 연구·글·작업에는 작은 주석과 날짜를 붙이고 실제 링크를 보존한다. 황동색 표식은 절제해 사용한다. 원문에 없는 학위·논문·인용·기관 문장을 만들지 않으며 종이 질감은 낮은 대비로 제한한다."),
  preset(16, "cyberpunk", "Cyberpunk", "네온 강조 · 잘린 모서리 · 기술 라벨",
    "dark", "mono", "compact", "dense-grid", ["#0a0a0f", "#e0e0e0", "#00ff88"],
    "어두운 면 위에 네온 선, 잘린 모서리, 작은 기술 라벨을 배치한다. 본문은 고정폭을 기본으로 하고 제목은 기하학적 디스플레이 서체로 변주할 수 있다. 분홍과 청록 보조색은 경계나 상태 표식에 제한한다. 글리치 효과는 장식에만 짧게 사용하고 깜빡임을 피한다. 실제 기록을 허구의 시스템 로그·보안 경고·실시간 수치로 바꾸지 않는다."),
  preset(17, "web3", "Web3", "어두운 유리 면 · 주황빛 강조 · 정밀한 숫자",
    "dark", "sans", "comfortable", "dense-grid", ["#030304", "#ffffff", "#f7931a"],
    "매우 어두운 바탕에 얇은 경계의 반투명 면을 겹치고 주황·금빛으로 핵심 증거를 강조한다. 제목은 기하학적 고딕, 실제 수치와 메타정보는 고정폭으로 정렬한다. 관계를 보여줄 필요가 있을 때만 노드·연결선·격자를 쓴다. 시세·토큰·지갑·투자 통계 같은 예시를 넣지 않는다. 빛과 유리 효과가 없어도 정보 위계가 유지되어야 한다."),
  preset(18, "playful-geometric", "Playful Geometric", "밝은 도형 · 스티커 표식 · 안정된 읽기 흐름",
    "light", "sans", "comfortable", "single-column", ["#fffdf5", "#1e293b", "#8b5cf6"],
    "읽는 영역은 안정된 격자에 두고 주변에 원·삼각형·짧은 곡선을 배치한다. 분홍 #f472b6과 노란 보조 면, 흐림 없는 작은 그림자로 스티커 느낌을 낸다. 둥근 고딕 제목과 역할 라벨을 사용한다. 프로젝트마다 도형을 무작위로 반복하지 말고 실제 구획을 설명하게 한다. 본문 배경은 조용하게 유지하고 도형은 장식임을 표시한다."),
  preset(19, "minimal-dark", "Minimal Dark", "차분한 어두운 여백 · 호박색 강조",
    "dark", "sans", "spacious", "wide-margin", ["#0a0a0f", "#f8fafc", "#f59e0b"],
    "검정에 가까운 바탕과 명도가 다른 차분한 면으로 깊이를 만든다. 넓은 여백, 기하학적 고딕 제목, 얇은 구분선을 사용한다. 호박색은 대표 성과와 행동 링크에 집중한다. 강한 네온·격렬한 모션·밀집된 장식은 피하고, 프로젝트의 핵심을 한 구획씩 읽게 한다. 보조 글자도 어두운 바탕에서 충분히 읽히게 한다."),
  preset(20, "claymorphism", "Claymorphism", "부드러운 입체 면 · 둥근 제목 · 파스텔",
    "light", "sans", "comfortable", "single-column", ["#f4f1fa", "#332f3a", "#7c3aed"],
    "큰 라운드와 여러 겹의 부드러운 바깥·안쪽 그림자로 점토 같은 부피를 표현한다. 밝은 라벤더 면과 둥근 고딕 제목을 사용한다. 대표 프로젝트나 주요 행동에 입체감을 집중하고 긴 본문은 조용한 면에 둔다. 눌림 상태는 짧은 이동과 그림자 변화로 표현한다. 장난감 그림이나 가짜 3D 자산을 내용 대신 넣지 않는다."),
  preset(21, "professional", "Professional", "정갈한 명조 제목 · 따뜻한 바탕 · 절제된 금빛",
    "light", "serif", "spacious", "wide-margin", ["#fafaf8", "#1a1a1a", "#b8860b"],
    "책의 편집처럼 명조 제목과 단정한 본문을 구성한다. 얇은 구획선, 일정한 여백, 절제된 금빛 표식으로 신뢰감을 준다. 프로젝트별 역할·기여·성과를 쉽게 찾도록 라벨을 반복하되 모든 내용을 상자에 넣지 않는다. 본문용 고딕을 보조로 사용할 수 있다. 장식보다 문장·근거·링크를 앞세우고 읽기 흐름을 유지한다."),
  preset(22, "botanical", "Botanical", "식물빛 팔레트 · 유연한 곡선 · 명조 제목",
    "light", "serif", "spacious", "wide-margin", ["#f9f8f4", "#2d3a31", "#8c9a84"],
    "밝은 종이색, 짙은 숲색 본문, 세이지색 강조로 차분한 지면을 만든다. 명조 제목과 아치형 또는 부드러운 곡선 면을 사용한다. 실제 작업 이미지가 있다면 둥근 프레임에 배치하되 내용이 잘리지 않게 한다. 식물선 장식은 작게 제한하고 없던 자연 사진을 요구하지 않는다. 흐린 강조색 위에는 짙은 글자를 써서 대비를 확보한다."),
  preset(23, "vaporwave", "Vaporwave", "보랏빛 바탕 · 네온 격자 · 레트로 디스플레이",
    "dark", "sans", "comfortable", "wide-margin", ["#090014", "#e0e0e0", "#ff00ff"],
    "보라색 어둠 위에 분홍·청록 네온과 원근 격자를 장식으로 배치한다. 기하학적 제목과 고정폭 메타정보로 복고적인 디지털 화면을 만든다. 색 번짐·그라데이션은 제목이나 경계에 제한하고 본문은 단색의 안정된 면에 둔다. CRT 질감과 이동 효과는 낮은 강도로 사용하며 모션 감소 시 정지한다. 가독성을 위해 긴 텍스트에는 글로우를 적용하지 않는다."),
  preset(24, "enterprise", "Enterprise", "정돈된 업무 지면 · 인디고 강조 · 명확한 근거",
    "light", "sans", "comfortable", "single-column", ["#f8fafc", "#0f172a", "#4f46e5"],
    "명확한 제목과 안정된 고딕 본문, 밝은 면, 인디고·보라의 절제된 강조로 구성한다. 대표 프로젝트를 크게 보여주고 역할·협업·성과를 일관된 라벨로 정리한다. 부드러운 라운드와 은은한 그림자를 사용하되 전체를 같은 카드로 만들지 않는다. 기업 로고·고객 수·인증·후기를 만들어 신뢰를 꾸미지 않는다. 실제 근거와 연락 링크로 읽기를 마무리한다."),
  preset(25, "sketch", "Sketch", "손그림 선 · 종이 메모 · 과정 중심 구성",
    "light", "sans", "comfortable", "wide-margin", ["#fdfbf7", "#2d2d2d", "#ff4d4d"],
    "종이 위 메모처럼 약간 불규칙한 테두리, 작은 회전, 흐림 없는 그림자를 사용한다. 제목의 손글씨 느낌은 한국어를 지원하는 서체나 밑줄·선 장식으로 표현하고 본문은 읽기 쉽게 유지한다. 빨간 수정 표식과 파란 보조선을 사용해 생각의 흐름을 안내한다. 실제 문제 해결 과정에만 화살표를 붙이고, 장식 때문에 본문이 기울거나 겹치지 않게 한다."),
  preset(26, "industrial", "Industrial", "기계 패널 · 눌린 구획 · 기술 정보 정렬",
    "light", "sans", "compact", "dense-grid", ["#e0e5ec", "#2d3748", "#e85d04"],
    "차가운 회색 바탕 위에 장비 패널 같은 면을 구성한다. 빛의 방향을 통일한 경사·안쪽 그림자, 얇은 경계와 작은 번호 라벨을 사용한다. 제목은 단단한 고딕, 실제 기술 수치는 고정폭으로 정렬한다. 주황은 행동이나 핵심 변화에만 쓴다. 작동하지 않는 스위치·가짜 계기판은 넣지 않고 모든 제어는 실제 목적이 있어야 한다."),
  preset(27, "neumorphism", "Neumorphism", "같은 색의 돌출·음각 · 차분한 고딕",
    "light", "sans", "spacious", "single-column", ["#e0e5ec", "#3d4852", "#6c63ff"],
    "바탕과 같은 계열의 면에 밝은 그림자와 어두운 그림자를 짝지어 돌출과 음각을 만든다. 제목과 본문은 깔끔한 고딕이며 충분한 간격을 둔다. 주요 행동은 눌린 상태가 구별되게 하고, 음각만으로 클릭 가능성을 전달하지 않는다. 경계와 포커스 표시를 보강하고 작은 보조 글자도 읽기 쉬운 대비를 유지한다. 색보다 면의 깊이 차이로 성격을 드러낸다."),
  preset(28, "organic", "Organic", "자연색 · 비정형 곡선 · 부드러운 명조",
    "light", "serif", "spacious", "wide-margin", ["#fdfcf8", "#2c2c24", "#5d7052"],
    "종이색과 이끼색을 기본으로, 흙빛 #c18c5d을 작은 보조 면에 쓴다. 서로 다른 곡률의 비정형 면과 부드러운 명조 제목을 사용한다. 실제 이미지가 있을 때만 유기적인 프레임을 적용하고, 본문은 평탄한 영역에 둔다. 질감과 자연색 그림자는 낮은 강도로 제한한다. 격자는 읽는 순서를 지키되 섹션 경계를 지나치게 딱딱하게 만들지 않는다."),
  // 이 항목도 목록의 밝기 표시 대신 실제 프롬프트의 바탕을 따른다.
  preset(29, "maximalism", "Maximalism", "다채로운 겹침 · 큰 제목 · 강한 패턴",
    "dark", "sans", "comfortable", "wide-margin", ["#0d0d1a", "#ffffff", "#ff3af2"],
    "강한 분홍·청록·노랑·보라·초록을 역할별로 나누고 큰 고딕 제목과 겹친 도형·패턴을 사용한다. 대표 프로젝트와 한 가지 성과의 위계는 분명히 유지한다. 패턴은 본문 뒤에 직접 깔지 않고 별도 장식 면에 둔다. 내용 겹침·계속 깜빡이는 효과·수평 넘침을 허용하지 않는다. 과감한 표면 표현 안에서도 역할·기여·결과와 연락 행동을 바로 찾을 수 있게 한다."),
  preset(30, "retro", "Retro", "고전 데스크톱 창 · 입체 버튼 · 시스템 서체",
    "light", "sans", "compact", "dense-grid", ["#c0c0c0", "#000000", "#000080"],
    "회색 바탕, 파란 제목줄, 밝고 어두운 경사 테두리로 고전 데스크톱 창을 표현한다. 프로젝트는 창 단위로 묶고 시스템 고딕과 고정폭 메타정보를 사용한다. 버튼은 누름 상태가 분명해야 하며 실제로 동작하는 링크에만 적용한다. 방문자 카운터·공사 중 배너·허구의 시스템 메시지를 넣지 않는다. 모바일에서는 창을 읽는 순서대로 세로로 쌓는다."),
];

export function findPortfolioStyle(code: string): PortfolioStylePreset | undefined {
  return PORTFOLIO_STYLE_PRESETS.find((style) => style.code === code);
}
