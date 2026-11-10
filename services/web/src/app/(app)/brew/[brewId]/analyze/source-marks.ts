export interface SourceSpanInput {
  id: string;
  start: number;
  end: number;
}

export type SourceSegment =
  | { key: string; text: string; id: null }
  | { key: string; text: string; id: string };

/**
 * 원문을 표시할 조각과 그렇지 않은 조각으로 나눈다.
 *
 * 위치는 코드 포인트다. 서버가 `Array.from`으로 세므로 여기서도 같게 자른다 — UTF-16으로
 * 자르면 이모지 뒤의 표시가 밀린다. 구간이 겹치면 앞 구간이 이기고 뒤 구간은 그 뒤부터다.
 */
export function sourceSegments(text: string, spans: SourceSpanInput[]): SourceSegment[] {
  const chars = Array.from(text);
  const ordered = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: SourceSegment[] = [];
  let cursor = 0;
  const plain = (end: number) => {
    if (end > cursor) segments.push({ key: `t${cursor}`, text: chars.slice(cursor, end).join(""), id: null });
  };
  for (const span of ordered) {
    const start = Math.max(span.start, cursor);
    const end = Math.min(span.end, chars.length);
    if (end <= start) continue;
    plain(start);
    segments.push({ key: `m${start}`, text: chars.slice(start, end).join(""), id: span.id });
    cursor = end;
  }
  plain(chars.length);
  return segments;
}

export interface SourcePart {
  key: string;
  text: string;
  id: string | null;
}

export interface SourceLine {
  key: string;
  /** 제목 줄(`**직무 소개**`), 목록 줄(`-   ...`), 일반 줄. 빈 줄은 문단 틈이다. */
  kind: "heading" | "item" | "text" | "blank";
  /** 목록의 들여쓰기 깊이. */
  depth: number;
  /** 번호 목록이면 원문의 번호. */
  ordinal: string | null;
  parts: SourcePart[];
}

/** 수집한 공고 본문은 Markdown이다. 표시 문법은 지우고 사람이 읽는 글만 남긴다. */
function readable(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\\([\[\]()*_`\\.#!+-])/g, "$1");
}

/**
 * 조각을 줄로 묶어 구조를 드러낸다. 위치 계산은 원문 그대로 끝낸 뒤라 글자를 지워도 표시가
 * 밀리지 않는다. 줄 머리의 목록 표시와 들여쓰기는 배치가 대신하므로 글에서 뺀다.
 */
export function sourceLines(segments: SourceSegment[]): SourceLine[] {
  const raw: { parts: { text: string; id: string | null; key: string }[] }[] = [{ parts: [] }];
  for (const segment of segments) {
    segment.text.split("\n").forEach((piece, index) => {
      if (index > 0) raw.push({ parts: [] });
      if (piece) raw[raw.length - 1]!.parts.push({ text: piece, id: segment.id, key: `${segment.key}-${index}` });
    });
  }
  return raw.map(({ parts }, index) => {
    const whole = parts.map(({ text }) => text).join("");
    const key = `l${index}`;
    if (!whole.trim()) return { key, kind: "blank" as const, depth: 0, ordinal: null, parts: [] };
    const hashes = /^\s*#{1,6}(?:\s+|$)/.exec(whole);
    if (hashes && !whole.slice(hashes[0].length).trim()) return { key, kind: "blank" as const, depth: 0, ordinal: null, parts: [] };
    const item = hashes ? null : /^(\s*)(?:[-*+]|(\d+)\.)\s+/.exec(whole);
    const prefix = hashes ? hashes[0].length : item ? item[0].length : (/^\s*/.exec(whole)?.[0].length ?? 0);
    let skip = prefix;
    const shown: SourcePart[] = [];
    for (const part of parts) {
      const cut = Math.min(skip, part.text.length);
      skip -= cut;
      const text = readable(part.text.slice(cut));
      if (text) shown.push({ key: part.key, text, id: part.id });
    }
    const heading = Boolean(hashes) || (!item && /^\*\*.*\*\*$/.test(whole.trim()));
    return {
      key,
      kind: heading ? ("heading" as const) : item ? ("item" as const) : ("text" as const),
      depth: item ? Math.floor((item[1]?.length ?? 0) / 4) : 0,
      ordinal: item?.[2] ?? null,
      parts: shown,
    };
  });
}
