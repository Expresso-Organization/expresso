import { interviewQuestionProblems } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { AiError, type AiFix } from "../../platform/ai/client.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import {
  AiQuestionWriter,
  QuestionDraftError,
  countMentions,
  questionDraftViolations,
  type QuestionBasisOption,
  type QuestionContext,
} from "./question-writer.js";

const ids = {
  requirement: "11111111-1111-4111-8111-111111111111",
  record: "22222222-2222-4222-8222-222222222222",
};

const options: QuestionBasisOption[] = [
  {
    basis: {
      type: "requirement",
      requirementId: ids.requirement,
      coverage: "missing",
      evidence: "Airflow 기반 배치 파이프라인 설계 및 개발",
    },
    label: "[공고 요건 · 안 채움] Airflow 배치 파이프라인",
    detail: "Airflow 기반 배치 파이프라인 설계 및 개발",
    mentions: { term: "Airflow", count: 3 },
  },
  {
    basis: { type: "record_gap", recordId: ids.record, gap: "metric", evidence: "온보딩 두 달" },
    label: "[기록 · 수치 없음] 신입 두 명을 동시에 온보딩한 두 달",
    detail: "본문입니다.",
    mentions: null,
  },
  {
    basis: {
      type: "requirement",
      requirementId: "33333333-3333-4333-8333-333333333333",
      coverage: "partial",
      evidence: "데이터 정합성 보장",
    },
    label: "[공고 요건 · 일부만] 데이터 정합성",
    detail: "데이터 정합성 보장",
    mentions: { term: "정합성", count: 1 },
  },
];

const context: QuestionContext = {
  options,
  company: { name: "뱅크샐러드", industry: "핀테크", toneSummary: "담백한 존댓말" },
  jobTitle: "데이터 파이프라인 엔지니어",
  materials: ["정산 스케줄러 재설계"],
};

const good = {
  questions: [
    { basis: 1, text: "Airflow로 어떤 배치를 돌려 보셨나요?", rationale: "공고가 Airflow를 3번 언급했는데 기록에는 없습니다." },
    { basis: 2, text: "온보딩 두 달 동안 무엇이 달라졌나요?", rationale: "결과를 보여줄 수치가 빠져 있습니다." },
    { basis: 3, text: "정합성을 어떻게 확인하셨나요?", rationale: "공고가 정합성 보장을 요구합니다." },
  ],
};

/** 첫 출력은 `reply`, 고치기 요청에는 `fix`가 답한다. 어댑터와 같은 검사 · 고치기 순서를 탄다. */
function scripted(reply: unknown, fix?: (paths: string[]) => AiFix[]) {
  return new ScriptedAiClient(() => {
    if (reply instanceof Error) throw reply;
    return reply;
  }, fix && ((_, paths) => fix(paths)));
}

describe("질문 생성 계약", () => {
  it("근거를 번호로 준다 — UUID도 세지 않은 숫자도 없다", async () => {
    const ai = scripted(good);
    const drafted = await new AiQuestionWriter(ai).draft(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("question_draft");
    expect(prompt).toContain("1. [공고 요건 · 안 채움] Airflow 배치 파이프라인");
    // 언급 횟수는 우리가 센 값이다. 모델이 짐작하게 두지 않는다.
    expect(prompt).toContain('공고가 "Airflow"를 3번 언급했다');
    // 한 번만 언급된 것은 굳이 알리지 않는다.
    expect(prompt).not.toContain('"정합성"를 1번');
    expect(prompt).toContain("## 이미 고른 재료");
    for (const id of Object.values(ids)) expect(prompt).not.toContain(id);

    expect(drafted.map(({ optionIndex }) => optionIndex)).toEqual([0, 1, 2]);
    expect(drafted[0]?.rationale).toContain("3번 언급");
  });

  it("예/아니오로 답할 질문은 검사에 걸린다", () => {
    // 한국어에서 예/아니오는 어미가 아니라 의문사의 유무로 갈린다.
    expect(interviewQuestionProblems("Airflow를 써 보셨나요?")).toHaveLength(1);
    expect(interviewQuestionProblems("Airflow로 무엇을 만드셨나요?")).toEqual([]);
  });

  it("한 번에 두 가지를 물으면 검사에 걸린다", () => {
    expect(interviewQuestionProblems("무엇을 만드셨나요? 그리고 결과는 어떠했나요?"))
      .toEqual([expect.stringContaining("한 번에 한 가지만")]);
  });

  it("질문 규칙을 어긴 질문은 그 문장만 고쳐 받는다", async () => {
    const yesNo = { questions: [good.questions[0]!, { ...good.questions[1]!, text: "온보딩을 해 보셨나요?" }, good.questions[2]!] };
    expect(questionDraftViolations(yesNo, options.length)).toEqual([
      { path: "/questions/1/text", problem: expect.stringContaining("예/아니오") },
    ]);

    const ai = scripted(yesNo, () => [{ path: "/questions/1/text", value: good.questions[1]!.text }]);
    const drafted = await new AiQuestionWriter(ai).draft(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/questions/1/text"]]);
    expect(drafted[1]?.text).toBe(good.questions[1]!.text);
  });

  it("고쳐도 남은 질문 규칙 위반은 그대로 쓴다", async () => {
    const yesNo = { questions: [good.questions[0]!, { ...good.questions[1]!, text: "온보딩을 해 보셨나요?" }, good.questions[2]!] };
    const ai = scripted(yesNo);
    const drafted = await new AiQuestionWriter(ai).draft(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests).toHaveLength(2);
    expect(drafted.map(({ text }) => text)).toContain("온보딩을 해 보셨나요?");
  });

  it("없는 번호와 겹치는 번호로 질문이 모자라면 목록 전체를 고쳐 받는다", async () => {
    const messy = {
      questions: [
        good.questions[0]!,
        { ...good.questions[1]!, basis: 9 },
        { ...good.questions[2]!, basis: 1 },
      ],
    };
    // 남는 질문이 하나뿐이라 질문을 더 써야 한다. 칸별 이유는 목록 이유에 붙는다.
    const violations = questionDraftViolations(messy, options.length);
    expect(violations.map(({ path }) => path)).toEqual(["/questions/1/basis", "/questions/2/basis", "/questions"]);
    expect(violations.at(-1)?.problem).toContain("질문이 2개 더 필요합니다");

    const ai = scripted(messy, () => [{ path: "/questions", value: good.questions }]);
    const drafted = await new AiQuestionWriter(ai).draft(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests[0]?.paths).toEqual(["/questions"]);
    expect(drafted).toHaveLength(3);
  });

  it("고쳐도 근거 붙은 질문이 3개가 안 되면 세션을 만들 수 없다", async () => {
    const messy = { questions: [good.questions[0]!, { ...good.questions[1]!, basis: 9 }, { ...good.questions[2]!, basis: 1 }] };
    const ai = scripted(messy);
    await expect(new AiQuestionWriter(ai).draft(context)).rejects.toThrow(/근거에 붙은 질문이 1개뿐입니다/);
    expect(ai.calls).toHaveLength(1);
  });

  it("질문이 3개보다 적으면 계약이 고쳐 받고, 끝내 못 맞추면 질문 초안 실패다", async () => {
    const short = { questions: good.questions.slice(0, 2) };
    const ai = scripted(short);
    await expect(new AiQuestionWriter(ai).draft(context)).rejects.toThrow(QuestionDraftError);
    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests[0]?.paths).toEqual(["/questions"]);
  });

  it("프롬프트는 계약과 같은 3개 이상을 요구한다", async () => {
    const ai = scripted(good);
    await new AiQuestionWriter(ai).draft(context);
    expect(ai.calls[0]?.prompt).toContain("3개보다 적게 내지 않는다");
    expect(ai.calls[0]?.prompt).not.toContain("적게 골라도 된다");
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "question_draft", "usage limit", { retryable: false });
    const ai = scripted(limited);
    await expect(new AiQuestionWriter(ai).draft(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });

  it("물을 자리가 없으면 부르지 않는다", async () => {
    const ai = scripted(good);
    await expect(new AiQuestionWriter(ai).draft({ ...context, options: [] }))
      .rejects.toThrow(QuestionDraftError);
    expect(ai.calls).toHaveLength(0);
  });

  it("다시 묻기는 이미 나온 질문을 피하게 한다", async () => {
    const ai = scripted({
      text: "그 배치가 멈췄을 때 어떻게 되돌리셨나요?",
      rationale: "운영 경험을 확인합니다.",
    });
    const rewritten = await new AiQuestionWriter(ai).rewrite({
      option: options[0]!,
      previousTexts: ["Airflow로 어떤 배치를 돌려 보셨나요?"],
      company: context.company,
      jobTitle: context.jobTitle,
    });

    expect(ai.calls[0]?.system).toContain("다른 각도에서");
    expect(ai.calls[0]?.prompt).toContain("Airflow로 어떤 배치를 돌려 보셨나요?");
    expect(rewritten.text).toContain("어떻게");
  });

  it("다시 묻기도 질문 규칙은 그 문장만 고쳐 받는다", async () => {
    const ai = scripted(
      { text: "Airflow를 써 보셨나요?", rationale: "운영 경험을 확인합니다." },
      () => [{ path: "/text", value: "Airflow 배치가 실패했을 때 어떻게 다시 돌리셨나요?" }],
    );
    const rewritten = await new AiQuestionWriter(ai).rewrite({
      option: options[0]!,
      previousTexts: ["Airflow로 어떤 배치를 돌려 보셨나요?"],
      company: context.company,
      jobTitle: context.jobTitle,
    });

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/text"]]);
    expect(rewritten.text).toContain("어떻게");
  });

  it("언급 횟수는 세는 것이지 짐작하는 것이 아니다", () => {
    const raw = "Airflow 기반 배치 개발. Airflow 운영 경험 우대. airflow DAG 관리.";
    expect(countMentions("Airflow 배치 파이프라인", raw)).toEqual({ term: "Airflow", count: 3 });
    // 라벨에서 가장 긴 낱말을 고른다.
    expect(countMentions("데이터 정합성 보장", "데이터 정합성 보장이 중요합니다.")?.term).toBe("정합성");
    expect(countMentions("Kafka", "이 공고에는 없는 말")).toBeNull();
  });
});
