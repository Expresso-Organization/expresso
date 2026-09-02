"use client";

import type { Editor } from "@tiptap/react";
import { useRef } from "react";

import styles from "./CareerDocumentEditor.module.css";

const commands = [
  { label: "본문", hint: "기본 문단", run: (editor: Editor) => editor.chain().focus().setParagraph().run() },
  { label: "제목 1", hint: "큰 제목", run: (editor: Editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "글머리 목록", hint: "항목 나열", run: (editor: Editor) => editor.chain().focus().toggleBulletList().run() },
  { label: "번호 목록", hint: "순서가 있는 항목", run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run() },
  { label: "할 일", hint: "완료 상태 표시", run: (editor: Editor) => editor.chain().focus().toggleTaskList().run() },
  { label: "인용", hint: "강조할 문장", run: (editor: Editor) => editor.chain().focus().toggleBlockquote().run() },
  { label: "코드", hint: "코드 블록", run: (editor: Editor) => editor.chain().focus().toggleCodeBlock().run() },
  { label: "구분선", hint: "내용 구분", run: (editor: Editor) => editor.chain().focus().setHorizontalRule().run() },
  { label: "표", hint: "3 × 3 표", run: (editor: Editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
] as const;

export function SlashMenu({ editor, open, onClose }: { editor: Editor; open: boolean; onClose(): void }) {
  const menu = useRef<HTMLDivElement>(null);
  if (!open) return null;
  return (
    <div
      ref={menu}
      className={styles.slashMenu}
      role="menu"
      aria-label="블록 명령"
      onKeyDown={(event) => {
        const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape") { event.preventDefault(); onClose(); editor.commands.focus(); }
        if (event.key === "ArrowDown") { event.preventDefault(); items[(current + 1 + items.length) % items.length]?.focus(); }
        if (event.key === "ArrowUp") { event.preventDefault(); items[(current - 1 + items.length) % items.length]?.focus(); }
      }}
    >
      <div className={styles.menuHeading}>블록 추가</div>
      {commands.map((command, index) => (
        <button
          key={command.label}
          type="button"
          role="menuitem"
          autoFocus={index === 0}
          className={styles.menuItem}
          onClick={() => { command.run(editor); onClose(); }}
        >
          <span>{command.label}</span>
          <span className={styles.menuHint}>{command.hint}</span>
        </button>
      ))}
    </div>
  );
}
