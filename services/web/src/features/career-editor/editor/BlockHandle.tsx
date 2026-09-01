"use client";

import type { Editor } from "@tiptap/react";

import styles from "./CareerDocumentEditor.module.css";

export function BlockHandle({ editor }: { editor: Editor }) {
  return (
    <div className={styles.blockHandle} role="toolbar" aria-label="현재 블록">
      <button type="button" className={styles.handleButton} aria-label="블록 위에 문단 추가" onClick={() => editor.chain().focus().insertContentAt(editor.state.selection.$from.before(1), { type: "paragraph", attrs: { careerId: crypto.randomUUID() } }).run()}>＋</button>
      <button type="button" className={styles.handleButton} aria-label="현재 블록 복제" onClick={() => {
        const node = editor.state.selection.$from.parent;
        editor.chain().focus().insertContentAt(editor.state.selection.$from.after(1), node.toJSON()).run();
      }}>복제</button>
      <button type="button" className={styles.handleButton} aria-label="현재 블록 삭제" onClick={() => editor.chain().focus().deleteNode(editor.state.selection.$from.parent.type.name).run()}>삭제</button>
    </div>
  );
}
