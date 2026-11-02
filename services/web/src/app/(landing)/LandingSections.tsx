import Link from "next/link";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

import styles from "./landing.module.css";

/**
 * 랜딩 구획. 화면 정의서(`docs/Expresso Landing.dc.html`)의 배치 · 색 · 머리글 애니메이션을
 * 따르고, 문구와 그림은 지금 제품이 실제로 하는 일로 바꿨다.
 *
 * 그림은 모두 가상의 공고 · 기록으로 그린 정적 마크업이다. 실제 화면의 상태 이름과 문구
 * (요건 있음 · 약함 · 없음, "근거에서 확인하지 못한 수", 단계 이름)를 그대로 쓴다.
 * 그림은 `aria-hidden`이고 뜻은 옆의 제목과 본문이 맡는다.
 */
export function Landing() {
  return (
    <div className={styles.page}>
      <Header />
      <main>
        <Hero />
        <Barista />
        <Flow />
        <Tailor />
        <Features />
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

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="Expresso">
          <LogoMark size={26} />
          <Wordmark size={21} />
        </Link>
        <nav className={styles.anchors} aria-label="소개">
          <a href="#flow">만드는 순서</a>
          <a href="#tailor">기업 맞춤</a>
        </nav>
        <AuthLinks size="small" />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.container}>
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
          <strong>공고가 묻는 것과 내 기록이 가진 것을 먼저 맞춰 봅니다.</strong> 맞는 기록과 몇 개의 질문으로
          지원하는 곳에 맞춘 포트폴리오 사이트를 만들고, 링크 하나로 보냅니다.
        </p>
        <AuthLinks size="large" />
        <HeroFigure />
      </div>
    </section>
  );
}

const REQUIREMENTS = [
  { label: "Kotlin 또는 Java 서버 개발", evidence: "정산 배치 재작성", state: "covered" },
  { label: "대용량 트래픽 장애 대응", evidence: "결제 장애 원인 추적", state: "covered" },
  { label: "Kafka 기반 이벤트 처리", evidence: "주문 알림 큐 도입", state: "partial" },
  { label: "테스트 자동화 문화", evidence: null, state: "missing" },
] as const;

const COVERAGE = {
  covered: { icon: "check-circle", weight: "fill", label: "있음" },
  partial: { icon: "warning-circle", weight: "fill", label: "약함" },
  missing: { icon: "circle-dashed", weight: "regular", label: "없음" },
} as const;

/** 공고 요건과 내 기록의 대조(공고 상세)와, 그 결과로 만들어지는 지면. */
function HeroFigure() {
  return (
    <div className={styles.frame} aria-hidden="true">
      <div className={styles.frameChrome}>
        <span className={styles.frameDot} />
        <span className={styles.frameDot} />
        <span className={styles.frameDot} />
        <span className={styles.frameAddress}>
          <Icon name="briefcase" size={12} color="var(--ex-accent)" />
          백엔드 엔지니어 · 결제 플랫폼
        </span>
      </div>
      <div className={styles.frameBody}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>필수 요건</span>
            <span className={styles.panelBadge}>4개 중 2개 충족</span>
          </div>
          {REQUIREMENTS.map((row) => {
            const coverage = COVERAGE[row.state];
            return (
              <div key={row.label} className={`${styles.reqRow} ${styles[`req_${row.state}`] ?? ""}`}>
                <Icon name={coverage.icon} weight={coverage.weight} size={16} className={styles.reqIcon} />
                <span className={styles.reqText}>
                  <span className={styles.reqLabel}>{row.label}</span>
                  <span className={styles.reqEvidence}>{row.evidence ?? "기록 없음 · 대화에서 묻습니다"}</span>
                </span>
                <span className={styles.reqState}>{coverage.label}</span>
              </div>
            );
          })}
        </div>
        <div className={styles.sitePreview}>
          <div className={styles.siteAddress}>seojun.expresso.ai.kr</div>
          <div className={styles.siteHero}>
            <span className={styles.siteName}>이서준</span>
            <span className={styles.siteTagline}>결제가 멈추지 않게 만드는 백엔드 개발자</span>
          </div>
          <div className={styles.siteSection}>
            <span className={styles.siteSectionTitle}>결제 장애 원인 추적</span>
            <span className={styles.siteLine} />
            <span className={`${styles.siteLine} ${styles.siteLineShort}`} />
          </div>
          <div className={styles.siteSection}>
            <span className={styles.siteSectionTitle}>정산 배치 재작성</span>
            <span className={styles.siteLine} />
            <span className={`${styles.siteLine} ${styles.siteLineShort}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Barista() {
  return (
    <section className={styles.section}>
      <div className={`${styles.container} ${styles.split}`}>
        <div className={styles.splitCopy}>
          <h2 className={styles.h2}>
            기록에 없는 것은 묻고,
            <br />
            답은 근거로 씁니다
          </h2>
          <p className={styles.body}>
            바리스타는 공고 요건 중 기록이 비는 자리를 골라 질문합니다. 답한 내용은 포트폴리오 문장의 근거가 됩니다.
            근거에서 확인하지 못한 수치가 지면에 들어가면 편집기가 짚어 줍니다.
          </p>
        </div>
        <div className={styles.card} aria-hidden="true">
          <div className={styles.chatRow}>
            <span className={styles.chatAvatar}>
              <LogoMark size={18} />
            </span>
            <div className={styles.chatBubble}>
              <span className={styles.chatRequirement}>테스트 자동화 문화</span>
              테스트 자동화를 직접 도입하거나 고친 적이 있나요?
            </div>
          </div>
          <div className={`${styles.chatRow} ${styles.chatRowMine}`}>
            <div className={`${styles.chatBubble} ${styles.chatBubbleMine}`}>
              주문 서비스에 계약 테스트를 붙여서 배포 전에 깨지는 걸 잡았어요.
            </div>
          </div>
          <div className={styles.caution}>
            <span className={styles.cautionHead}>확인할 곳</span>
            <span className={styles.cautionBody}>
              <Icon name="warning-circle" weight="fill" size={14} color="var(--ex-status-warning-text)" />
              근거에서 확인하지 못한 수: 40%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { icon: "magnifying-glass", title: "공고 분석", body: "공고 주소나 본문을 붙이면 요건을 뽑아 내 기록과 대조합니다." },
  { icon: "check-square", title: "재료 고르기", body: "요건에 맞춰 줄 세운 기록 중 담을 것을 체크합니다." },
  { icon: "chat-circle-dots", title: "AI 대화", body: "기록이 비는 요건을 바리스타가 질문으로 채웁니다." },
  { icon: "palette", title: "디자인 선택", body: "디자인 시스템을 하나 고르면 지면을 만듭니다." },
  { icon: "cursor-click", title: "다듬기", body: "요소를 집어 말로 고치고, 이력에서 되돌립니다." },
  { icon: "link-simple", title: "배포", body: "내 이름의 주소로 배포하고 링크 하나를 보냅니다." },
] as const;

function Flow() {
  return (
    <section id="flow" className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.h2}>공고 하나로 시작해 링크 하나로 끝납니다</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.stepIcon} aria-hidden="true">
                <Icon name={step.icon} size={18} color="var(--ex-accent)" />
              </span>
              <span className={styles.stepTitle}>{step.title}</span>
              <span className={styles.stepBody}>{step.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const RECORDS = ["정산 배치 재작성", "결제 장애 원인 추적", "주문 알림 큐 도입", "검색 랭킹 실험", "사내 디자인 시스템", "계약 테스트 도입"];

const TARGETS = [
  { title: "결제 플랫폼 · 백엔드", picks: ["결제 장애 원인 추적", "정산 배치 재작성", "계약 테스트 도입"] },
  { title: "커머스 검색 · 백엔드", picks: ["검색 랭킹 실험", "주문 알림 큐 도입", "정산 배치 재작성"] },
];

function Tailor() {
  return (
    <section id="tailor" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.inverse} data-theme="dark">
          <div className={styles.inverseCopy}>
            <h2 className={styles.h2}>
              지원하는 곳이 바뀌면
              <br />
              고르는 기록이 바뀝니다
            </h2>
            <p className={styles.inverseBody}>
              같은 기록 묶음을 공고마다 요건에 맞춰 다시 줄 세웁니다. 문장만 바꾸는 것이 아니라 무엇을 담을지부터 다시
              고릅니다.
            </p>
          </div>
          <div className={styles.tailorFigure} aria-hidden="true">
            <div className={styles.pool}>
              {RECORDS.map((record) => (
                <span key={record} className={styles.poolChip}>
                  {record}
                </span>
              ))}
            </div>
            <div className={styles.targets}>
              {TARGETS.map((target) => (
                <div key={target.title} className={styles.target}>
                  <span className={styles.targetTitle}>{target.title}</span>
                  {target.picks.map((pick, index) => (
                    <span key={pick} className={styles.targetPick}>
                      <span className={styles.targetRank}>{index + 1}</span>
                      {pick}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className={styles.section}>
      <div className={`${styles.container} ${styles.features}`}>
        <article className={styles.feature}>
          <span className={styles.featureIcon} aria-hidden="true">
            <Icon name="stack" size={22} color="var(--ex-accent)" />
          </span>
          <h3 className={styles.h3}>쌓아 두는 커리어 기록</h3>
          <p className={styles.featureBody}>
            경험 · 프로젝트 · 자격증을 카테고리로 남겨 두면, 공고가 바뀔 때마다 다시 고르는 재료가 됩니다.
          </p>
          <div className={styles.featureFigure} aria-hidden="true">
            <span className={styles.tag}>경험</span>
            <span className={styles.tag}>프로젝트</span>
            <span className={styles.tag}>자격증 · 수상</span>
            <span className={styles.tag}>스킬 · 도구</span>
          </div>
        </article>
        <article className={styles.feature}>
          <span className={styles.featureIcon} aria-hidden="true">
            <Icon name="cursor-click" size={22} color="var(--ex-accent)" />
          </span>
          <h3 className={styles.h3}>집어서, 말로 고칩니다</h3>
          <p className={styles.featureBody}>
            지면에서 요소를 집어 &ldquo;이 문장 더 짧게&rdquo;라고 적으면 고친 판이 생깁니다. 이전 판은 이력에서 되돌립니다.
          </p>
          <div className={styles.featureFigure} aria-hidden="true">
            <span className={styles.editTarget}>
              <Icon name="cursor-click" size={11} color="var(--ex-fg-muted)" />
              소개 문단
            </span>
            <span className={styles.editInput}>이 문장 더 짧게</span>
          </div>
        </article>
        <article className={styles.feature}>
          <span className={styles.featureIcon} aria-hidden="true">
            <Icon name="chart-bar" size={22} color="var(--ex-accent)" />
          </span>
          <h3 className={styles.h3}>누가 어디를 오래 봤는지</h3>
          <p className={styles.featureBody}>
            방문자가 섹션마다 머문 시간을 보여 줍니다. 면접 전에 무엇을 준비할지 알 수 있습니다.
          </p>
          <div className={styles.featureFigure} aria-hidden="true">
            <span className={styles.dwellRow}>
              <span className={styles.dwellLabel}>결제 장애 원인 추적</span>
              <span className={styles.dwellTrack}>
                <span className={styles.dwellFill} style={{ width: "100%" }} />
              </span>
              <span className={styles.dwellTime}>1:52</span>
            </span>
            <span className={styles.dwellRow}>
              <span className={styles.dwellLabel}>정산 배치 재작성</span>
              <span className={styles.dwellTrack}>
                <span className={styles.dwellFill} style={{ width: "43%" }} />
              </span>
              <span className={styles.dwellTime}>0:48</span>
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.closing}>
          <h2 className={styles.h2}>
            오늘 저녁,
            <br />
            당신의 링크가 생깁니다
          </h2>
          <p className={styles.closingBody}>기록이 완벽하지 않아도 됩니다. 비어 있는 자리는 질문 몇 개로 채웁니다.</p>
          <AuthLinks size="large" />
        </div>
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
          <p className={styles.footerLine}>커리어 기록을 모아 채용 공고에 맞춘 포트폴리오를 만들고 링크 하나로 배포합니다.</p>
        </div>
        <nav className={styles.footerLinks} aria-label="바닥글">
          <a href="#flow">만드는 순서</a>
          <a href="#tailor">기업 맞춤</a>
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
        </nav>
      </div>
      <div className={`${styles.container} ${styles.copyright}`}>© 2026 Expresso</div>
    </footer>
  );
}
