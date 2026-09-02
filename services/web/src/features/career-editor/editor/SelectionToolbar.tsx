"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./CareerDocumentEditor.module.css";

const AI_ACTIONS = [
  { label: "더 구체적으로", icon: "target", prompt: "선택한 내용을 확인된 사실 범위에서 더 구체적으로 정리해 주세요." },
  { label: "문장 다듬기", icon: "sparkle", prompt: "선택한 문장을 의미를 유지하면서 자연스럽고 명확하게 다듬어 주세요." },
  { label: "짧게", icon: "arrows-in-line-horizontal", prompt: "선택한 내용을 핵심 정보가 남도록 짧게 정리해 주세요." },
  { label: "톤 정돈", icon: "sliders-horizontal", prompt: "선택한 문장을 차분하고 전문적인 커리어 기록 문체로 정돈해 주세요." },
  { label: "문법 확인", icon: "check-circle", prompt: "선택한 문장의 맞춤법과 문법을 확인하고 필요한 부분만 수정해 주세요." },
] as const;

export function SelectionToolbar({ editor, onAiRequest }: { editor: Editor; onAiRequest?(prompt: string, blockIds: string[]): void }) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSelectionIds, setAiSelectionIds] = useState<string[]>([]);
  const hasSelection = useEditorState({ editor, selector: ({ editor: current }) => !current.state.selection.empty });
  const captureSelection = () => {
    const ids = new Set<string>();
    const { from, to } = editor.state.selection;
    editor.state.doc.nodesBetween(from, to, (node) => { if (typeof node.attrs.careerId === "string") ids.add(node.attrs.careerId); });
    return [...ids];
  };
  const action = (label: string, icon: string, active: boolean, run: () => void) => (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onMouseDown={(event) => event.preventDefault()} onClick={run} className={styles.formatButton}>
      <Icon name={icon} weight={active ? "bold" : "regular"} size={15} />
    </button>
  );
  return <div className={styles.selectionArea}>
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
      <div className={styles.aiSelection} role="toolbar" aria-label="선택 영역 AI 편집">
        <button type="button" className={styles.aiSelectionToggle} disabled={!hasSelection && !aiOpen} aria-expanded={aiOpen} title={hasSelection ? "선택 영역을 AI로 다듬기" : "본문을 선택하면 사용할 수 있습니다"} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (aiOpen) { setAiOpen(false); return; } const ids = captureSelection(); setAiSelectionIds(ids); setAiOpen(ids.length > 0); }}><Icon name="sparkle" size={14} />AI 편집</button>
        {aiOpen ? <div className={styles.aiSelectionActions}>{AI_ACTIONS.map((item) => <button key={item.label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onAiRequest?.(item.prompt, aiSelectionIds); setAiOpen(false); }}><Icon name={item.icon} size={13} />{item.label}</button>)}</div> : null}
      </div>
    </div>;
}
