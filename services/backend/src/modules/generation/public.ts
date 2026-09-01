import { type WriterContext, type WriterSection } from "./writer.js";


export interface PathRow {
  id: string; recipe_item_id: string;
  source_type: "record" | "requirement" | "answer";
  source_id: string; source_label: string;
  /** 근거 원문. 수치가 실제로 적혀 있는 곳이라 검증기가 이걸 본다. */
  source_text: string;
}


export interface SectionContext {
  goal?: string; points?: string[]; metrics?: string[];
  format?: string; tone?: string; exclude?: string[];
}


export interface ContextRow {
  section_id: string; section_title: string; section_purpose: string; target_length: number;
  item_id: string; point_text: string; context: SectionContext;
}


export interface BrewSubjectRow {
  job_title: string | null; job_family: string | null;
  free_title: string | null; company_name: string | null; industry: string | null; tone_summary: string | null;
  brand_colors: string[];
}

export class GenerationError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.name = "GenerationError"; this.statusCode = statusCode; }
}

/**
 * 레시피 행들을 문장 계약의 입력으로 편다.
 *
 * 섹션과 근거에 **번호**를 매기는 곳이다. 배열 순서가 곧 번호(1부터)이고,
 * 모델은 그 번호로만 가리킨다 — UUID를 옮겨 적게 하지 않는다.
 */
export function buildWriterContext(input: {
  items: ContextRow[];
  evidence: PathRow[];
  subject: BrewSubjectRow | null;
  lockedTexts: string[];
}): WriterContext {
  const numberOf = new Map(input.evidence.map((path, index) => [path.id, index + 1]));
  const sections: WriterSection[] = [];
  const bySection = new Map<string, WriterSection>();

  for (const row of input.items) {
    let section = bySection.get(row.section_id);
    if (!section) {
      section = {
        recipeSectionId: row.section_id,
        title: row.section_title,
        purpose: row.section_purpose,
        targetLength: row.target_length,
        goal: row.context.goal ?? "",
        points: row.context.points ?? [],
        metrics: row.context.metrics ?? [],
        tone: row.context.tone ?? "",
        format: row.context.format ?? "",
        exclude: row.context.exclude ?? [],
        items: [],
      };
      bySection.set(row.section_id, section);
      sections.push(section);
    }
    section.items.push({
      pointText: row.point_text,
      sourceNumbers: input.evidence
        .filter(({ recipe_item_id }) => recipe_item_id === row.item_id)
        .flatMap((path) => {
          const number = numberOf.get(path.id);
          return number === undefined ? [] : [number];
        }),
    });
  }

  return {
    sections,
    evidence: input.evidence.map((path) => ({
      id: path.id,
      sourceType: path.source_type,
      label: path.source_label,
      text: path.source_text,
    })),
    company: input.subject?.company_name
      ? {
        name: input.subject.company_name,
        industry: input.subject.industry,
        toneSummary: input.subject.tone_summary,
      }
      : null,
    jobTitle: input.subject?.job_title ?? input.subject?.free_title ?? null,
    lockedTexts: input.lockedTexts,
  };
}
