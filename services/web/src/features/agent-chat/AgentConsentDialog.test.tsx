// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import { AgentConsentDialog } from "./AgentConsentDialog";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("모달 표시와 나중에 선택은 동의를 저장하지 않는다", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const close = vi.fn(); const consented = vi.fn();
  render(<AgentConsentDialog open onOpenChange={close} onConsented={consented} />);
  fireEvent.click(screen.getByText("나중에"));
  expect(close).toHaveBeenCalledWith(false); expect(fetcher).not.toHaveBeenCalled(); expect(consented).not.toHaveBeenCalled();
});
it("저장 실패 시 모달을 닫거나 채팅 잠금을 해제하지 않는다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "다시 시도" } }, { status: 502 })));
  const close = vi.fn(); const consented = vi.fn();
  render(<AgentConsentDialog open onOpenChange={close} onConsented={consented} />);
  fireEvent.click(screen.getByText("동의하고 시작"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("다시 시도"));
  expect(close).not.toHaveBeenCalled(); expect(consented).not.toHaveBeenCalled();
});
