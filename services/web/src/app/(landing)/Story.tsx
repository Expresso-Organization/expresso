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
 * 진행도 하나(`p`)가 모든 장면을 몬다. 이 컴포넌트는 그 값을 무대와 장마다 CSS 변수로 쓰기만 하고,
 * 움직임은 전부 CSS가 그 값에서 계산한다. 스크롤을 되돌리면 그대로 거꾸로 재생된다.
 */

const INTRO = 0.1;
const END = 0.97;

const CHAPTERS = [
  {
    icon: "stack",
    label: "01 · CAREER ARCHIVE",
    name: "커리어 기록",
    title: "기록을 쌓아 둡니다",
    body: "경험 · 프로젝트 · 스킬을 카테고리로 남겨 두면, 지원할 때마다 다시 꺼내 쓰는 재료가 됩니다.",
    level: [0, 0.18],
  },
  {
    icon: "magnifying-glass",
    label: "02 · EXTRACTING",
    name: "공고 분석",
    title: "공고에서 요건을 뽑습니다",
    body: "공고를 붙여 넣으면 자격 요건을 정리하고, 내 기록으로 채운 요건과 비어 있는 요건을 나눠 보여 줍니다.",
    level: [0.18, 0.42],
  },
  {
    icon: "chat-circle-dots",
    label: "03 · BARISTA'S COUNTER",
    name: "AI 대화",
    title: "비어 있는 요건은 물어봅니다",
    body: "기록만으로 부족한 요건은 AI 바리스타가 질문합니다. 답변은 포트폴리오 문장의 근거가 됩니다.",
    level: [0.42, 0.6],
  },
  {
    icon: "target",
    label: "04 · TARGET-ADAPTIVE",
    name: "기업 맞춤",
    title: "공고에 맞춰 다시 고릅니다",
    body: "같은 기록이라도 공고마다 관련 있는 경험이 다릅니다. 요건을 기준으로 기록의 순서를 다시 매깁니다.",
    level: [0.6, 0.77],
  },
  {
    icon: "coffee",
    label: "05 · BREW",
    name: "포트폴리오 추출",
    title: "포트폴리오를 추출합니다",
    body: "고른 기록과 답변에 디자인을 입혀 포트폴리오 페이지를 만듭니다. 고치고 싶은 부분은 말로 요청합니다.",
    level: [0.77, 0.92],
  },
  {
    icon: "paper-plane-tilt",
    label: "06 · PUBLISH",
    name: "배포 · 방문 분석",
    title: "링크 하나로 보냅니다",
    body: "완성한 포트폴리오는 개인 주소로 바로 공개됩니다. 방문자가 어느 섹션을 오래 봤는지도 알려 줍니다.",
    level: [0.92, 1],
  },
] as const;

const LENGTH = (END - INTRO) / CHAPTERS.length;
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
  const percent = useRef<HTMLSpanElement>(null);
  const extractPercent = useRef<HTMLSpanElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const element = section.current;
    const board = stage.current;
    if (!element || !board) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target = 0;
    let current = -1;
    let frame = 0;

    const apply = (p: number) => {
      const intro = clamp(p / INTRO);
      board.style.setProperty("--intro", intro.toFixed(4));
      let active = -1;
      let level = 0;
      CHAPTERS.forEach((chapter, index) => {
        const start = INTRO + index * LENGTH;
        const t = clamp((p - start) / LENGTH);
        // 앞 장이 물러나는 동안 다음 장이 들어온다. 첫 장은 도입부 끝에, 마지막 장은 물러나지 않는다.
        const enter = index === 0 ? clamp((intro - 0.55) / 0.45) : clamp(t / 0.12);
        const exit = index === CHAPTERS.length - 1 ? 0 : clamp((t - 0.88) / 0.12);
        const visible = enter * (1 - exit);
        const panel = panels.current[index];
        if (panel) {
          panel.style.setProperty("--t", t.toFixed(4));
          panel.style.setProperty("--v", visible.toFixed(4));
          panel.style.visibility = visible > 0.001 ? "visible" : "hidden";
        }
        if (p >= start && (index === 0 || p > start)) active = index;
        if (p >= start) level = chapter.level[0] + (chapter.level[1] - chapter.level[0]) * t;
        if (index === 1 && extractPercent.current) {
          extractPercent.current.textContent = `${Math.round(clamp(t * 1.25) * 100)}%`;
        }
      });
      board.style.setProperty("--level", level.toFixed(4));
      if (percent.current) percent.current.textContent = `${Math.round(level * 100)}%`;
      rows.current.forEach((row, index) => {
        if (row) row.dataset.state = index < active ? "done" : index === active ? "active" : "todo";
      });
    };

    const tick = () => {
      frame = 0;
      // 휠 한 번에 진행도가 크게 뛰어도 장면은 따라붙듯 움직인다. 동작 줄이기면 바로 맞춘다.
      current = current < 0 || reduce ? target : current + (target - current) * 0.2;
      if (Math.abs(target - current) < 0.0004) current = target;
      apply(current);
      if (current !== target) frame = requestAnimationFrame(tick);
    };
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      target = clamp(-rect.top / travel);
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
        <div className={styles.hero}>{hero}</div>

        <div className={styles.markColumn}>
          <div className={styles.markBox}>
            <LevelMark />
          </div>
          <div className={styles.markMeta} aria-hidden="true">
            <span ref={percent} className={styles.markPercent}>
              0%
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
 * 브랜드 마크 — 원 · 수위 · 겹쳐진 손잡이(아이콘 문서 §01). 로고와 같은 좌표계(108)를 쓰고,
 * 수위만 `--level`(0~1)로 움직인다. 수면은 획에 맞닿고, 잔잔한 물결이 옆으로 흐른다.
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
          <path
            className={styles.markWave}
            d="M-36 18 Q-27 15.6 -18 18 T0 18 T18 18 T36 18 T54 18 T72 18 T90 18 T108 18 T126 18 T144 18 V130 H-36 Z"
          />
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
