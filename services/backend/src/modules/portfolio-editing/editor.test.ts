import { describe, expect, it } from "vitest";

import { AiError, type AiFix } from "../../platform/ai/client.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import {
  AiBlockEditor,
  BlockEditError,
  EDITABLE_PATHS,
  applyPatches,
  blockFields,
  editViolations,
  type EditContext,
} from "./editor.js";

const before =
  "매일 도는 정산 스케줄러를 다시 만들어 일 1,200만 건을 처리하도록 했습니다. 큐로 나눠 처리하는 구조로 바꾸고, 재처리 절차를 문서로 남겼습니다.";

const context: EditContext = {
  instruction: "한 문장으로 줄여 주세요",
  block: { kind: "paragraph", fields: { "content.text": before } },
  section: {
    title: "대용량 정산 스케줄러 재설계",
    purpose: "처리 구조를 다시 설계할 수 있는 사람임을 남긴다",
    goal: "공고의 대규모 처리 요구에 답한다",
    tone: "담백한 존댓말",
    exclude: ["업계 최고"],
  },
  sourceText: "매일 도는 정산 스케줄러를 다시 만들었습니다. 일 1,200만 건을 처리합니다.",
};

const shortened = {
  patches: [{
    path: "content.text",
    before,
    after: "정산 스케줄러를 큐 단위로 다시 설계해 일 1,200만 건을 처리하도록 했습니다.",
    label: "두 문장을 한 문장으로 합쳤습니다",
  }],
};

/** 첫 출력은 `reply`, 고치기 요청에는 `fix`가 답한다. 어댑터와 같은 검사 · 고치기 순서를 탄다. */
function scripted(reply: unknown, fix?: (paths: string[]) => AiFix[]) {
  return new ScriptedAiClient(() => {
    if (reply instanceof Error) throw reply;
    return reply;
  }, fix && ((_, paths) => fix(paths)));
}

const paragraphPaths = EDITABLE_PATHS["paragraph"]!;

describe("부분 편집 계약", () => {
  it("지시 · 섹션 컨텍스트 · 고칠 수 있는 자리를 준다", async () => {
    const ai = scripted(shortened);
    const patches = await new AiBlockEditor(ai).edit(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("partial_edit");
    expect(prompt).toContain("지시: 한 문장으로 줄여 주세요");
    expect(prompt).toContain("쓰면 안 되는 말: 업계 최고");
    expect(prompt).toContain("고칠 수 있는 자리: content.text");
    expect(patches[0]?.label).toBe("두 문장을 한 문장으로 합쳤습니다");
  });

  it("없던 수치를 붙이면 그 patch의 글만 고쳐 받는다", async () => {
    const invented = {
      patches: [{
        ...shortened.patches[0]!,
        after: "정산 스케줄러를 다시 설계해 지연을 30% 줄였습니다.",
      }],
    };
    expect(editViolations(invented.patches, context, paragraphPaths)).toEqual([
      { path: "/patches/0/after", problem: expect.stringContaining("글에 없던 수치입니다: 30") },
    ]);

    const ai = scripted(invented, () => [{ path: "/patches/0/after", value: shortened.patches[0]!.after }]);
    const patches = await new AiBlockEditor(ai).edit(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/patches/0/after"]]);
    expect(patches[0]?.after).toBe(shortened.patches[0]!.after);
  });

  it("고쳐도 남은 수치 · 금지어는 제안 그대로 둔다", async () => {
    const banned = {
      patches: [{ ...shortened.patches[0]!, after: "업계 최고의 정산 스케줄러를 만들었습니다." }],
    };
    expect(editViolations(banned.patches, context, paragraphPaths)).toEqual([
      { path: "/patches/0/after", problem: expect.stringContaining("쓰지 않기로 한 말") },
    ]);
    const ai = scripted(banned);
    const patches = await new AiBlockEditor(ai).edit(context);

    expect(ai.calls).toHaveLength(1);
    // 걸린 칸이 줄지 않으면 한 번 고친 뒤 멈춘다(진전 기준, intent `ai-output-no-cli-rewrite`).
    expect(ai.fixRequests).toHaveLength(1);
    expect(patches[0]?.after).toBe(banned.patches[0]!.after);
  });

  it("없는 자리 patch는 그 patch를 고쳐 받고, 남으면 편집을 만들 수 없다", async () => {
    const stray = {
      patches: [{ path: "content.value", before: "", after: "24분", label: "수치 추가" }],
    };
    expect(editViolations(stray.patches, context, paragraphPaths).map(({ path }) => path)).toContain("/patches/0");

    const fixed = scripted(stray, (paths) => paths.includes("/patches") ? [{ path: "/patches", value: shortened.patches }] : [{ path: "/patches/0", value: shortened.patches[0] }]);
    expect((await new AiBlockEditor(fixed).edit(context))[0]?.path).toBe("content.text");
    expect(fixed.calls).toHaveLength(1);

    const ai = scripted(stray);
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(/고칠 수 있는 자리가 아닙니다/);
    expect(ai.calls).toHaveLength(1);
  });

  it("같은 자리를 두 번 고치면 두 번째 patch를 묻는다", () => {
    const doubled = { patches: [shortened.patches[0]!, { ...shortened.patches[0]!, after: "다른 문장입니다." }] };
    expect(editViolations(doubled.patches, context, paragraphPaths)).toEqual([
      { path: "/patches/1", problem: expect.stringContaining("두 번 고쳤습니다") },
    ]);
  });

  it("아무것도 안 바뀌면 목록 전체를 묻고, 남으면 변경이 아니다", async () => {
    const same = { patches: [{ ...shortened.patches[0]!, after: before }] };
    expect(editViolations(same.patches, context, paragraphPaths)).toEqual([
      { path: "/patches", problem: expect.stringContaining("바뀐 것이 없습니다") },
    ]);
    const ai = scripted(same);
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(/바뀐 것이 없습니다/);
    expect(ai.calls).toHaveLength(1);
  });

  it("계약을 고쳐도 못 맞추면 편집 실패로 알린다", async () => {
    const ai = scripted({ patches: [] });
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(BlockEditError);
    expect(ai.calls).toHaveLength(1);
  });

  it("before는 우리가 아는 값으로 덮는다", async () => {
    // 모델이 옮겨 적다 틀리면 변경 요약이 거짓말을 한다.
    const drifted = { patches: [{ ...shortened.patches[0]!, before: "모델이 잘못 옮긴 값" }] };
    const ai = scripted(drifted);
    const patches = await new AiBlockEditor(ai).edit(context);
    expect(patches[0]?.before).toBe(before);
  });

  it("미디어 블록은 말로 고칠 수 없다", async () => {
    const ai = scripted(shortened);
    await expect(new AiBlockEditor(ai).edit({
      ...context, block: { kind: "media", fields: {} },
    })).rejects.toThrow(BlockEditError);
    expect(ai.calls).toHaveLength(0);
  });

  it("수치 블록은 값과 라벨 두 자리를 연다", () => {
    const fields = blockFields("metric", { value: "1,200만 건", label: "일 처리 건수" });
    expect(fields).toEqual({ "content.value": "1,200만 건", "content.label": "일 처리 건수" });
    expect(applyPatches({ value: "1,200만 건", label: "일 처리 건수" }, [
      { path: "content.label", before: "일 처리 건수", after: "하루 처리량", label: "라벨을 줄였습니다" },
    ])).toEqual({ value: "1,200만 건", label: "하루 처리량" });
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "partial_edit", "usage limit", { retryable: false });
    const ai = scripted(limited);
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });
});
