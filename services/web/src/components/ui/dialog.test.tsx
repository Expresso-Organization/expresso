// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import styles from "./dialog.module.css";

describe("Dialog", () => {
  afterEach(cleanup);

  it("draws every part with the module classes instead of Tailwind utilities", () => {
    render(<Dialog open><DialogContent className="caller"><DialogHeader><DialogTitle>제목</DialogTitle><DialogDescription>설명</DialogDescription></DialogHeader><DialogFooter>바닥</DialogFooter></DialogContent></Dialog>);
    const content = screen.getByRole("dialog");
    // 기본 모양 클래스 위에 부르는 쪽 클래스가 함께 붙는다.
    expect(content.className.split(" ")).toEqual(expect.arrayContaining([styles.content, "caller"]));
    expect(content.className).not.toMatch(/\bfixed\b|translate|rounded-xl/);
    expect(document.querySelector("[data-slot=dialog-overlay]")?.className).toBe(styles.overlay);
    expect(screen.getByRole("heading", { name: "제목" }).className).toBe(styles.title);
    expect(screen.getByText("설명").className).toBe(styles.description);
    expect(document.querySelector("[data-slot=dialog-header]")?.className).toBe(styles.header);
    expect(document.querySelector("[data-slot=dialog-footer]")?.className).toBe(styles.footer);
  });

  it("names the close button for screen readers without visible English text", () => {
    render(<Dialog open><DialogContent><DialogTitle>제목</DialogTitle></DialogContent></Dialog>);
    const close = screen.getByRole("button", { name: "닫기" });
    expect(close.className).toBe(styles.close);
    expect(close.textContent).toBe("");
  });

  it("leaves the close button out when asked", () => {
    render(<Dialog open><DialogContent showCloseButton={false}><DialogTitle>제목</DialogTitle></DialogContent></Dialog>);
    expect(screen.queryByRole("button", { name: "닫기" })).toBeNull();
  });
});
