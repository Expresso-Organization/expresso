import { LayoutSpecSchema, type LayoutSpec } from "@expresso/contracts";

export class LayoutError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "LayoutError";
    this.statusCode = statusCode;
  }
}

/**
 * 포트폴리오에 붙은 지면. 없으면 null이고, 그때 화면은 기본 배치로 그린다.
 *
 * 저장된 값이 지금 계약을 벗어나면(어휘를 좁혔거나 검증을 조인 뒤) 그것도
 * null로 본다 — 옛 지면 하나 때문에 포트폴리오가 열리지 않으면 안 된다.
 */
export function parseStoredSpec(value: unknown): LayoutSpec | null {
  if (value === null || value === undefined) return null;
  const parsed = LayoutSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
