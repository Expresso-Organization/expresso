import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

import { BrewDemo } from "./BrewDemo";
import { HeroPassage } from "./HeroPassage";
import designShot from "./images/design.jpg";
import editorShot from "./images/editor.jpg";
import materialsShot from "./images/materials.jpg";
import siteFlowLongShot from "./images/site-flow-long.jpg";
import siteFlowShot from "./images/site-flow.jpg";
import siteGridLongShot from "./images/site-grid-long.jpg";
import siteGridPhoneShot from "./images/site-grid-phone.jpg";
import { LandingHeader } from "./LandingHeader";
import { ProductTour, type TourStep } from "./ProductTour";
import styles from "./landing.module.css";

/**
 * 랜딩. 설계 기준은 세 스킬이다 — frontend-design(방향 하나, 대담함은 한 곳),
 * motion-design(Premium 성격, 공유 모션 이벤트), 3d-motion-web(첫 화면 장면).
 *
 * 눈에 남을 것은 첫 화면 하나다 — 코드로 그린 에스프레소 잔. 스크롤하면 크레마 속으로
 * 내려가고, 그 바로 아래 구획이 크레마 빛 바탕에서 시작한다. 나머지 구획은 조용히 둔다.
 *
 * 화면 이미지는 실제 제품을 찍은 것이다. 로컬 개발 서버와 체험 DB 복사본에서 예시 인물
 * 윤하린의 계정으로 찍었고, 개발 주소만 운영 주소 형식으로 바꿨다. 공고 분석 · AI 대화
 * 단계는 그 화면을 찍을 데이터가 없어 실제 화면의 상태 이름과 문구로 그린 그림을 쓴다.
 */
export function Landing() {
  return (
    <div className={styles.page}>
      <LandingHeader>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Expresso">
            <LogoMark size={26} />
            <Wordmark size={21} />
          </Link>
          <nav className={styles.anchors} aria-label="소개">
            <a href="#tailor">기업 맞춤</a>
            <a href="#flow">제작 과정</a>
            <a href="#showcase">포트폴리오 예시</a>
          </nav>
          <AuthLinks size="small" />
        </div>
      </LandingHeader>
      <main>
        <Hero />
        <Tailor />
        <Flow />
        <Showcase />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

/** 로그인 · 회원가입. 머리 메뉴 · 첫 화면 · 마지막 권유가 같은 한 쌍을 쓴다. */
export function AuthLinks({ size }: { size: "small" | "large" }) {
  const sizeClass = size === "large" ? styles.ctaLarge : styles.ctaSmall;
  return (
    <div className={styles.authLinks}>
      <Link href="/signup" className={`${styles.cta} ${styles.ctaPrimary} ${sizeClass}`}>
        회원가입
      </Link>
      <Link href="/login" className={`${styles.cta} ${styles.ctaSecondary} ${sizeClass}`}>
        로그인
      </Link>
    </div>
  );
}

function Hero() {
  return (
    <HeroPassage>
      <div className={styles.heroCopy}>
        <h1 className={styles.headline}>
          <span className="ex-sr-only">Express your work.</span>
          {/* 정의서의 굴림 — work · idea 뒤 self 차례에서 "your"와 붙어 "yourself"가 된다. */}
          <span className={styles.headlineVisual} aria-hidden="true">
            <span className={styles.headlineLead}>
              Express <span className={styles.headlineYour}>your</span>
            </span>
            <span className={styles.rollWindow}>
              <span className={styles.rollTrack}>
                <span className={styles.rollWord}>work.</span>
                <span className={styles.rollWord}>idea.</span>
                <span className={styles.rollWord}>self.</span>
                <span className={styles.rollWord}>work.</span>
              </span>
            </span>
          </span>
        </h1>
        <p className={styles.lede}>
          채용 공고에 맞춘 포트폴리오 사이트를 만들어 드립니다. 공고를 붙여 넣으면 내 커리어 기록 중 공고와 관련 있는
          경험을 골라 사이트로 만들고, 나만의 주소로 배포합니다.
        </p>
        <AuthLinks size="large" />
        <p className={styles.ctaNote}>가입과 기본 사용은 무료입니다.</p>
      </div>
    </HeroPassage>
  );
}

function Tailor() {
  return (
    <section id="tailor" className={`${styles.section} ${styles.tailorSection}`}>
      <div className={styles.container}>
        <h2 className={styles.h2}>지원하는 회사마다 다른 포트폴리오</h2>
        <p className={styles.body}>
          같은 커리어 기록이라도 공고마다 관련 있는 경험이 다릅니다. 공고를 바꿔 보면 앞에 서는 기록과 포트폴리오 첫
          화면이 함께 바뀝니다.
        </p>
        <BrewDemo />
      </div>
    </section>
  );
}

/** 브라우저 창 틀. 안에 실제 화면 이미지나 그림을 넣는다. */
function BrowserFrame({
  address,
  children,
  className,
}: {
  address: string;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={`${styles.browser} ${className ?? ""}`}>
      <div className={styles.browserChrome} aria-hidden="true">
        <span className={styles.browserDot} />
        <span className={styles.browserDot} />
        <span className={styles.browserDot} />
        <span className={styles.browserAddress}>{address}</span>
      </div>
      <div className={styles.browserBody}>{children}</div>
    </div>
  );
}

function Shot({ src, alt }: { src: StaticImageData; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      placeholder="blur"
      sizes="(max-width: 767px) 100vw, (max-width: 1240px) 70vw, 860px"
      className={styles.shot}
    />
  );
}

const REQUIREMENTS = [
  { label: "React와 TypeScript로 서비스를 개발한 경험", evidence: "상품 상세 App Router 전환과 성능 개선", state: "covered" },
  { label: "Core Web Vitals 지표를 측정하고 개선한 경험", evidence: "상품 상세 App Router 전환과 성능 개선", state: "covered" },
  { label: "디자인 시스템을 구축하고 운영한 경험", evidence: "사내 디자인 시스템 '모아 UI' 구축", state: "partial" },
  { label: "프론트엔드 테스트 자동화 경험", evidence: null, state: "missing" },
] as const;

const COVERAGE = {
  covered: { icon: "check-circle", weight: "fill", label: "있음" },
  partial: { icon: "warning-circle", weight: "fill", label: "약함" },
  missing: { icon: "circle-dashed", weight: "regular", label: "없음" },
} as const;

/** 공고 분석 — 공고 상세의 요건 대조 표와 같은 상태 이름 · 아이콘으로 그린 그림. */
function AnalysisFigure() {
  return (
    <div className={styles.figure} role="img" aria-label="공고의 자격 요건 네 개 중 두 개는 기록으로 충족하고, 하나는 약하고, 하나는 기록이 없는 분석 결과">
      <div className={styles.panel} aria-hidden="true">
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>라온커머스(가상) 프론트엔드 개발자</span>
          <span className={styles.panelBadge}>4개 중 2개 충족</span>
        </div>
        {REQUIREMENTS.map((row) => {
          const coverage = COVERAGE[row.state];
          return (
            <div key={row.label} className={`${styles.reqRow} ${styles[`req_${row.state}`] ?? ""}`}>
              <Icon name={coverage.icon} weight={coverage.weight} size={16} className={styles.reqIcon} />
              <span className={styles.reqText}>
                <span className={styles.reqLabel}>{row.label}</span>
                <span className={styles.reqEvidence}>{row.evidence ?? "관련 기록 없음"}</span>
              </span>
              <span className={styles.reqState}>{coverage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** AI 대화 — 기록이 없는 요건을 묻는 질문과 답. */
function ChatFigure() {
  return (
    <div className={styles.figure} role="img" aria-label="AI가 테스트 자동화 경험을 묻고 사용자가 답하는 대화">
      <div className={styles.chat} aria-hidden="true">
        <div className={styles.chatRow}>
          <span className={styles.chatAvatar}>
            <LogoMark size={18} />
          </span>
          <div className={styles.chatBubble}>
            <span className={styles.chatRequirement}>프론트엔드 테스트 자동화 경험</span>
            테스트 자동화를 직접 도입하거나 개선한 적이 있나요? 어떤 화면에 적용했는지 알려 주세요.
          </div>
        </div>
        <div className={`${styles.chatRow} ${styles.chatRowMine}`}>
          <div className={`${styles.chatBubble} ${styles.chatBubbleMine}`}>
            장바구니와 결제 화면에 Playwright 테스트를 붙여서 배포 전에 깨지는 화면을 잡았어요.
          </div>
        </div>
        <div className={styles.chatRow}>
          <span className={styles.chatAvatar}>
            <LogoMark size={18} />
          </span>
          <div className={styles.chatBubble}>테스트를 붙이기 전과 후에 달라진 점이 있었나요?</div>
        </div>
      </div>
    </div>
  );
}

const STEPS: TourStep[] = [
  {
    title: "공고 분석",
    body: "공고 주소나 본문을 붙여 넣으면 자격 요건을 정리하고, 내 기록으로 충족하는 요건과 부족한 요건을 나눠 보여 줍니다.",
    media: <AnalysisFigure />,
  },
  {
    title: "재료 고르기",
    body: "공고와 관련이 깊은 순서로 기록을 정렬합니다. 포트폴리오에 넣을 기록을 체크하면 됩니다.",
    media: (
      <BrowserFrame address="expresso.ai.kr">
        <Shot src={materialsShot} alt="재료 고르기 화면. 기록 19건이 공고 매칭도 순으로 정렬되어 있고 그중 10건이 체크되어 있다." />
      </BrowserFrame>
    ),
  },
  {
    title: "AI 대화",
    body: "기록만으로 부족한 요건은 AI가 질문합니다. 답변 내용은 포트폴리오를 쓸 때 근거로 사용됩니다.",
    media: <ChatFigure />,
  },
  {
    title: "디자인 선택",
    body: "디자인 목록에서 원하는 스타일을 고르면 그 디자인으로 포트폴리오 페이지를 만듭니다.",
    media: (
      <BrowserFrame address="expresso.ai.kr">
        <Shot src={designShot} alt="디자인 선택 화면. 왼쪽에 디자인 목록이, 오른쪽에 고른 디자인 Modern Dark의 미리보기가 있다." />
      </BrowserFrame>
    ),
  },
  {
    title: "다듬기",
    body: "수정하고 싶은 부분을 선택하고 요청 사항을 입력하면 바로 반영됩니다. 이전 버전으로 되돌릴 수도 있습니다.",
    media: (
      <BrowserFrame address="expresso.ai.kr">
        <Shot src={editorShot} alt="편집기 화면. 가운데에 생성된 포트폴리오가, 오른쪽 채팅 칸에 수정 요청이 입력되어 있다." />
      </BrowserFrame>
    ),
  },
  {
    title: "배포",
    body: "완성한 포트폴리오는 개인 주소로 바로 공개됩니다. 방문자가 어느 부분을 오래 봤는지도 확인할 수 있습니다.",
    media: (
      <BrowserFrame address="harin-backdrop-flow.expresso.ai.kr">
        <Shot src={siteFlowShot} alt="배포된 포트폴리오 사이트의 첫 화면. 보라색 바탕에 이름 윤하린이 크게 쓰여 있다." />
      </BrowserFrame>
    ),
  },
];

function Flow() {
  return (
    <section id="flow" className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.h2}>포트폴리오가 만들어지는 과정</h2>
        <ProductTour steps={STEPS} />
      </div>
    </section>
  );
}

/** 포인터를 올리거나 포커스하면 사이트가 창 안에서 끝까지 내려간다. */
function ScrollingSite({ address, src, alt }: { address: string; src: StaticImageData; alt: string }) {
  return (
    <BrowserFrame address={address} className={styles.siteFrame}>
      <div className={styles.siteWindow} tabIndex={0} aria-label={`${address} 미리보기`}>
        <Image src={src} alt={alt} placeholder="blur" sizes="(max-width: 767px) 100vw, 600px" className={styles.siteImage} />
      </div>
    </BrowserFrame>
  );
}

function Showcase() {
  return (
    <section id="showcase" className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.h2}>Expresso로 만든 포트폴리오</h2>
        <p className={styles.body}>
          예시 인물 윤하린의 같은 커리어 기록으로 만든 두 사이트입니다. 고른 디자인에 따라 구성과 분위기가 달라집니다.
        </p>
        <div className={styles.showcase}>
          <ScrollingSite
            address="harin-backdrop-flow.expresso.ai.kr"
            src={siteFlowLongShot}
            alt="보라색 등고선 배경 위에 이름을 크게 둔 포트폴리오 사이트. 아래로 대표 작업 목록과 성과 수치 비교가 이어진다."
          />
          <div className={styles.showcasePair}>
            <ScrollingSite
              address="harin-backdrop-grid.expresso.ai.kr"
              src={siteGridLongShot}
              alt="흰 격자 배경 위에 이름과 대표 프로젝트를 둔 포트폴리오 사이트. 아래로 성과 수치 차트와 작업 목록이 이어진다."
            />
            <div className={styles.showcasePhone} aria-hidden="true">
              <Image src={siteGridPhoneShot} alt="" sizes="180px" className={styles.showcasePhoneImage} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className={styles.closing} data-theme="dark">
      <div className={styles.container}>
        <h2 className={styles.closingTitle}>첫 포트폴리오를 만들어 보세요</h2>
        <p className={styles.closingBody}>
          커리어 기록이 아직 많지 않아도 괜찮습니다. 부족한 내용은 AI의 질문에 답하면서 채울 수 있습니다.
        </p>
        <AuthLinks size="large" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer} data-theme="dark">
      <div className={`${styles.container} ${styles.footerInner}`}>
        <div className={styles.footerBrand}>
          <span className={styles.brand}>
            <LogoMark size={24} tone="dark" />
            <Wordmark size={19} tone="dark" />
          </span>
          <p className={styles.footerLine}>커리어 기록으로 채용 공고에 맞춘 포트폴리오를 만들고 배포합니다.</p>
        </div>
        <nav className={styles.footerLinks} aria-label="바닥글">
          <a href="#tailor">기업 맞춤</a>
          <a href="#flow">제작 과정</a>
          <a href="#showcase">포트폴리오 예시</a>
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
        </nav>
      </div>
      <div className={`${styles.container} ${styles.copyright}`}>© 2026 Expresso</div>
    </footer>
  );
}
