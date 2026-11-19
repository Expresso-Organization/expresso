import type { CareerCategory } from "@expresso/contracts";

/** 라이브러리가 담는 것. 커리어 기록은 분류 키로 고른다. */
export type LibraryKind = "portfolios" | "records" | "plans" | "files";

export type LibrarySelection =
  | { kind: "portfolios" | "plans" | "files" }
  | { kind: "records"; category: CareerCategory };

export const KIND_LABEL: Record<LibraryKind, string> = {
  portfolios: "포트폴리오",
  records: "커리어 기록",
  plans: "준비 계획",
  files: "파일",
};

export const KIND_ICON: Record<LibraryKind, string> = {
  portfolios: "browsers",
  records: "notebook",
  plans: "calendar-check",
  files: "paperclip",
};

/** `s`가 분류 키면 그 분류, 종류 이름이면 그 종류. 모르는 값이면 null이다. */
export function readSelection(value: string | undefined, categories: readonly CareerCategory[]): LibrarySelection | null {
  if (value === "portfolios" || value === "plans" || value === "files") return { kind: value };
  const active = categories.filter((category) => category.archivedAt === null);
  if (value === "records") return active[0] ? { kind: "records", category: active[0] } : null;
  const category = categories.find((item) => item.key === value);
  return category ? { kind: "records", category } : null;
}

/** 목록의 한 줄이 여는 주소. 고른 것은 `s`에 싣는다 — 종류 이름이거나 분류 키다. */
export function selectionHref(selection: string) {
  return { pathname: "/library", query: { s: selection } } as const;
}
