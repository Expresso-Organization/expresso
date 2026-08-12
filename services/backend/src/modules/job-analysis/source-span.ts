import type { JobAnalysisExtraction, JobSourceSpan } from "@expresso/contracts";

export function codePointSlice(value: string, start: number, end: number): string {
  return Array.from(value).slice(start, end).join("");
}

export function validateSourceSpan(source: string, span: JobSourceSpan): boolean {
  return codePointSlice(source, span.start, span.end) === span.quote;
}

export function validateExtractionSource(
  source: string,
  extraction: JobAnalysisExtraction,
): void {
  for (const requirement of extraction.requirements) {
    if (!validateSourceSpan(source, requirement.sourceSpan)) {
      throw new AnalysisEvidenceError(
        `source span does not match immutable posting: ${requirement.label}`,
      );
    }
  }
}

export class AnalysisEvidenceError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "AnalysisEvidenceError";
  }
}
