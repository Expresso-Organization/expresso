// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SidebarGroup } from "./SidebarGroup";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const View = () => (
  <SidebarGroup id="portfolios" label="포트폴리오">
    <a href="/edit/1">첫 포트폴리오</a>
  </SidebarGroup>
);

it("처음에는 펼쳐져 있고 머리말을 누르면 접혀 줄이 포커스에서 빠진다", () => {
  render(<View />);
  const toggle = screen.getByRole("button", { name: /포트폴리오/ });
  const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(body.hasAttribute("inert")).toBe(false);

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(body.hasAttribute("inert")).toBe(true);
  expect(body.contains(screen.getByText("첫 포트폴리오"))).toBe(true);
});

it("접어 둔 묶음은 다시 열어도 접힌 채로 그려진다", () => {
  const first = render(<View />);
  fireEvent.click(screen.getByRole("button", { name: /포트폴리오/ }));
  expect(values.get("ex.sidebar.group.portfolios")).toBe("closed");
  first.unmount();

  render(<View />);
  expect(screen.getByRole("button", { name: /포트폴리오/ }).getAttribute("aria-expanded")).toBe("false");
});

it("저장소를 막아 둔 브라우저에서도 접기는 된다", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  render(<View />);
  const toggle = screen.getByRole("button", { name: /포트폴리오/ });
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
});
