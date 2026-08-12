import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Brain,
  ChartLineUp,
  Check,
  Code,
  EnvelopeSimple,
  Moon,
  Sparkle,
  Sun,
  UsersThree,
} from '@phosphor-icons/react';
import './styles.css';

const person = {
  name: '김지원',
  role: 'Product Engineer',
  location: 'Seoul, Korea',
  period: '2023–2026',
  summary: '사용자 중심 사고와 엔지니어링으로 데이터·업무·협업이 유기적으로 연결된 제품을 만듭니다.',
  email: 'jiwon.kim@example.com',
};

const projects = [
  {
    id: 'expresso',
    title: 'Expresso',
    result: '포트폴리오 생성 시간을 72% 단축',
    shortResult: '72% 단축',
    capability: 'AI 시스템',
    description: '자연어 입력만으로 구조화된 포트폴리오 문서를 만드는 AI 기반 플랫폼을 설계하고 개발했습니다.',
    tags: ['AI', '텍스트 생성', '백엔드', 'UX 설계'],
    icon: Brain,
    index: '01',
  },
  {
    id: 'signalops',
    title: 'SignalOps',
    result: '장애 탐지 시간을 24분에서 4분으로',
    shortResult: '83% 개선',
    capability: '데이터 신뢰성',
    description: '이상 징후를 실시간으로 감지하고 근본 원인 분석까지 연결하는 운영 인텔리전스 시스템을 구축했습니다.',
    tags: ['이상 탐지', '실시간 처리', '데이터 파이프라인', 'SRE'],
    icon: ChartLineUp,
    index: '02',
  },
  {
    id: 'roomloop',
    title: 'RoomLoop',
    result: '팀 활성 사용자 3.1배',
    shortResult: '3.1배 성장',
    capability: '협업 경험',
    description: '팀의 지식과 작업이 자연스럽게 순환하도록 예약과 협업 흐름을 하나의 경험으로 연결했습니다.',
    tags: ['협업', '실시간 동기화', '알림', '프론트엔드'],
    icon: UsersThree,
    index: '03',
  },
];

const filters = ['전체', ...projects.map((project) => project.capability)];

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('portfolio-theme') || 'light');
  const [filter, setFilter] = useState('전체');
  const [openProject, setOpenProject] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('portfolio-theme', theme);
  }, [theme]);

  const visibleProjects = filter === '전체'
    ? projects
    : projects.filter((project) => project.capability === filter);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#work">프로젝트로 바로가기</a>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a href="#top" className="brand" aria-label="김지원 포트폴리오 홈">
          <span className="brand-mark">J</span>
          <span>{person.name}</span>
        </a>
        <nav aria-label="주요 탐색">
          <a href="#work">프로젝트</a>
          <a href="#about">소개</a>
          <a href="#contact">연락</a>
        </nav>
        <button
          type="button"
          className="icon-button"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label={theme === 'light' ? '어두운 테마로 전환' : '밝은 테마로 전환'}
        >
          {theme === 'light' ? <Moon size={19} weight="bold" /> : <Sun size={19} weight="bold" />}
        </button>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="eyebrow"><Sparkle size={16} weight="fill" /> {person.role} · {person.location}</div>
          <h1 id="hero-title">
            복잡한 흐름을<br />
            <span>사랑받는 제품</span>으로.
          </h1>
          <p>{person.summary}</p>
          <div className="hero-actions">
            <a className="button primary" href="#work">프로젝트 보기 <ArrowDown size={18} weight="bold" /></a>
            <a className="button secondary" href={`mailto:${person.email}`}>연락하기 <ArrowUpRight size={18} weight="bold" /></a>
          </div>
          <div className="hero-note" aria-label="현재 상태">
            <span className="status-dot" /> 새로운 제품과 좋은 대화에 열려 있어요
          </div>
        </section>

        <section className="metrics" aria-label="경력 요약">
          <article><strong>3<span>년</span></strong><p>제품을 만든 시간</p></article>
          <article><strong>03</strong><p>대표 프로젝트</p></article>
          <article><strong>Full<span>–stack</span></strong><p>설계부터 출시까지</p></article>
        </section>

        <section className="work-section" id="work" aria-labelledby="work-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">SELECTED WORK · 2023–2026</span>
              <h2 id="work-title">제품으로 만든 변화</h2>
            </div>
            <p>기술 자체보다, 기술이 사용자와 팀에 만든<br />분명한 결과를 이야기합니다.</p>
          </div>

          <div className="filter-row" aria-label="역량별 프로젝트 필터">
            {filters.map((item) => (
              <button
                type="button"
                key={item}
                className={filter === item ? 'filter active' : 'filter'}
                onClick={() => setFilter(item)}
                aria-pressed={filter === item}
              >
                {filter === item && <Check size={14} weight="bold" />}{item}
              </button>
            ))}
          </div>

          <div className="project-grid" aria-live="polite">
            {visibleProjects.map((project) => {
              const Icon = project.icon;
              const isOpen = openProject === project.id;
              return (
                <article className={`project-card ${project.id}`} key={project.id}>
                  <div className="card-topline">
                    <span>{project.index}</span>
                    <span>{project.capability}</span>
                  </div>
                  <div className="project-visual" aria-hidden="true">
                    <div className="visual-grid" />
                    <div className="icon-orbit"><Icon size={38} weight="duotone" /></div>
                    <span className="result-pill">{project.shortResult}</span>
                  </div>
                  <div className="card-content">
                    <h3>{project.title}</h3>
                    <p className="result">{project.result}</p>
                    <p className="description">{project.description}</p>
                    <div className="tags">
                      {project.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                    <button
                      type="button"
                      className="detail-toggle"
                      onClick={() => setOpenProject(isOpen ? null : project.id)}
                      aria-expanded={isOpen}
                      aria-controls={`${project.id}-details`}
                    >
                      {isOpen ? '내용 접기' : '프로젝트 살펴보기'}
                      <ArrowRight size={17} weight="bold" />
                    </button>
                    <div className="expanded" id={`${project.id}-details`} hidden={!isOpen}>
                      <div><span>역할</span><strong>Product design · Engineering</strong></div>
                      <div><span>핵심 기여</span><strong>문제 정의부터 제품 출시까지</strong></div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="about-section" id="about" aria-labelledby="about-title">
          <div className="about-symbol" aria-hidden="true"><Code size={52} weight="duotone" /></div>
          <div>
            <span className="section-kicker">ABOUT</span>
            <h2 id="about-title">사람과 시스템 사이의<br />간격을 설계합니다.</h2>
          </div>
          <div className="about-copy">
            <p>좋은 제품은 복잡함을 감추는 데서 끝나지 않고, 사용자가 더 나은 판단과 행동을 하도록 돕는다고 믿습니다.</p>
            <p>사용자 경험, 데이터 흐름, 엔지니어링 현실을 한 화면에 놓고 가장 단순한 해답을 찾습니다.</p>
            <div className="meta"><span>{person.location}</span><span>{person.period}</span></div>
          </div>
        </section>

        <section className="contact-section" id="contact" aria-labelledby="contact-title">
          <span className="section-kicker">LET'S BUILD SOMETHING USEFUL</span>
          <h2 id="contact-title">좋은 문제를 함께<br />풀어볼까요?</h2>
          <a className="email-link" href={`mailto:${person.email}`}>
            <EnvelopeSimple size={24} /> {person.email} <ArrowUpRight size={22} weight="bold" />
          </a>
        </section>
      </main>

      <footer>
        <span>© 2026 {person.name}</span>
        <span>Designed & built with care in Seoul.</span>
        <a href="#top">맨 위로 <ArrowUpRight size={14} /></a>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
