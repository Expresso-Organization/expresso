/**
 * 장면이 쓰는 색입니다. 모든 픽셀은 바탕과 잉크를 섞은 색입니다.
 *
 * 잉크(`--xp-bd-1` · `--xp-bd-2`)는 `backdropColors`가 바탕에 세기만큼 섞어 둔 불투명 색이고, 정적 배경과 같은 표본으로
 * 글자 대비를 쟀습니다. 장면은 그 잉크와 바탕 사이(비율 0–1)만 그리므로 같은 대비 보장을 받습니다.
 * 더하기 혼합이나 하이라이트처럼 잉크보다 짙어지는 색은 쓰지 않습니다.
 */
export type Rgb = readonly [number, number, number];

/** `#rrggbb`을 0–255 세 값으로 읽습니다. 읽지 못하면 null입니다. */
export function parseHex(value: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1]!;
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as unknown as Rgb;
}

const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** 바탕에서 잉크 쪽으로 `amount`(0–1로 자름)만큼 섞은 색입니다. */
export function inkMix(background: Rgb, ink: Rgb, amount: number): Rgb {
  const t = clamp(amount);
  return [0, 1, 2].map((index) => Math.round(background[index]! + (ink[index]! - background[index]!) * t)) as unknown as Rgb;
}

/** 캔버스 2D가 받는 색 문자열입니다. */
export function cssColor(color: Rgb): string {
  return `rgb(${color[0]},${color[1]},${color[2]})`;
}

/** 셰이더 uniform으로 넘기는 0–1 세 값입니다. */
export function unitColor(color: Rgb): [number, number, number] {
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}
