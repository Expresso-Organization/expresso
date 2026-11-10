// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useShortcutLabel } from "./use-shortcut-label";

function Label() {
  return <span data-testid="label">{useShortcutLabel("K")}</span>;
}

function stubPlatform(platform: string, userAgentData?: { platform: string }) {
  vi.stubGlobal("navigator", { platform, userAgentData });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useShortcutLabel", () => {
  it("맥에서는 ⌘로 그린다", () => {
    stubPlatform("MacIntel");
    render(<Label />);
    expect(screen.getByTestId("label").textContent).toBe("⌘K");
  });

  it("윈도우에서는 Ctrl+로 그린다", () => {
    stubPlatform("Win32");
    render(<Label />);
    expect(screen.getByTestId("label").textContent).toBe("Ctrl+K");
  });

  it("userAgentData.platform이 있으면 navigator.platform보다 먼저 쓴다", () => {
    stubPlatform("", { platform: "Windows" });
    render(<Label />);
    expect(screen.getByTestId("label").textContent).toBe("Ctrl+K");
  });

  it("서버 렌더는 플랫폼을 몰라 ⌘로 그린다", () => {
    expect(renderToString(<Label />)).toContain("⌘K");
  });
});
