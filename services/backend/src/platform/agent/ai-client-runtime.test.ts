import { describe, expect, it, vi } from "vitest";
import type { AiClient, AiCallSpec } from "../ai/client.js";
import type { AgentInput } from "./runtime.js";
import { AiClientAgentRuntime } from "./ai-client-runtime.js";

const setup = () => {
  const controller = new AbortController();
  const complete = vi.fn(async (_spec: AiCallSpec, _schema: unknown) => ({ data: { answer: "경험을 정리했습니다.", proposals: [] } }));
  const input: AgentInput = { messages: [], context: [], signal: controller.signal, emit: vi.fn(), propose: vi.fn() };
  return { controller, complete, input, runtime: new AiClientAgentRuntime({ complete } as unknown as AiClient) };
};

describe("Codex 공통 채팅 어댑터", () => {
  it("기존 AI Client만 호출하며 Anthropic 키를 입력에 전달하지 않는다", async () => {
    const { runtime, input, complete } = setup();
    input.apiKey = "sk-ant-unused";
    await runtime.run(input);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ contract: "job_chat" });
    expect(JSON.stringify(complete.mock.calls[0]?.[0])).not.toContain("sk-ant-unused");
    expect(input.emit).toHaveBeenCalledWith({ type: "text", text: "경험을 정리했습니다." });
    expect(input.propose).not.toHaveBeenCalled();
  });

  it("시작 전 취소된 요청은 AI를 호출하지 않는다", async () => {
    const { runtime, input, complete, controller } = setup();
    controller.abort();
    await expect(runtime.run(input)).rejects.toThrow("cancelled");
    expect(complete).not.toHaveBeenCalled();
  });

  it("AI 실행 중 취소하면 늦게 도착한 결과를 저장하지 않는다", async () => {
    const { runtime, input, complete, controller } = setup();
    complete.mockImplementation(async () => {
      controller.abort();
      return { data: { answer: "취소된 답변", proposals: [] } };
    });
    await expect(runtime.run(input)).rejects.toThrow("cancelled");
    expect(input.emit).not.toHaveBeenCalled();
    expect(input.propose).not.toHaveBeenCalled();
  });
});
