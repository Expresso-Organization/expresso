import { expect, it } from "vitest";
import type { AgentMessage } from "@expresso/contracts";
import { toThreadMessage } from "./message-view";
function fixture(text = ""): AgentMessage {
 return { id: "answer", role: "assistant", createdAt: "2026-11-11T00:00:00Z", text, tools: [{ id: "read", name: "현재 기록 본문 확인", status: "complete", summary: "현재 기록 1개 확인" }] };
}
it("본문 없이 조회만 완료된 답변도 취소 안내를 표시한다", () => {
 const message = fixture(); const view = toThreadMessage(message, true);
 expect(view.content).toEqual(expect.arrayContaining([{ type: "text", text: "응답을 중지했습니다." }]));
 expect(message.text).toBe(""); expect(message.tools[0]!.status).toBe("complete");
});
it("부분 답변을 보존하고 중지 안내를 덧붙인다", () => {
 const message = fixture("확인한 강점입니다.");
 expect(toThreadMessage(message, true).content).toEqual(expect.arrayContaining([{ type: "text", text: "확인한 강점입니다.\n\n응답을 중지했습니다." }]));
 expect(message.text).toBe("확인한 강점입니다.");
});
it("정상 응답과 사용자 메시지에는 중지 안내를 넣지 않는다", () => {
 expect(toThreadMessage(fixture("정상 응답")).content).toEqual(expect.arrayContaining([{ type: "text", text: "정상 응답" }]));
 const question = { ...fixture("사용자 질문"), role: "user" as const };
 expect(toThreadMessage(question, true).content).toEqual(expect.arrayContaining([{ type: "text", text: "사용자 질문" }]));
});
it("새로고침으로 복원한 답변도 같은 중지 안내를 만든다", () => {
 const restored = JSON.parse(JSON.stringify(fixture())) as AgentMessage;
 expect(toThreadMessage(restored, true)).toEqual(toThreadMessage(fixture(), true));
});
