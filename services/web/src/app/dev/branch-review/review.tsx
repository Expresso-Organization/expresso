"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { LogoMark } from "@/components/brand/Logo";
import { Skel } from "@/components/shell/Skeleton";
import { Icon } from "@/components/ui/Icon";
import jobStyles from "@/app/(app)/jobs/page.module.css";
import careerStyles from "@/features/career-editor/views/views.module.css";

import styles from "./review.module.css";

type Topic = "search" | "career" | "trend";
type Version = "current" | "proposal";
type SearchState = "ready" | "pending" | "slow" | "empty";
const TOPICS = [
  { id: "search", icon: "magnifying-glass", label: "공고 검색", branch: "codex/jobs-search-flow", title: "기다리는 동안에도 검색어와 조건은 그대로", description: "진행 안내와 빈 결과를 선별합니다. 서버 실행을 멈추지 않는 ‘중지’ 버튼은 제안에서 제외했습니다." },
  { id: "career", icon: "table", label: "커리어 표", branch: "feat/career-screen-parity", title: "조작 열을 줄이고, 기록을 읽을 자리를 넓게", description: "제목 안의 행 조작, 하단 상태 집계와 합계, 452px 문서 패널을 비교합니다." },
  { id: "trend", icon: "chart-line", label: "추이 차트", branch: "feat/portfolio-trend-chart", title: "같은 단위의 변화를 한 흐름으로", description: "구조화 포트폴리오에서 값이 세 개 이상일 때만 추이 차트를 제안합니다. 단위가 다르면 개별 값으로 표시합니다." },
] as const;
const RECORDS = [
  { id: "a", title: "상품 검색 서비스 개선", tech: "TypeScript", outcome: "응답 시간 개선", score: 4, status: "검증됨" },
  { id: "b", title: "공통 디자인 시스템", tech: "React", outcome: "컴포넌트 정리", score: 3, status: "정리됨" },
  { id: "c", title: "데이터 분석 대시보드", tech: "Python", outcome: "성과 수치 없음", score: 2, status: "초안" },
  { id: "d", title: "개인 포트폴리오 제작", tech: "Next.js", outcome: "공개 사이트 배포", score: 3, status: "초안" },
];
const JOBS = [
  { title: "백엔드 엔지니어", company: "예시 기업 A", tech: "TypeScript · PostgreSQL", due: "D-12" },
  { title: "플랫폼 소프트웨어 엔지니어", company: "예시 기업 B", tech: "Go · Kubernetes", due: "상시" },
  { title: "제품 개발 엔지니어", company: "예시 기업 C", tech: "React · Node.js", due: "D-20" },
];

function Choice({ selected, onClick, children }: { selected: boolean; onClick(): void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={styles.choice}>{children}</button>;
}

export function BranchReview() {
  const [topic, setTopic] = useState<Topic>("search");
  const [version, setVersion] = useState<Version>("proposal");
  const active = TOPICS.find(item => item.id === topic)!;
  return <main className={styles.review}>
    <header className={styles.header}>
      <a href="#review" className={styles.brand}><LogoMark size={28} /><span>Expresso <small>변경 검토</small></span></a>
      <span className={styles.reviewBadge}>비교용 예시 · 선별안 승인됨</span>
    </header>
    <div className={styles.intro} id="review"><span className={styles.eyebrow}>LOCAL BRANCH REVIEW</span><h1>선별할 변경을 직접 비교해 보세요</h1><p>같은 내용으로 현재 화면과 선별안을 전환합니다. 입력과 선택은 이 페이지에서만 동작하며 저장·AI 호출은 없습니다.</p></div>
    <nav className={styles.topics} aria-label="검토할 기능">{TOPICS.map((item, index) => <button key={item.id} type="button" aria-pressed={topic === item.id} onClick={() => setTopic(item.id)}><span className={styles.number}>0{index + 1}</span><Icon name={item.icon} size={18} /><strong>{item.label}</strong><span className={styles.topicArrow}>↗</span></button>)}</nav>
    <section aria-labelledby="scene-title" className={styles.sceneSection}>
      <div className={styles.sceneHeading}><div><code>{active.branch}</code><h2 id="scene-title">{active.title}</h2></div><div className={styles.versions} aria-label="현재와 선별안"><Choice selected={version === "current"} onClick={() => setVersion("current")}>현재 main</Choice><Choice selected={version === "proposal"} onClick={() => setVersion("proposal")}>선별안</Choice></div></div>
      <p className={styles.description}>{active.description}</p>
      <div className={styles.browser}><div className={styles.browserBar}><div aria-hidden="true"><i /><i /><i /></div><span>expresso.ai.kr / {topic === "search" ? "jobs" : topic === "career" ? "career/project" : "portfolio"}</span><span className={styles.versionLabel}>{version === "proposal" ? "선별안 미리보기" : "현재 코드 기준"}</span></div>
        {topic === "search" ? <SearchPreview proposal={version === "proposal"} /> : topic === "career" ? <CareerPreview proposal={version === "proposal"} /> : <TrendPreview proposal={version === "proposal"} />}
      </div>
    </section>
    <footer className={styles.footer}><span>기존 Expresso 토큰·아이콘·스켈레톤과 브랜치의 배치 규칙을 사용했습니다.</span><span>추천 모델은 이번 반영에서 보류</span></footer>
  </main>;
}

function Sidebar({ page }: { page: "search" | "career" }) {
  return <aside className={styles.sidebar} aria-label="예시 앱 메뉴"><div className={styles.sidebarBrand}><LogoMark size={24} /><span>Expresso</span></div><div className={styles.sidebarAction}><Icon name="plus" size={15} />새 포트폴리오</div><span className={styles.sidebarTitle}>작업 공간</span>{[["house", "홈"], ["folder", "라이브러리"], ["compass", "탐색"], ["chart-bar", "분석"]].map(([icon, label]) => <div key={label} className={page === "search" && label === "탐색" ? styles.navActive : styles.navItem}><Icon name={icon!} size={16} />{label}</div>)}<span className={styles.sidebarTitle}>커리어 기록</span>{["경력", "프로젝트", "학력", "자격·수상"].map(label => <div key={label} className={page === "career" && label === "프로젝트" ? styles.navActive : styles.navItem}><Icon name="file-text" size={15} />{label}</div>)}<div className={styles.sidebarBottom}><span className={styles.avatar}>나</span><span>검토용 계정<small>예시 데이터</small></span></div></aside>;
}

function SearchPreview({ proposal }: { proposal: boolean }) {
  const [state, setState] = useState<SearchState>("ready");
  const [query, setQuery] = useState("서울 TypeScript 백엔드");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const pending = state === "pending" || state === "slow";
  function choose(next: SearchState) { if (timer.current) clearTimeout(timer.current); setState(next); }
  function submit(event: FormEvent) { event.preventDefault(); choose("pending"); timer.current = setTimeout(() => setState(query.trim() ? "ready" : "empty"), 1800); }
  return <>
    <div className={styles.scenarios} aria-label="검색 상태">{([["ready", "검색 완료"], ["pending", "검색 중"], ["slow", "오래 걸림"], ["empty", "결과 없음"]] as const).map(([id, label]) => <Choice key={id} selected={state === id} onClick={() => choose(id)}>{label}</Choice>)}<span>상태를 눌러 비교</span></div>
    <div className={styles.app}><Sidebar page="search" /><div className={styles.appMain}><div className={styles.appHeader}><strong>탐색</strong><span><Icon name="sliders-horizontal" size={16} />필터</span></div><div className={styles.appBody}>
      <div className={styles.exploreTabs}><strong>채용 공고</strong><span>공모전</span><span>해커톤</span><span>부트캠프</span></div>
      {pending && !proposal ? <div className={styles.fullLoading} aria-label="현재 경로 로딩"><Skel h={52} /><Skel h={14} w="60%" />{[0, 1, 2, 3].map(id => <Skel key={id} h={58} />)}</div> : <>
        <div className={jobStyles.queryCard}><form className={jobStyles.queryRow} onSubmit={submit}><Icon name="sparkle" size={18} /><input aria-label="검토용 공고 검색어" className={jobStyles.queryText} value={query} onChange={event => setQuery(event.target.value)} readOnly={pending} /><button className={jobStyles.querySubmit} disabled={pending} type="submit">{pending ? "찾는 중" : "검색"}</button></form><div className={styles.conditions}><span>서울 <Icon name="x" size={10} /></span><span>TypeScript <Icon name="x" size={10} /></span><span>백엔드 <Icon name="x" size={10} /></span></div>{pending && <div className={styles.progress} role="status"><span className={styles.spinner}><Icon name="circle-notch" size={16} /></span>{state === "slow" ? "검색이 조금 길어지고 있습니다. 계속 찾고 있습니다." : "입력한 조건으로 공고를 찾고 있습니다."}</div>}</div>
        <div className={styles.resultTitle}><strong>{pending ? "공고 검색 중" : state === "empty" ? "조건에 맞는 공고 0개" : "조건에 맞는 공고 3개"}</strong><span>관련도순</span></div>
        {pending ? <div className={styles.resultLoading} aria-label="결과 로딩">{[0, 1, 2].map(id => <div key={id}><Skel w={34} h={34} radius={8} /><span><Skel w="74%" h={14} /><Skel w="50%" h={10} /></span><Skel w={44} h={12} /></div>)}</div> : state === "empty" ? proposal ? <div className={styles.empty}><Icon name="magnifying-glass" size={28} /><h3>조건에 맞는 공고가 없습니다</h3><p>검색어를 짧게 바꾸거나 필터를 줄여 다시 찾아보세요.</p><button type="button" onClick={() => { setQuery(""); choose("ready"); }}>전체 공고 보기 <Icon name="arrow-right" size={14} /></button></div> : <div className={styles.oldEmpty}>조건에 맞는 공고가 없습니다.</div> : <div className={styles.jobs}>{JOBS.map((job, index) => <div className={styles.job} key={job.title}><div className={styles.companyMark}>{String.fromCharCode(65 + index)}</div><div><strong>{job.title}</strong><small>{job.company} · 서울</small><span className={styles.jobTech}>{job.tech}</span></div><span>{job.due}</span><Icon name="bookmark-simple" size={17} /></div>)}</div>}
      </>}
    </div></div></div>
  </>;
}

function CareerPreview({ proposal }: { proposal: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState(false);
  const [aggregate, setAggregate] = useState(false);
  const [open, setOpen] = useState(true);
  const [record, setRecord] = useState(RECORDS[0]!);
  const records = filter && proposal ? RECORDS.filter(item => item.status === "초안") : RECORDS;
  function toggle(id: string) { setSelected(value => value.includes(id) ? value.filter(item => item !== id) : [...value, id]); }
  return <><div className={styles.scenarios}><Choice selected={open} onClick={() => setOpen(value => !value)}>{open ? "문서 패널 닫기" : "문서 패널 열기"}</Choice><span>{proposal ? "제목·상태 집계·합계를 눌러 보세요" : "현재 표의 조작 열과 문서 폭"}</span><span className={styles.measure}>문서 {proposal ? "452" : "680"}px</span></div>
    <div className={styles.app}><Sidebar page="career" /><div className={styles.appMain}><div className={styles.appHeader}><strong>내 커리어 <span>/ 프로젝트</span></strong><Icon name="dots-three" size={20} /></div><div className={`${styles.careerBody} ${proposal ? styles.proposedCareer : ""}`}>
      <div className={styles.careerIntro}><Icon name="briefcase" size={23} /><h3>프로젝트</h3><p>내가 만든 것과 그 과정, 성과를 기록합니다.</p></div><div className={styles.viewTabs}><strong><Icon name="table" size={14} />표</strong><span>보드</span><span>타임라인</span><span>갤러리</span></div>
      <div className={`${careerStyles.tableViewport} ${styles.tableViewport}`}><div className={`${styles.careerTable} ${proposal ? styles.compactTable : ""}`} role="table" aria-label="검토용 커리어 표"><div className={styles.tableHead} role="row">{!proposal && <span role="columnheader" aria-label="행 작업" />}<span role="columnheader">제목</span><span role="columnheader">기술</span><span role="columnheader">성과</span><span role="columnheader">점수</span></div>{records.map(item => <div role="row" className={styles.tableRow} key={item.id}>{!proposal && <div role="cell" className={styles.rowControls}><Icon name="dots-six-vertical" size={14} /><input aria-label={`${item.title} 선택`} type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></div>}<div role="cell" className={styles.titleCell}>{proposal && <label className={`${styles.inlineSelect} ${selected.includes(item.id) ? styles.checked : ""}`}><input aria-label={`${item.title} 선택`} type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></label>}<Icon name="file-text" size={15} /><button onClick={() => { setRecord(item); setOpen(true); }} type="button">{item.title}</button></div><span role="cell"><small className={styles.techChip}>{item.tech}</small></span><span role="cell" className={styles.outcome}>{item.outcome}</span><span role="cell" className={styles.score}>{item.score}</span></div>)}</div></div>
      {proposal ? <div className={styles.summary}><button onClick={() => setFilter(false)} aria-pressed={!filter} type="button">{RECORDS.length}개</button><span>·</span><button aria-pressed={filter} onClick={() => setFilter(value => !value)} type="button">초안 2</button>{selected.length > 0 && <span>선택 {selected.length}개</span>}<button type="button" className={styles.sumButton} aria-pressed={aggregate} onClick={() => setAggregate(value => !value)}>{aggregate ? `점수 합계 ${records.reduce((total, item) => total + item.score, 0)}` : "합계 계산"}</button></div> : <div className={styles.oldSummary}>{RECORDS.length}개 기록</div>}
      {open && <aside className={`${styles.document} ${proposal ? styles.narrowDocument : ""}`} aria-label="검토용 문서 패널"><div className={styles.docToolbar}><span><Icon name="arrows-out-simple" size={15} />문서</span><button type="button" aria-label="문서 패널 닫기" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></div><div className={styles.documentContent}><span className={styles.docIcon}><Icon name="file-text" size={32} /></span><h3>{record.title}</h3><dl><div><dt>상태</dt><dd>{record.status}</dd></div><div><dt>기술</dt><dd><small className={styles.techChip}>{record.tech}</small></dd></div><div><dt>출처</dt><dd>직접 작성</dd></div></dl><hr /><h4>내 역할</h4><p>문제를 정리하고 구현 과정을 기록했습니다.</p><h4>만든 것</h4><p>{record.outcome}. 이 내용은 배치 비교를 위한 예시입니다.</p></div></aside>}
    </div></div></div>
  </>;
}

function TrendPreview({ proposal }: { proposal: boolean }) {
  const [scenario, setScenario] = useState("improve");
  const points = scenario === "increase" ? [{ at: "1단계", value: "35%", n: 35 }, { at: "2단계", value: "62%", n: 62 }, { at: "3단계", value: "87%", n: 87 }] : scenario === "mixed" ? [{ at: "1단계", value: "3.2초", n: 3.2 }, { at: "2단계", value: "180KB", n: 180 }, { at: "3단계", value: "1.1초", n: 1.1 }] : [{ at: "개선 전", value: "3.2초", n: 3.2 }, { at: "1차 개선", value: "1.9초", n: 1.9 }, { at: "2차 개선", value: "1.1초", n: 1.1 }];
  const title = scenario === "increase" ? "단계별 테스트 통과율" : "평균 응답 시간";
  const top = scenario === "increase" ? 100 : Math.max(...points.map(point => point.n));
  const positions = points.map((point, index) => ({ x: ((index + 0.5) / points.length) * 100, y: 100 - point.n / top * 100 }));
  const line = positions.map(point => `${point.x},${point.y}`).join(" ");
  return <><div className={styles.scenarios}>{[["improve", "감소 추이"], ["increase", "증가 추이"], ["mixed", "단위가 다름"]].map(([id, label]) => <Choice key={id} selected={scenario === id} onClick={() => setScenario(id!)}>{label}</Choice>)}<span>같은 수치로 표현 방식만 비교</span></div><div className={styles.portfolio}>
    <div className={styles.portfolioTop}><span>EXAMPLE PORTFOLIO</span><span>01 — PROJECT</span></div><div className={styles.projectHeading}><span>대표 프로젝트</span><h3>상품 검색, 기다림을 줄이다.</h3><p>병목을 찾아 개선한 과정을 단계별 측정값으로 남겼습니다.</p></div><div className={styles.caseDetails}><div><small>문제</small><p>검색 결과를 기다리는 시간이 길었습니다.</p></div><div><small>접근</small><p>쿼리와 캐시를 순서대로 개선했습니다.</p></div></div><section className={styles.chartSection} aria-label={title}><h4>{title}</h4>{proposal && scenario !== "mixed" ? <figure className={styles.trend} aria-label={`${title}: ${points.map(point => `${point.at} ${point.value}`).join(", ")}`}><div className={styles.plot}><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className={styles.area} d={`M${positions[0]!.x},100 L${line.replaceAll(" ", " L")} L${positions.at(-1)!.x},100 Z`} /><polyline fill="none" points={line} vectorEffect="non-scaling-stroke" /></svg>{points.map((point, index) => <div className={styles.plotPoint} key={point.at} style={{ left: `${positions[index]!.x}%`, bottom: `${100 - positions[index]!.y}%` }}><strong>{point.value}</strong><i /><span>{point.at}</span></div>)}</div><figcaption>같은 단위 · 0 기준 · 입력된 값만 표시</figcaption></figure> : <><div className={styles.metrics}>{points.map(point => <div key={point.at}><strong>{point.value}</strong><span>{point.at}</span></div>)}</div>{proposal && scenario === "mixed" && <p className={styles.chartFallback}>단위가 달라 추이로 비교하지 않고 개별 값으로 표시합니다.</p>}</>}</section><div className={styles.portfolioFoot}><span>위 수치는 검토용 예시입니다.</span><span>기록에 없는 눈금·증감률은 생성하지 않습니다.</span></div>
  </div></>;
}
