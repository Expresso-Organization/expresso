import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import { LogoMark, Wordmark } from "@/components/brand/Logo";

import designShot from "./images/design.jpg";
import editorShot from "./images/editor.jpg";
import materialsShot from "./images/materials.jpg";
import siteFlowLongShot from "./images/site-flow-long.jpg";
import siteFlowShot from "./images/site-flow.jpg";
import siteGridLongShot from "./images/site-grid-long.jpg";
import siteGridPhoneShot from "./images/site-grid-phone.jpg";
import { ProductTour, type TourStep } from "./ProductTour";
import { Story } from "./Story";
import styles from "./landing.module.css";

/**
 * 랜딩. 디자인 시스템과 아이콘 문서를 따른다.
 *
 * 첫 화면부터 이어지는 스크롤 모션그래픽(Story)이 제품을 소개한다. 브랜드 마크의 수위가
 * 진행률이고, 장 여섯 개가 기록 · 공고 분석 · AI 대화 · 기업 맞춤 · 추출 · 배포를 차례로 재생한다.
 * 그 아래는 실제 제품 화면과 실제로 만든 포트폴리오다.
 *
 * 화면 이미지는 실제 제품을 찍은 것이다. 로컬 개발 서버와 체험 DB 복사본에서 예시 인물
 * 윤하린의 계정으로 찍었고, 개발 주소만 운영 주소 형식으로 바꿨다.
 */
export function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Expresso">
            <LogoMark size={26} />
            <Wordmark size={21} />
          </Link>
          <nav className={styles.anchors} aria-label="소개">
            <a href="#story">서비스 소개</a>
            <a href="#flow">제품 화면</a>
            <a href="#showcase">포트폴리오 예시</a>
          </nav>
          <AuthLinks size="small" />
        </div>
      </header>
      <main>
        <Hero />
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
    <Story
      hero={
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
      }
    />
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

const STEPS: TourStep[] = [
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
        <h2 className={styles.h2}>실제 제품 화면</h2>
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
          <a href="#story">서비스 소개</a>
          <a href="#flow">제품 화면</a>
          <a href="#showcase">포트폴리오 예시</a>
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
        </nav>
      </div>
      <div className={`${styles.container} ${styles.copyright}`}>© 2026 Expresso</div>
    </footer>
  );
}
