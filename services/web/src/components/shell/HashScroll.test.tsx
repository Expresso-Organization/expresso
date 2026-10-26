// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { HashScroll } from "./HashScroll";

const scrollIntoView = vi.fn();
let resize: (() => void) | null = null;
const observed: Element[] = [];
const disconnect = vi.fn();

beforeEach(() => {
  // jsdom에는 레이아웃이 없어 scrollIntoView · ResizeObserver가 없다.
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe(element: Element) { observed.push(element); }
    disconnect() { disconnect(); }
  });
});

afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
  disconnect.mockReset();
  observed.length = 0;
  resize = null;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function page() {
  return (
    <div>
      <section id="ai-chat-settings">AI 채팅</section>
      <section id="ai-consent"><HashScroll id="ai-consent" />AI 사용 동의</section>
    </div>
  );
}

it("주소의 해시가 자기 id면 그려진 뒤 그 구획으로 스크롤한다", () => {
  window.history.replaceState(null, "", "/account#ai-consent");
  render(page());
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
});

it("위쪽 구획의 크기가 바뀌면 다시 맞추고, 사용자가 스크롤하면 멈춘다", () => {
  window.history.replaceState(null, "", "/account#ai-consent");
  render(page());
  expect(observed.map((element) => element.id)).toEqual(["ai-chat-settings", "ai-consent"]);

  resize?.();
  expect(scrollIntoView).toHaveBeenCalledTimes(2);

  window.dispatchEvent(new Event("wheel"));
  expect(disconnect).toHaveBeenCalled();
});

it("해시가 다르면 움직이지 않는다", () => {
  window.history.replaceState(null, "", "/account#ai-chat-settings");
  render(page());
  expect(scrollIntoView).not.toHaveBeenCalled();
});
