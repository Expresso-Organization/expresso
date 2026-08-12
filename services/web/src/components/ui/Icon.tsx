import type { CSSProperties } from "react";

/**
 * Phosphor Icons 2.1 단일 세트 (§3.5). 기본은 regular, 활성·강조에만 fill.
 * 이름은 접두어 없이 넘긴다 — `<Icon name="house" />`.
 */
export function Icon({
  name,
  weight = "regular",
  size,
  color,
  style,
  className,
}: {
  name: string;
  weight?: "regular" | "fill" | "bold";
  size?: number | undefined;
  color?: string | undefined;
  style?: CSSProperties | undefined;
  className?: string | undefined;
}) {
  const prefix =
    weight === "fill" ? "ph-fill" : weight === "bold" ? "ph-bold" : "ph";
  return (
    <i
      className={[prefix, `ph-${name}`, className].filter(Boolean).join(" ")}
      aria-hidden="true"
      style={{
        ...(size === undefined ? {} : { fontSize: `${size}px` }),
        ...(color === undefined ? {} : { color }),
        ...style,
      }}
    />
  );
}
