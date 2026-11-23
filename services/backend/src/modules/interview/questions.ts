import type { InterviewQuestionBasis } from "@expresso/contracts";

export interface QuestionRequirement {
  id: string;
  label: string;
  coverage: "covered" | "partial" | "missing";
  evidence: string;
}

export interface QuestionRecord {
  id: string;
  title: string;
  text: string;
}

export interface QuestionDraft {
  text: string;
  basis: InterviewQuestionBasis;
  requirementId: string | null;
  variant: number;
}

/** 수치가 들어 있는가. 규칙 경로와 계약 경로가 같은 기준을 본다. */
export function hasMetric(value: string): boolean {
  return /\d|%|퍼센트|배|건|명|회|초|분|시간/.test(value);
}

function requirementQuestion(label: string, coverage: "covered" | "partial" | "missing", variant: number) {
  const subject = label.slice(0, 70);
  // 충족한 요건도 묻는다 — 포트폴리오에 채울 맥락(상황 · 역할 · 판단)을 사용자에게서 받는다.
  if (coverage === "covered") {
    const covered = [
      `${subject}을 보여준 경험에서 어떤 상황이었고 본인은 어떤 역할을 맡았나요?`,
      `${subject} 경험에서 본인이 직접 내린 판단과 그 이유는 무엇인가요?`,
      `${subject}와 관련해 포트폴리오에서 가장 강조하고 싶은 장면은 무엇인가요?`,
    ];
    return covered[variant % covered.length]!;
  }
  const templates = coverage === "missing"
    ? [
        `${subject}와 관련해 직접 맡은 행동은 무엇인가요?`,
        `${subject} 역량을 보여준 구체적 상황은 무엇인가요?`,
        `${subject} 경험에서 해결한 가장 큰 문제는 무엇인가요?`,
      ]
    : [
        `${subject} 경험의 측정 가능한 결과는 무엇인가요?`,
        `${subject}에서 본인이 내린 핵심 결정은 무엇인가요?`,
        `${subject} 성과를 확인한 근거는 무엇인가요?`,
      ];
  return templates[variant % templates.length]!;
}

function recordGapQuestion(title: string, gap: "metric" | "context", variant: number) {
  const subject = title.slice(0, 80);
  if (gap === "context") {
    const context = [
      `${subject}는 어떤 상황에서 시작됐고 본인은 어떤 역할을 맡았나요?`,
      `${subject}에서 본인이 내린 핵심 판단과 그 이유는 무엇인가요?`,
      `${subject}에서 포트폴리오에 꼭 담고 싶은 장면은 무엇인가요?`,
    ];
    return context[variant % context.length]!;
  }
  const templates = [
    `${subject}에서 측정한 결과는 무엇인가요?`,
    `${subject}의 변화를 보여주는 수치는 무엇인가요?`,
    `${subject} 성과를 어떻게 확인했나요?`,
  ];
  return templates[variant % templates.length]!;
}

export function questionTextForBasis(
  basis: InterviewQuestionBasis,
  variant: number,
): string {
  return basis.type === "requirement"
    ? requirementQuestion(basis.evidence, basis.coverage, variant)
    : recordGapQuestion(basis.evidence, basis.gap, variant);
}

export function generateQuestionDrafts(
  requirements: QuestionRequirement[],
  selectedRecords: QuestionRecord[],
): QuestionDraft[] {
  const drafts: QuestionDraft[] = [];
  for (const coverage of ["missing", "partial", "covered"] as const) {
    for (const requirement of requirements.filter((item) => item.coverage === coverage).slice(0, 2)) {
      const basis: InterviewQuestionBasis = {
        type: "requirement",
        requirementId: requirement.id,
        coverage,
        evidence: requirement.evidence,
      };
      drafts.push({
        text: questionTextForBasis(basis, 0),
        basis,
        requirementId: requirement.id,
        variant: 0,
      });
    }
  }
  // 수치가 빠진 기록을 먼저, 수치가 있는 기록은 맥락을 묻는다.
  const ordered = [...selectedRecords.filter((item) => !hasMetric(item.text)), ...selectedRecords.filter((item) => hasMetric(item.text))];
  for (const record of ordered.slice(0, 2)) {
    const basis: InterviewQuestionBasis = {
      type: "record_gap",
      recordId: record.id,
      gap: hasMetric(record.text) ? "context" : "metric",
      evidence: record.title,
    };
    drafts.push({
      text: questionTextForBasis(basis, 0),
      basis,
      requirementId: null,
      variant: 0,
    });
  }

  const grounded = [...drafts];
  let variant = 1;
  while (drafts.length < 3 && grounded.length > 0) {
    const source = grounded[(drafts.length - grounded.length) % grounded.length]!;
    drafts.push({
      ...source,
      text: questionTextForBasis(source.basis, variant),
      variant,
    });
    variant += 1;
  }
  return drafts.slice(0, 6);
}
