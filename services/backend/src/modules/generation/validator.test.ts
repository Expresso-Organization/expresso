import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GenerationValidationError, validateGenerationOutput, type GenerationEvidence } from "./validator.js";

describe("추출 근거 검증", () => {
  const sectionId = randomUUID();
  const recordPath = randomUUID();
  const requirementPath = randomUUID();
  const evidence: GenerationEvidence[] = [
    {
      id: recordPath,
      sourceType: "record",
      sourceLabel: "적재 파이프라인 운영",
      sourceText: "하루 3,000만 건을 적재하는 파이프라인을 운영했고, 새벽 3시 장애를 두 시간 만에 되돌렸습니다.",
    },
    {
      id: requirementPath,
      sourceType: "requirement",
      sourceLabel: "PostgreSQL 운영 경험 3년 이상",
      sourceText: "PostgreSQL 운영 경험 3년 이상",
    },
  ];

  const block = (over: Record<string, unknown> = {}) => ({
    blocks: [{
      recipeSectionId: sectionId,
      kind: "paragraph" as const,
      text: "하루 3,000만 건을 적재하는 파이프라인을 맡았습니다.",
      label: null,
      evidencePathIds: [recordPath],
      ...over,
    }],
  });

  it("그림에 적힌 수도 근거에 있어야 한다 — 눈에 먼저 들어오는 자리다", () => {
    const batchPath = randomUUID();
    const slaPath = randomUUID();
    const withBatch: GenerationEvidence[] = [...evidence, {
      id: batchPath,
      sourceType: "record",
      sourceLabel: "정산 배치 재설계",
      sourceText: "정산 배치 소요 시간을 220분에서 96분으로, 다시 24분으로 줄였습니다.",
    }, {
      // 같은 수가 적힌 공고 요건. 수는 맞아도 근거로는 못 쓴다.
      id: slaPath,
      sourceType: "requirement",
      sourceLabel: "정산 SLA",
      sourceText: "정산 배치는 220분 이내, 목표는 24분입니다.",
    }];
    const chartBlock = (points: { label: string; value: number }[]) => ({
      blocks: [{
        recipeSectionId: sectionId,
        kind: "chart" as const,
        text: "정산 배치 소요 시간",
        label: null,
        chart: { visualization: "bar" as const, caption: "정산 배치 소요 시간", unit: "분", points },
        evidencePathIds: [batchPath],
      }],
    });

    // 근거에 있는 값으로 그린 그림은 통과한다.
    expect(validateGenerationOutput(
      chartBlock([
        { label: "재설계 전", value: 220 },
        { label: "1차 개선", value: 96 },
        { label: "재설계 후", value: 24 },
      ]),
      withBatch, [], [],
    ).blocks[0]?.chart?.points).toHaveLength(3);

    // 문장에는 없고 그림에만 지어낸 수를 넣는 것이 가장 위험하다 — 눈은 그림을 먼저 믿는다.
    expect(() => validateGenerationOutput(
      chartBlock([{ label: "재설계 전", value: 220 }, { label: "재설계 후", value: 18 }]),
      withBatch, [], [],
    )).toThrow(GenerationValidationError);

    // 그림도 metric과 같이 기록에 붙어야 한다. 공고 요건은 근거가 못 된다.
    expect(() => validateGenerationOutput(
      {
        blocks: [{
          ...chartBlock([{ label: "재설계 전", value: 220 }, { label: "재설계 후", value: 24 }]).blocks[0]!,
          evidencePathIds: [slaPath],
        }],
      },
      withBatch, [], [],
    )).toThrow(/chart block must cite a career record/);
  });

  it("근거에 있는 수치를 쓴 문장은 그대로 통과한다", () => {
    // 문장이 근거와 글자까지 같을 필요는 없다 — 그건 검증이 아니라 복사 강제였다.
    expect(validateGenerationOutput(block(), evidence, [], []).blocks).toHaveLength(1);
    // 자릿점만 다른 것은 같은 값으로 본다.
    expect(validateGenerationOutput(
      block({ text: "3000만 건을 적재했습니다." }), evidence, [], [],
    ).blocks).toHaveLength(1);
    // 수치가 아예 없는 문장은 걸릴 것이 없다.
    expect(validateGenerationOutput(
      block({ text: "적재 파이프라인을 맡았습니다." }), evidence, [], [],
    ).blocks).toHaveLength(1);
  });

  it("근거에 없는 수치는 거절한다", () => {
    expect(() => validateGenerationOutput(
      block({ text: "지연을 99% 줄였습니다." }), evidence, [], [],
    )).toThrow(/99/);
    // 인용하지 않은 근거에서 수치를 빌려 올 수 없다.
    expect(() => validateGenerationOutput(
      block({ text: "3,000만 건", evidencePathIds: [requirementPath] }), evidence, [], [],
    )).toThrow(GenerationValidationError);
    // 근거가 "두 시간"이라고 쓴 것을 "2시간"으로 바꾸면 걸린다.
    expect(() => validateGenerationOutput(
      block({ text: "2시간 만에 되돌렸습니다." }), evidence, [], [],
    )).toThrow(/2/);
  });

  it("레시피 밖 근거 · 제외어 · 잠근 문장을 지킨다", () => {
    expect(() => validateGenerationOutput(
      block({ evidencePathIds: [randomUUID()] }), evidence, [], [],
    )).toThrow(/outside the recipe/);
    expect(() => validateGenerationOutput(
      block({ text: "PostgreSQL을 썼습니다.", evidencePathIds: [requirementPath] }),
      evidence, ["PostgreSQL"], [],
    )).toThrow(/exclusion/);
    expect(() => validateGenerationOutput(
      block(), evidence, [], ["사용자가 잠근 문장"],
    )).toThrow(/locked/);
  });

  it("수치 블록은 기록에 붙어야 한다", () => {
    // `block`의 CHECK가 같은 것을 요구한다. 여기서 걸러야 제약 위반 대신 말이 남는다.
    expect(() => validateGenerationOutput(
      // 수치는 요건에 있지만 기록이 아니다 — 지면이 크게 세울 근거가 못 된다.
      block({ kind: "metric", text: "3년", label: "운영 경험", evidencePathIds: [requirementPath] }),
      evidence, [], [],
    )).toThrow(/career record/);
    expect(validateGenerationOutput(
      block({ kind: "metric", text: "3,000만 건", label: "일 적재량" }), evidence, [], [],
    ).blocks[0]?.label).toBe("일 적재량");
  });
});
