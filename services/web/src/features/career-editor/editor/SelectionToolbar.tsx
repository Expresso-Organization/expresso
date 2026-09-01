"use client";

import type { Editor } from "@tiptap/react";

import { Icon } from "@/components/ui/Icon";

import styles from "./CareerDocumentEditor.module.css";

export function SelectionToolbar({ editor }: { editor: Editor }) {
  const action = (label: string, icon: string, active: boolean, run: () => void) => (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onMouseDown={(event) => event.preventDefault()} onClick={run} className={styles.formatButton}>
      <Icon name={icon} weight={active ? "bold" : "regular"} size={15} />
    </button>
  );
  return (
    <div className={styles.selectionToolbar} role="toolbar" aria-label="텍스트 서식">
      {action("굵게", "text-b", editor.isActive("bold"), () => { editor.chain().focus().toggleBold().run(); })}
      {action("기울임", "text-italic", editor.isActive("italic"), () => { editor.chain().focus().toggleItalic().run(); })}
      {action("취소선", "text-strikethrough", editor.isActive("strike"), () => { editor.chain().focus().toggleStrike().run(); })}
      {action("코드", "code", editor.isActive("code"), () => { editor.chain().focus().toggleCode().run(); })}
      {action("링크", "link-simple", editor.isActive("link"), () => {
        const previous = editor.getAttributes("link").href as string | undefined;
        const href = window.prompt("연결할 주소", previous ?? "https://");
        if (href === null) return;
        if (href.trim() === "") editor.chain().focus().unsetLink().run();
        else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      })}
    </div>
  );
}
