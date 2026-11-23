// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentConversation } from "@expresso/contracts";
import { BrewProgress } from "./BrewProgress";
afterEach(cleanup);
it("인터뷰에서 최신 위치의 버튼으로 디자인을 열고 실패 후 다시 시도할 수 있다", async () => {
  const brewId = "00000000-0000-4000-8000-000000000001";
  const conversation = { messages: [{ tools: [{ brewInterview: { brewId, jobPostingId: null } }] }] } as unknown as AgentConversation;
  const onDesign = vi.fn().mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValue(undefined);
  render(<BrewProgress conversation={conversation} disabled={false} onInterview={vi.fn()} onDesign={onDesign} onResume={vi.fn()} />);
  const button = screen.getByRole("button", { name: "디자인으로 넘어가기" });
  fireEvent.click(button); expect(await screen.findByRole("alert")).toHaveProperty("textContent", "저장 실패");
  fireEvent.click(button); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull()); expect(onDesign).toHaveBeenCalledTimes(2);
});
