"use client";

import type { RecipeV2 } from "@expresso/contracts";
import type { ReactNode } from "react";

import styles from "./ElementSketch.module.css";

/**
 * 요소의 와이어프레임.
 *
 * 캔버스는 목록이 아니라 **지면**이다(§7.6). 요소는 이름표가 붙은 상자가 아니라
 * 그 표시 방식이 실제로 어떤 모양이 될지를 그린 도면으로 선다 — 큰 숫자는 큰
 * 숫자로, 타임라인은 레일과 점으로.
 *
 * 사용자가 적어 넣은 의도와 핵심 메시지는 회색 막대 대신 그 자리에 **진짜
 * 글자**로 들어간다. 채울수록 도면이 읽히는 지면으로 바뀐다.
 */

type Element = RecipeV2["sections"][number]["elements"][number];

function Bars({ widths }: { widths: number[] }) {
  return (
    <span className={styles.bars}>
      {widths.map((width, index) => (
        <i key={index} className={styles.bar} style={{ width: `${width}%` }} />
      ))}
    </span>
  );
}

/** 글자가 있으면 글자를, 없으면 그 자리의 막대를 그린다. */
function Slot({
  text,
  variant = "body",
  widths = [92, 78],
}: {
  text: string;
  variant?: "display" | "heading" | "body" | "caption";
  widths?: number[];
}) {
  if (!text) return <Bars widths={widths} />;
  return <span className={styles[variant]}>{text}</span>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className={styles.eyebrow}>{children}</span>;
}

function Plate({ ratio = "16 / 10" }: { ratio?: string }) {
  return <span className={styles.plate} style={{ aspectRatio: ratio }} />;
}

function Numeral({ children = "42%", small = false }: { children?: ReactNode; small?: boolean }) {
  return <b className={small ? styles.numeralSm : styles.numeral}>{children}</b>;
}

function Pills({ count }: { count: number }) {
  return (
    <span className={styles.pills}>
      {Array.from({ length: count }, (_, index) => (
        <i key={index} className={styles.pill} style={{ width: `${34 + ((index * 17) % 40)}px` }} />
      ))}
    </span>
  );
}

function Actions() {
  return (
    <span className={styles.actions}>
      <i className={styles.btnSolid} />
      <i className={styles.btnQuiet} />
    </span>
  );
}

function Rows({ count, lead }: { count: number; lead: "dot" | "numeral" | "label" }) {
  return (
    <span className={styles.rows}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={styles.row}>
          {lead === "dot" ? <i className={styles.dot} /> : null}
          {lead === "numeral" ? <Numeral small>{["94%", "3배", "24분"][index % 3]}</Numeral> : null}
          {lead === "label" ? <i className={styles.rowLabel} /> : null}
          <span className={styles.rowBody}>
            <Bars widths={[62 + ((index * 13) % 26), 44 + ((index * 9) % 30)]} />
          </span>
        </span>
      ))}
    </span>
  );
}

export function ElementSketch({ element }: { element: Element }) {
  const { intent, takeaway, presentationVariant: variant, kind } = element;

  if (kind === "hero") {
    if (variant === "split") {
      return (
        <span className={styles.two}>
          <span className={styles.col}>
            <Eyebrow>ROLE</Eyebrow>
            <Slot text={intent} variant="display" widths={[88, 62]} />
          </span>
          <span className={styles.col}>
            <Slot text={takeaway} widths={[96, 84, 60]} />
            <Bars widths={[40, 52]} />
          </span>
        </span>
      );
    }
    if (variant === "lead-metric") {
      return (
        <span className={styles.stack}>
          <Eyebrow>ROLE</Eyebrow>
          <Numeral>320ms → 90ms</Numeral>
          <Slot text={intent} widths={[74]} />
        </span>
      );
    }
    if (variant === "image-led") {
      return (
        <span className={styles.two}>
          <Plate ratio="4 / 3" />
          <span className={styles.col}>
            <Eyebrow>ROLE</Eyebrow>
            <Slot text={intent} variant="display" widths={[90, 58]} />
          </span>
        </span>
      );
    }
    if (variant === "profile-card") {
      return (
        <span className={styles.profile}>
          <i className={styles.avatar} />
          <span className={styles.col}>
            <Slot text={intent} variant="heading" widths={[54]} />
            <Bars widths={[74, 46]} />
          </span>
        </span>
      );
    }
    return (
      <span className={styles.stack}>
        <Eyebrow>ROLE</Eyebrow>
        <Slot text={intent} variant="display" widths={[94, 70]} />
        <Slot text={takeaway} widths={[86, 62]} />
        <Actions />
      </span>
    );
  }

  if (kind === "project") {
    if (variant === "problem-action-result") {
      return (
        <span className={styles.stack}>
          <Slot text={intent} variant="heading" widths={[58]} />
          <span className={styles.par}>
            {["문제", "행동", "결과"].map((term, index) => (
              <span key={term} className={styles.parRow}>
                <em>{term}</em>
                <Bars widths={[88 - index * 8]} />
              </span>
            ))}
          </span>
        </span>
      );
    }
    if (variant === "case-study") {
      return (
        <span className={styles.stack}>
          <Eyebrow>CASE</Eyebrow>
          <Slot text={intent} variant="heading" widths={[66]} />
          <Plate ratio="21 / 8" />
          <Slot text={takeaway} widths={[96, 90, 72]} />
        </span>
      );
    }
    if (variant === "artifact-led") {
      return (
        <span className={styles.stack}>
          <span className={styles.plateRow}>
            <Plate ratio="4 / 3" />
            <Plate ratio="4 / 3" />
          </span>
          <Slot text={intent} variant="heading" widths={[58]} />
        </span>
      );
    }
    if (variant === "metric-led") {
      return (
        <span className={styles.leadMetric}>
          <Numeral>24분</Numeral>
          <span className={styles.col}>
            <Slot text={intent} variant="heading" widths={[62]} />
            <Bars widths={[84, 56]} />
          </span>
        </span>
      );
    }
    if (variant === "process-timeline") {
      return (
        <span className={styles.stack}>
          <Slot text={intent} variant="heading" widths={[56]} />
          <span className={styles.steps}>
            {[0, 1, 2, 3].map((step) => (
              <span key={step} className={styles.step}>
                <i className={styles.dot} />
                <Bars widths={[80]} />
              </span>
            ))}
          </span>
        </span>
      );
    }
    return (
      <span className={styles.stack}>
        <Slot text={intent} variant="heading" widths={[52]} />
        <span className={styles.table}>
          {Array.from({ length: 12 }, (_, index) => (
            <i key={index} className={index < 3 ? styles.cellHead : styles.cell} />
          ))}
        </span>
      </span>
    );
  }

  if (kind === "metric" || kind === "chart") {
    if (variant === "before-after") {
      return (
        <span className={styles.stack}>
          <Eyebrow>BEFORE / AFTER</Eyebrow>
          <span className={styles.beforeAfter}>
            <Numeral small>320ms</Numeral>
            <em>→</em>
            <Numeral>90ms</Numeral>
          </span>
          <Slot text={takeaway} variant="caption" widths={[70]} />
        </span>
      );
    }
    if (variant === "cluster") {
      return (
        <span className={styles.cluster}>
          {["94%", "24분", "3배"].map((value) => (
            <span key={value} className={styles.clusterCell}>
              <Numeral small>{value}</Numeral>
              <Bars widths={[70]} />
            </span>
          ))}
        </span>
      );
    }
    if (variant === "bars") {
      return (
        <span className={styles.stack}>
          <Slot text={intent} variant="caption" widths={[46]} />
          <span className={styles.chartBars}>
            {[100, 56, 28].map((width, index) => (
              <span key={width} className={styles.chartBarRow}>
                <i className={styles.chartBar} style={{ width: `${width}%` }} data-accent={index === 2 ? "1" : undefined} />
              </span>
            ))}
          </span>
        </span>
      );
    }
    if (variant === "gauge") {
      return (
        <span className={styles.gaugeRow}>
          <i className={styles.gauge} />
          <span className={styles.col}>
            <Numeral small>75%</Numeral>
            <Slot text={takeaway} variant="caption" widths={[80]} />
          </span>
        </span>
      );
    }
    if (variant === "annotated") {
      return (
        <span className={styles.stack}>
          <Numeral>42%</Numeral>
          <Slot text={intent} widths={[88, 64]} />
          <Slot text={takeaway} variant="caption" widths={[56]} />
        </span>
      );
    }
    return (
      <span className={styles.stack}>
        <Numeral>42%</Numeral>
        <Slot text={intent} variant="caption" widths={[62]} />
      </span>
    );
  }

  if (kind === "timeline") {
    if (variant === "by-organization") {
      return (
        <span className={styles.stack}>
          {[0, 1].map((group) => (
            <span key={group} className={styles.orgGroup}>
              <Bars widths={[38]} />
              <Rows count={2} lead="label" />
            </span>
          ))}
        </span>
      );
    }
    if (variant === "achievement-led") return <Rows count={3} lead="numeral" />;
    if (variant === "role-led" || variant === "project-linked") return <Rows count={3} lead="label" />;
    return (
      <span className={styles.timeline}>
        <i className={styles.rail} />
        <Rows count={3} lead="dot" />
      </span>
    );
  }

  if (kind === "skills") {
    if (variant === "category-list") {
      return (
        <span className={styles.stack}>
          {[0, 1, 2].map((group) => (
            <span key={group} className={styles.skillGroup}>
              <Bars widths={[24]} />
              <Pills count={3 + group} />
            </span>
          ))}
        </span>
      );
    }
    if (variant === "evidence" || variant === "project-linked") return <Rows count={3} lead="label" />;
    if (variant === "stack-table") {
      return (
        <span className={styles.stackTable}>
          {Array.from({ length: 10 }, (_, index) => (
            <i key={index} className={index % 2 === 0 ? styles.cellHead : styles.cell} />
          ))}
        </span>
      );
    }
    return <Pills count={9} />;
  }

  if (kind === "gallery") {
    return (
      <span className={styles.gallery}>
        <Plate ratio="4 / 3" />
        <Plate ratio="4 / 3" />
        <Plate ratio="4 / 3" />
      </span>
    );
  }

  if (kind === "quote") {
    return (
      <span className={styles.quote}>
        <em>“</em>
        <span className={styles.col}>
          <Slot text={intent} variant="heading" widths={[94, 72]} />
          <span className={styles.profile}>
            <i className={styles.avatarSm} />
            <Bars widths={[38]} />
          </span>
        </span>
      </span>
    );
  }

  if (kind === "profile") {
    return (
      <span className={styles.profile}>
        <i className={styles.avatar} />
        <span className={styles.col}>
          <Slot text={intent} variant="heading" widths={[50]} />
          <Bars widths={[86, 62]} />
        </span>
      </span>
    );
  }

  if (kind === "contact") {
    if (variant === "footer") {
      return (
        <span className={styles.footer}>
          <i className={styles.hairline} />
          <span className={styles.footerRow}>
            <Bars widths={[100]} />
            <Bars widths={[100]} />
            <Bars widths={[100]} />
          </span>
        </span>
      );
    }
    return (
      <span className={styles.stack}>
        <Slot text={intent} variant="heading" widths={[58]} />
        <Slot text={takeaway} widths={[80]} />
        <Actions />
      </span>
    );
  }

  // text — 본문 계열. 표시 방식이 인용 · 프로필로 바뀌면 그 모양을 따른다.
  if (variant === "quote") {
    return (
      <span className={styles.quote}>
        <em>“</em>
        <Slot text={intent} variant="heading" widths={[92, 70]} />
      </span>
    );
  }
  return (
    <span className={styles.stack}>
      <Slot text={intent} widths={[96, 92, 88, 74]} />
      {takeaway ? <Slot text={takeaway} variant="caption" /> : <Bars widths={[58]} />}
    </span>
  );
}
