import { useId } from "react";

/**
 * 화면 정의서의 로고 마크를 그대로 옮긴 것. 컵(원 + 채움)과 손잡이(오른쪽 원호)로
 * 이뤄지고, 지면 밝기에 따라 두 색이 뒤집힌다.
 *
 * - light: 밝은 지면 — 컵 espresso, 손잡이 crema (05 사이드바)
 * - dark:  어두운 지면 — 컵 crema, 손잡이 #A9793F (10 · 10b 좌측 패널)
 */
export function LogoMark({
  size = 22,
  tone = "light",
}: {
  size?: number;
  tone?: "light" | "dark";
}) {
  // 같은 페이지에 로고가 둘 이상 있어도 defs id가 충돌하지 않게 한다.
  const uid = useId().replace(/:/g, "");
  const clip = `ex-logo-clip-${uid}`;
  const mask = `ex-logo-mask-${uid}`;

  const cup = tone === "light" ? "#9A4030" : "#E0B486";
  const handle = tone === "light" ? "#E0B486" : "#A9793F";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 108 108"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="44" cy="54" r="36" />
        </clipPath>
        <mask id={mask}>
          <rect x="0" y="0" width="108" height="108" fill="#fff" />
          <circle cx="44" cy="54" r="46.5" fill="#000" />
        </mask>
      </defs>
      <circle
        cx="78.2"
        cy="54"
        r="19.8"
        stroke={handle}
        strokeWidth="8.5"
        mask={`url(#${mask})`}
      />
      <rect
        x="0"
        y="58.96"
        width="108"
        height="49.04"
        fill={cup}
        clipPath={`url(#${clip})`}
      />
      <circle cx="44" cy="54" r="36" stroke={cup} strokeWidth="10" />
    </svg>
  );
}

/** 워드마크. 로고의 `ss`만 시그니처 색을 쓴다. */
export function Wordmark({
  size = 15.5,
  tone = "light",
}: {
  size?: number;
  tone?: "light" | "dark";
}) {
  return (
    <span
      style={{
        fontFamily: "var(--ex-font-brand)",
        fontSize: `${size}px`,
        fontWeight: 500,
        letterSpacing: "-.025em",
        color: tone === "light" ? "var(--ex-ink-900)" : "var(--ex-white)",
      }}
    >
      Expre
      <span
        style={{
          color: tone === "light" ? "var(--ex-espresso)" : "var(--ex-crema)",
        }}
      >
        ss
      </span>
      o
    </span>
  );
}
