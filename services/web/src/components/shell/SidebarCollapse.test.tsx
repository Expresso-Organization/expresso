// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SidebarCollapseProvider, useSidebarCollapse } from "./SidebarCollapse";
function Control({ name }: { name: string }) { const state = useSidebarCollapse(); return <button onClick={state.toggle}>{name}:{String(state.collapsed)}</button>; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("양쪽 사이드바는 접힘 상태를 독립적으로 저장하고 복원한다", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("matchMedia", () => ({ matches:true, addEventListener:vi.fn(), removeEventListener:vi.fn() }));
  vi.stubGlobal("requestAnimationFrame", () => 1); vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const View = () => <><SidebarCollapseProvider><Control name="left" /></SidebarCollapseProvider><SidebarCollapseProvider storageKey="ex.agent.resources.collapsed"><Control name="right" /></SidebarCollapseProvider></>;
  const view = render(<View />);
  fireEvent.click(screen.getByText("right:false"));
  expect(screen.getByText("left:false")).toBeTruthy();
  expect(localStorage.getItem("ex.agent.resources.collapsed")).toBe("true");
  expect(localStorage.getItem("ex.sidebar.collapsed")).toBeNull();
  view.unmount(); render(<View />);
  expect(screen.getByText("right:true")).toBeTruthy(); expect(screen.getByText("left:false")).toBeTruthy();
});
