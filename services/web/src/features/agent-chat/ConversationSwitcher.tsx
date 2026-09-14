"use client";
import { useRef, useState } from "react";
import type { AgentConversation } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import styles from "./AgentChat.module.css";

type Summary = Omit<AgentConversation, "messages">;
export function ConversationSwitcher({ title, currentId, conversations, disabled, onSelect }: {
  title: string; currentId: string | null; conversations: readonly Summary[]; disabled: boolean; onSelect(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const filtered = conversations.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function select(id: string) { onSelect(id); setOpen(false); }
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setQuery(""); }}>
    <PopoverTrigger className={styles.titleTrigger} disabled={disabled} aria-label={`대화 전환: ${title}`} title="대화 검색 및 전환">
      <strong>{title}</strong><Icon name="caret-down" size={13} />
    </PopoverTrigger>
    <PopoverContent className={`acf-scope ${styles.switcher}`} align="start" sideOffset={10} initialFocus={input}>
      <PopoverTitle className={styles.switcherTitle}>대화 전환</PopoverTitle>
      <div className={styles.search}><Icon name="magnifying-glass" size={16} /><input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="대화 제목으로 검색" aria-label="대화 검색" onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && filtered[0]) { event.preventDefault(); select(filtered[0].id); } }} /></div>
      <nav className={styles.results} aria-label="대화 검색 결과">
        {filtered.map(item => <button key={item.id} className={styles.result} aria-current={currentId === item.id ? "page" : undefined} onClick={() => select(item.id)}>
          <Icon name="chat-teardrop-text" size={16} /><span><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{item.contexts.length ? ` · 자료 ${item.contexts.length}개` : ""}</small></span>{currentId === item.id ? <Icon name="check" size={15} /> : null}
        </button>)}
        {!filtered.length ? <p className={styles.noResults}>{query.trim() ? "일치하는 대화가 없습니다." : "아직 저장된 대화가 없습니다."}</p> : null}
      </nav>
    </PopoverContent>
  </Popover>;
}
