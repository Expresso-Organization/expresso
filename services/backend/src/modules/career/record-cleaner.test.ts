import type { RecordCleanup } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { AiError, type AiFix } from "../../platform/ai/client.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import {
  AiRecordCleaner,
  cleanupChangedFields,
  cleanupViolations,
  type CleanupContext,
} from "./record-cleaner.js";

const context: CleanupContext = {
  question: "정산 스케줄러를 재설계하면서 어떤 문제를 푸셨나요?",
  transcript:
    "매일 도는 정산 배치가 새벽에 자주 밀렸습니다. 큐 단위로 쪼개고 재시도를 붙여서 일 1,200만 건을 처리하도록 만들었습니다.",
  existing: null,
};

const cleaned: RecordCleanup = {
  title: "정산 배치를 큐 단위로 재설계",
  situation: "매일 도는 정산 배치가 새벽에 자주 밀렸습니다.",
  task: "밀리지 않게 처리 구조를 다시 잡는 일을 맡았습니다.",
  action: "큐 단위로 쪼개고 재시도를 붙였습니다.",
  result: "일 1,200만 건을 처리하도록 만들었습니다.",
  metrics: ["일 1,200만 건"],
  competencies: ["배치 파이프라인 설계", "재처리 설계"],
};

/** 첫 출력은 `reply`, 고치기 요청에는 `fix`가 답한다. 어댑터와 같은 검사 · 고치기 순서를 탄다. */
function scripted(reply: unknown, fix?: (paths: string[]) => AiFix[]) {
  return new ScriptedAiClient(() => {
    if (reply instanceof Error) throw reply;
    return reply;
  }, fix && ((_, paths) => fix(paths)));
}

describe("기록 정리 계약", () => {
  it("질문과 답변을 함께 준다", async () => {
    const ai = scripted(cleaned);
    const result = await new AiRecordCleaner(ai).clean(context);

    expect(ai.calls[0]?.contract).toBe("record_cleanup");
    expect(ai.calls[0]?.prompt).toContain("정산 스케줄러를 재설계하면서");
    expect(ai.calls[0]?.prompt).toContain("일 1,200만 건");
    expect(result.title).toBe("정산 배치를 큐 단위로 재설계");
  });

  it("말하지 않은 수치는 그 칸만 고쳐 받는다", async () => {
    // 답변에는 감소폭이 없다. "40%"는 지어낸 값이다.
    const invented = { ...cleaned, result: "지연을 40% 줄였습니다." };
    expect(cleanupViolations(invented, context.transcript)).toEqual([
      { path: "/result", problem: expect.stringContaining("답변에 없는 수치입니다: 40") },
    ]);

    const ai = scripted(invented, () => [{ path: "/result", value: cleaned.result }]);
    const result = await new AiRecordCleaner(ai).clean(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/result"]]);
    expect(result.result).toBe("일 1,200만 건을 처리하도록 만들었습니다.");
  });

  it("목록 칸은 그 항목 경로로 묻는다", () => {
    const invented = { ...cleaned, metrics: ["일 1,200만 건", "99.9% 가용성"] };
    expect(cleanupViolations(invented, context.transcript).map(({ path }) => path)).toEqual(["/metrics/1"]);
  });

  it("고쳐도 답변에 없는 수치가 남은 칸만 싣지 않고 나머지는 그대로 쓴다", async () => {
    const invented = { ...cleaned, metrics: ["99.9% 가용성"] };
    const ai = scripted(invented);
    const result = await new AiRecordCleaner(ai).clean(context);

    expect(ai.calls).toHaveLength(1);
    // 걸린 칸이 줄지 않으면 한 번 고친 뒤 멈춘다(진전 기준, intent `ai-output-no-cli-rewrite`).
    expect(ai.fixRequests).toHaveLength(1);
    expect(result.metrics).toEqual([]);
    expect(result.title).toBe(cleaned.title);
  });

  it("고쳐 쓴 답변은 기존 기록을 함께 본다", async () => {
    const ai = scripted(cleaned);
    await new AiRecordCleaner(ai).clean({
      ...context,
      existing: { title: "정산 배치", bodyMd: "앞서 적은 내용입니다." },
    });
    expect(ai.calls[0]?.prompt).toContain("이미 있던 기록");
    expect(ai.calls[0]?.prompt).toContain("앞서 적은 내용입니다.");
  });

  it("정리는 제목과 역량만 바꾼 칸으로 적는다", () => {
    // STAR와 수치는 속성으로 만들지 않는다. 역량을 쓰지 못했으면 변경 칸에도 없다.
    expect(cleanupChangedFields(true)).toEqual(["title", "body_md", "competencies"]);
    expect(cleanupChangedFields(false)).toEqual(["title", "body_md"]);
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "record_cleanup", "usage limit", { retryable: false });
    const ai = scripted(limited);
    await expect(new AiRecordCleaner(ai).clean(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });
});
