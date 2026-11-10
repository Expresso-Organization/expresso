"use client";

import Image from "next/image";
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import siteGridLongShot from "./images/site-grid-long.jpg";
import styles from "./story.module.css";

/**
 * 스크롤로 재생되는 소개 모션그래픽.
 *
 * 디자인 시스템(`docs/Expresso Design System.dc.html`)과 아이콘 문서(`docs/Expresso Icons.dc.html`)를 따른다.
 * - 주인공은 브랜드 마크다. 아이콘 문서의 정의대로 "기록이 쌓일수록 차오르는 잔"이고, 수위가 곧 진행률이다.
 * - 장 여섯 개는 기능 아이콘(커리어 아카이브 · 기업 맞춤 · Brew · 배포 · AI 인사이트)과
 *   브랜드 순간(EXTRACTING · BARISTA'S COUNTER)을 그대로 쓴다.
 *
 * 스크롤 위치는 지금 장(도입부 · 여섯 장)을 고르기만 한다. 장이 바뀌면 장면은 시간에 따라 끝까지
 * 재생되고, 앞 장은 물러난다. 그래서 스크롤을 어디서 멈춰도 장면이 중간 상태로 남지 않는다.
 * 이 컴포넌트는 그 값(`--intro` · `--level` · 장마다 `--t` · `--v`)을 CSS 변수로 쓰기만 하고,
 * 요소마다의 움직임은 CSS가 그 값에서 계산한다. 위로 스크롤하면 앞 장으로 거꾸로 돌아간다.
 */

const INTRO = 0.1;
const END = 0.97;

const CHAPTERS = [
  {
    icon: "stack",
    label: "01 · CAREER ARCHIVE",
    name: "커리어 기록",
    title: "기록을 쌓아 둡니다",
    body: "경험 · 프로젝트 · 스킬을 카테고리로 남겨 두면, 지원할 때마다 다시 꺼내 쓰는 자료가 됩니다.",
    level: 0.52,
  },
  {
    icon: "magnifying-glass",
    label: "02 · EXTRACTING",
    name: "공고 분석",
    title: "공고에서 요건을 추출합니다",
    body: "공고를 붙여 넣으면 자격 요건을 정리하고, 내 기록으로 채운 요건과 비어 있는 요건을 나눠 보여 줍니다.",
    level: 0.62,
  },
  {
    icon: "chat-circle-dots",
    label: "03 · BARISTA'S COUNTER",
    name: "AI 대화",
    title: "비어 있는 요건은 물어봅니다",
    body: "기록만으로 부족한 요건은 AI 바리스타가 질문합니다. 답변은 포트폴리오 문장의 근거가 됩니다.",
    level: 0.72,
  },
  {
    icon: "target",
    label: "04 · TARGET-ADAPTIVE",
    name: "기업 맞춤",
    title: "공고에 맞춰 다시 고릅니다",
    body: "같은 기록이라도 공고마다 관련 있는 경험이 다릅니다. 요건을 기준으로 기록의 순서를 다시 매깁니다.",
    level: 0.82,
  },
  {
    icon: "coffee",
    label: "05 · BREW",
    name: "포트폴리오 생성",
    title: "포트폴리오를 생성합니다",
    body: "고른 기록과 답변에 디자인을 입혀 포트폴리오 페이지를 만듭니다. 고치고 싶은 부분은 말로 요청합니다.",
    level: 0.91,
  },
  {
    icon: "paper-plane-tilt",
    label: "06 · PUBLISH",
    name: "배포 · 방문 분석",
    title: "링크 하나로 보냅니다",
    body: "완성한 포트폴리오는 개인 주소로 바로 공개됩니다. 방문자가 어느 섹션을 오래 봤는지도 알려 줍니다.",
    level: 1,
  },
] as const;

const LENGTH = (END - INTRO) / CHAPTERS.length;
/**
 * 첫 화면의 수위. 로고(`components/brand/Logo.tsx`)의 채움 윗변 y 58.96과 같다 — 아이콘 문서의 기본 수위 42%.
 * 장마다의 `level`은 여기서부터 100%까지 오른다.
 */
const LOGO_LEVEL = 1 - (58.96 - 18) / 71;
/** 장 하나의 장면이 처음부터 끝까지 재생되는 시간(초). 엇갈린 요소 여섯 개가 차례로 들어올 시간이다. */
const PLAY_SECONDS = 1.4;
/** 장 전환의 시간 상수(초). 약 세 배(0.5초)에 끝난다. */
const FADE_TAU = 0.16;
/** 수위가 새 목표에 닿는 시간 상수(초). */
const LEVEL_TAU = 0.3;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** 예시 인물 윤하린의 기록(체험 DB 복사본의 더미 데이터와 같은 제목). */
const RECORDS = [
  { title: "실시간 주문 현황 대시보드", category: "프로젝트" },
  { title: "사내 디자인 시스템 '모아 UI' 구축", category: "프로젝트" },
  { title: "개인 가계부 PWA", category: "프로젝트" },
  { title: "쇼핑 화면 웹 접근성 개선", category: "프로젝트" },
  { title: "상품 상세 App Router 전환과 성능 개선", category: "프로젝트" },
  { title: "사내 프론트엔드 스터디 운영", category: "활동 · 리더십" },
] as const;

/** 공고(라온커머스 · 가상)의 요건에 맞춘 순위. 인덱스는 RECORDS 순서다. */
const TAILORED = [3, 2, 5, 1, 0, 4];

export function Story({ hero }: { hero: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const heroBox = useRef<HTMLDivElement>(null);
  const percent = useRef<HTMLSpanElement>(null);
  const extractPercent = useRef<HTMLSpanElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const element = section.current;
    const board = stage.current;
    if (!element || !board) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = CHAPTERS.length;
    // 스크롤이 고른 장. -1은 도입부(첫 화면)다.
    let chosen = -1;
    let intro = 0;
    let level = LOGO_LEVEL;
    const play = new Array<number>(count).fill(0);
    const seen = new Array<number>(count).fill(0);
    let frame = 0;
    let last = 0;

    const step = (dt: number) => {
      // 들어오기 · 물러나기 · 수위는 목표에 감속하며 닿는다(지수 감쇠). 동작 줄이기면 바로 맞춘다.
      const settle = (value: number, goal: number, tau: number) => {
        if (reduce) return goal;
        const next = goal + (value - goal) * Math.exp(-dt / tau);
        return Math.abs(next - goal) < 0.001 ? goal : next;
      };
      // 장 안의 장면은 일정한 속도로 흐르는 시간축이다. CSS가 이 값을 요소마다 엇갈려 나눠 쓴다.
      const advance = (value: number, goal: number) => {
        if (reduce) return goal;
        const delta = dt / PLAY_SECONDS;
        return goal > value ? Math.min(goal, value + delta) : Math.max(goal, value - delta);
      };

      intro = settle(intro, chosen >= 0 ? 1 : 0, FADE_TAU);
      level = settle(level, chosen >= 0 ? CHAPTERS[chosen]!.level : LOGO_LEVEL, LEVEL_TAU);
      for (let index = 0; index < count; index += 1) {
        // 앞 장이 거의 사라진 뒤에 들어온다. 두 장의 글이 겹쳐 보이지 않게 한다. 첫 장은 도입부의 글이 물러난 뒤다.
        const othersGone = seen.every((value, other) => other === index || value < 0.05);
        const show = index === chosen && othersGone && (index > 0 || intro > 0.6);
        seen[index] = settle(seen[index]!, show ? 1 : 0, FADE_TAU);
        // 지난 장은 끝난 상태로, 고른 장은 보이기 시작하면 재생하고, 다음 장은 처음으로 감는다.
        const goal = index < chosen ? 1 : index === chosen ? (seen[index]! > 0.5 ? 1 : play[index]!) : 0;
        play[index] = advance(play[index]!, goal);
      }
    };

    const paint = () => {
      board.style.setProperty("--intro", intro.toFixed(4));
      // 글이 다 사라지면(story.module.css .hero의 1 − intro × 2.4) 링크도 탭 순서와 클릭에서 뺀다.
      if (heroBox.current) heroBox.current.style.visibility = 1 - intro * 2.4 > 0.001 ? "visible" : "hidden";
      board.style.setProperty("--level", level.toFixed(4));
      if (percent.current) percent.current.textContent = `${Math.round(level * 100)}%`;
      panels.current.forEach((panel, index) => {
        if (!panel) return;
        panel.style.setProperty("--t", play[index]!.toFixed(4));
        panel.style.setProperty("--v", seen[index]!.toFixed(4));
        panel.style.visibility = seen[index]! > 0.001 ? "visible" : "hidden";
      });
      if (extractPercent.current) {
        extractPercent.current.textContent = `${Math.round(clamp(play[1]! * 1.25) * 100)}%`;
      }
      rows.current.forEach((row, index) => {
        if (row) row.dataset.state = index < chosen ? "done" : index === chosen ? "active" : "todo";
      });
    };

    const settled = () =>
      intro === (chosen >= 0 ? 1 : 0) &&
      level === (chosen >= 0 ? CHAPTERS[chosen]!.level : LOGO_LEVEL) &&
      seen.every((value, index) => value === (index === chosen ? 1 : 0)) &&
      play.every((value, index) => value === (index <= chosen ? 1 : 0));

    const tick = (now: number) => {
      frame = 0;
      // 창이 가려졌다 돌아오면 간격이 길다. 한 번에 0.1초까지만 진행해 장면이 건너뛰지 않게 한다.
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt);
      paint();
      if (settled()) last = 0;
      else frame = requestAnimationFrame(tick);
    };

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const p = clamp(-rect.top / travel);
      // 스크롤은 장만 고른다. 장면은 고른 뒤에 시간으로 끝까지 재생되므로, 어디서 멈춰도 중간 상태로 남지 않는다.
      chosen = p < INTRO / 2 ? -1 : Math.min(count - 1, Math.max(0, Math.floor((p - INTRO) / LENGTH)));
      if (!frame) frame = requestAnimationFrame(tick);
    };

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={section} id="story" className={styles.story} aria-label="Expresso 소개">
      <div ref={stage} className={styles.stage}>
        <div ref={heroBox} className={styles.hero}>
          {hero}
        </div>

        <div className={styles.markColumn}>
          <div className={styles.markBox}>
            <LevelMark />
          </div>
          <div className={styles.markMeta} aria-hidden="true">
            <span ref={percent} className={styles.markPercent}>
              {Math.round(LOGO_LEVEL * 100)}%
            </span>
            <span className={styles.markCaption}>포트폴리오 완성도</span>
          </div>
          <ol className={styles.index} aria-label="소개 순서">
            {CHAPTERS.map((chapter, index) => (
              <li
                key={chapter.name}
                ref={(node) => {
                  rows.current[index] = node;
                }}
                className={styles.indexRow}
                data-state="todo"
              >
                <Icon name={chapter.icon} size={18} className={styles.indexIcon} />
                <span>{chapter.name}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.panels}>
          {CHAPTERS.map((chapter, index) => (
            <div
              key={chapter.name}
              ref={(node) => {
                panels.current[index] = node;
              }}
              className={styles.panel}
              style={{ visibility: "hidden" }}
            >
              <div className={styles.copy}>
                <span className={styles.label}>{chapter.label}</span>
                <h2 className={styles.title}>{chapter.title}</h2>
                <p className={styles.body}>{chapter.body}</p>
              </div>
              <div className={styles.visual} aria-hidden="true">
                {index === 0 ? <ArchiveScene /> : null}
                {index === 1 ? <ExtractScene percentRef={extractPercent} /> : null}
                {index === 2 ? <BaristaScene /> : null}
                {index === 3 ? <TailorScene /> : null}
                {index === 4 ? <BrewScene /> : null}
                {index === 5 ? <PublishScene /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 브랜드 마크 — 원 · 수위 · 겹쳐진 손잡이(아이콘 문서 §01). 로고와 같은 좌표계(108) · 같은 도형이고,
 * 수위만 `--level`로 움직인다. 첫 화면에서는 로고와 똑같이 42%에 있다.
 */
function LevelMark() {
  const uid = useId().replace(/:/g, "");
  const clip = `story-cup-${uid}`;
  const mask = `story-handle-${uid}`;
  return (
    <svg viewBox="0 0 108 108" className={styles.mark} aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <circle cx="44" cy="54" r="36" />
        </clipPath>
        <mask id={mask}>
          <rect x="0" y="0" width="108" height="108" fill="#fff" />
          <circle cx="44" cy="54" r="46.5" fill="#000" />
        </mask>
      </defs>
      <circle cx="78.2" cy="54" r="19.8" className={styles.markHandle} strokeWidth="8.5" mask={`url(#${mask})`} />
      <g clipPath={`url(#${clip})`}>
        <g className={styles.markLiquid}>
          <rect x="0" y="18" width="108" height="112" className={styles.markFill} />
        </g>
      </g>
      <circle cx="44" cy="54" r="36" className={styles.markRing} strokeWidth="10" />
    </svg>
  );
}

function ArchiveScene() {
  return (
    <div className={styles.archive}>
      {RECORDS.map((record, index) => (
        <div key={record.title} className={styles.archiveCard} style={{ "--k": index } as CSSProperties}>
          <span className={styles.archiveCategory}>{record.category}</span>
          <span className={styles.archiveTitle}>{record.title}</span>
          <span className={styles.archiveStatus}>정리됨</span>
        </div>
      ))}
    </div>
  );
}

const POSTING = [
  { text: "라온커머스(가상) 프론트엔드 개발자", strong: true },
  { text: "상품 탐색부터 결제까지 고객이 거치는 화면을 함께 만들 분을 찾습니다." },
  { text: "React와 TypeScript로 서비스를 개발한 경험", mark: 0 },
  { text: "Core Web Vitals 지표를 측정하고 개선한 경험", mark: 1 },
  { text: "디자인 시스템을 구축하고 운영한 경험", mark: 2 },
  { text: "프론트엔드 테스트 자동화 경험", mark: 3 },
];

function ExtractScene({ percentRef }: { percentRef: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <div className={styles.extract}>
      <div className={`${styles.card} ${styles.posting}`}>
        {POSTING.map((line) => (
          <p key={line.text} className={line.strong ? styles.postingTitle : styles.postingLine}>
            {"mark" in line ? (
              <span className={styles.highlight} style={{ "--k": line.mark } as CSSProperties}>
                {line.text}
              </span>
            ) : (
              line.text
            )}
          </p>
        ))}
      </div>
      <div className={`${styles.card} ${styles.progress}`}>
        <div className={styles.progressHead}>
          <span className={styles.label}>EXTRACTING</span>
          <span ref={percentRef} className={styles.progressPercent}>
            0%
          </span>
        </div>
        <div className={styles.progressTrack}>
          <span className={styles.progressFill} />
        </div>
        {["채용 공고 1,240자 읽기", "자격 요건 4개 정리", "내 기록 19건과 대조"].map((step, index) => (
          <div key={step} className={styles.step} style={{ "--k": index } as CSSProperties}>
            <span className={styles.stepDot}>
              <Icon name="check" size={11} weight="bold" className={styles.stepCheck} />
            </span>
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function BaristaScene() {
  return (
    <div className={`${styles.card} ${styles.chat}`}>
      <div className={styles.bubbleRow} style={{ "--k": 0 } as CSSProperties}>
        <span className={styles.avatar} />
        <p className={styles.bubbleAi}>
          <strong>테스트 자동화</strong>를 직접 도입하거나 개선한 적이 있나요?
        </p>
      </div>
      <div className={`${styles.bubbleRow} ${styles.bubbleRowMine}`} style={{ "--k": 1 } as CSSProperties}>
        <p className={styles.bubbleMine}>장바구니와 결제 화면에 Playwright 테스트를 붙여서 배포 전에 깨지는 화면을 잡았어요.</p>
      </div>
      <div className={styles.bubbleRow} style={{ "--k": 2 } as CSSProperties}>
        <span className={styles.avatar} />
        <p className={styles.bubbleAi}>테스트를 붙이기 전과 후에 무엇이 달라졌나요?</p>
      </div>
    </div>
  );
}

function TailorScene() {
  return (
    <div className={`${styles.card} ${styles.tailor}`}>
      <div className={styles.tailorHead}>
        <span className={styles.tailorCompany}>라온커머스(가상)</span>
        <span className={styles.tailorChips}>
          <span>Core Web Vitals</span>
          <span>웹 접근성</span>
          <span>디자인 시스템</span>
        </span>
      </div>
      <ol className={styles.rank}>
        {RECORDS.map((record, index) => {
          const to = TAILORED.indexOf(index);
          return (
            <li
              key={record.title}
              className={styles.rankRow}
              data-picked={to < 3}
              style={{ "--from": index, "--to": to } as CSSProperties}
            >
              <span className={styles.rankNumber}>{to + 1}</span>
              <span className={styles.rankTitle}>{record.title}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BrewScene() {
  return (
    <div className={`${styles.card} ${styles.brew}`}>
      <div className={styles.browserBar}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.brewCanvas}>
        <div className={styles.wire}>
          <span className={styles.wireLine} style={{ "--k": 0, "--w": "28%" } as CSSProperties} />
          <span className={styles.wireTitle} style={{ "--k": 1 } as CSSProperties}>
            윤하린
          </span>
          <span className={styles.wireLine} style={{ "--k": 2, "--w": "64%" } as CSSProperties} />
          <span className={styles.wireLine} style={{ "--k": 3, "--w": "48%" } as CSSProperties} />
          <span className={styles.wireBlock} style={{ "--k": 4 } as CSSProperties} />
          <span className={styles.wireBlock} style={{ "--k": 5 } as CSSProperties} />
        </div>
        <Image src={siteGridLongShot} alt="" sizes="(max-width: 767px) 90vw, 560px" className={styles.brewShot} />
      </div>
    </div>
  );
}

function PublishScene() {
  return (
    <div className={styles.publish}>
      <div className={`${styles.card} ${styles.address}`}>
        <Icon name="globe-simple" size={16} className={styles.addressIcon} />
        <span className={styles.addressText}>harin-backdrop-grid.expresso.ai.kr</span>
        <span className={styles.badge}>PUBLISHED</span>
      </div>
      <div className={`${styles.card} ${styles.insight}`}>
        <span className={styles.label}>AI INSIGHT</span>
        {[
          { name: "상품 상세를 1.9초에 띄웁니다", value: "1:52", width: "100%" },
          { name: "같은 수정을 세 번 하지 않기 위해", value: "1:05", width: "58%" },
          { name: "결제 화면의 접근성은 기본값", value: "0:48", width: "43%" },
        ].map((row, index) => (
          <div key={row.name} className={styles.dwell} style={{ "--k": index, "--w": row.width } as CSSProperties}>
            <span className={styles.dwellName}>{row.name}</span>
            <span className={styles.dwellTrack}>
              <span className={styles.dwellFill} />
            </span>
            <span className={styles.dwellTime}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
