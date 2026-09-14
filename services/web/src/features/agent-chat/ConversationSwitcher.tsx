"use client";
import { useRef, useState } from "react";
import type { AgentConversation } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResourceList } from "./ResourceList";
import { SidebarFrame } from "@/components/shell/SidebarFrame";
import { SidebarCollapseProvider, useSidebarCollapse } from "@/components/shell/SidebarCollapse";
import { GlideMenu } from "@/components/ui/GlideMenu";
import sidebar from "@/components/shell/Sidebar.module.css";
import type { ReactNode } from "react";
import styles from "./AgentChat.module.css";

type Summary = Omit<AgentConversation, "messages">;
export function ConversationSwitcher({ currentId, conversations, disabled, onSelect, inline = false }: {
  inline?: boolean; currentId: string | null; conversations: readonly Summary[]; disabled: boolean; onSelect(id: string): void;
}) {
  const [activeTab, setActiveTab] = useState("chats");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const filtered = conversations.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function select(id: string) { onSelect(id); setOpen(false); }
  const content = <>
      <div className={styles.search}><Icon name="magnifying-glass" size={16} /><input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="대화 제목으로 검색" aria-label="대화 검색" onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !disabled && filtered[0]) { event.preventDefault(); select(filtered[0].id); } }} /></div>
      <nav className={styles.results} aria-label="대화 검색 결과"><GlideMenu className={sidebar.navGroup}>
        {filtered.map(item => <button key={item.id} title={item.title} data-row className={`${sidebar.row} ${sidebar.portfolioItem} ${styles.sidebarResult} ${currentId === item.id ? sidebar.rowActive : ""}`} disabled={disabled} aria-current={currentId === item.id ? "page" : undefined} onClick={() => select(item.id)}>
          <Icon name="chat-teardrop-text" size={16} /><span><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{item.contexts.length ? ` · 자료 ${item.contexts.length}개` : ""}</small></span>{currentId === item.id ? <Icon name="check" size={15} /> : null}
        </button>)}
        {!filtered.length ? <p className={styles.noResults}>{query.trim() ? "일치하는 대화가 없습니다." : "아직 저장된 대화가 없습니다."}</p> : null}
      </GlideMenu></nav>
  </>;
  const browser = <Tabs value={activeTab} onValueChange={setActiveTab} className={styles.browserTabs}>
    <TabsList variant="line" className={styles.browserTabList} aria-label="목록 종류">
      {RAIL_ITEMS.map(item => <TabsTrigger key={item.value} value={item.value} aria-label={item.label} title={item.label}><Icon name={item.icon} size={18} weight={activeTab === item.value ? "fill" : "regular"} /></TabsTrigger>)}
      <span aria-hidden="true" className={styles.tabIndicator} style={{ transform: `translateX(${RAIL_ITEMS.findIndex(item => item.value === activeTab) * 100}%)` }} />
    </TabsList>
    <TabsContent value="chats" className={styles.browserContent}><h2>최근 대화 <span>{conversations.length}</span></h2>{content}</TabsContent>
    <TabsContent value="records" className={styles.browserContent}><ResourceList kind="records" chatId={currentId} /></TabsContent>
    <TabsContent value="jobs" className={styles.browserContent}><ResourceList kind="jobs" chatId={currentId} /></TabsContent>
    <TabsContent value="portfolios" className={styles.browserContent}><ResourceList kind="portfolios" chatId={currentId} /></TabsContent>
  </Tabs>;
  if (inline) return <SidebarCollapseProvider storageKey="ex.agent.resources.collapsed"><ResourceSidebar activeTab={activeTab} onTab={setActiveTab}>{browser}</ResourceSidebar></SidebarCollapseProvider>;
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setQuery(""); }}>
    <PopoverTrigger className={styles.titleTrigger} disabled={disabled} aria-label="대화와 자료 목록 열기" title="대화와 자료 목록"><Icon name="list" size={18} /></PopoverTrigger>
    <PopoverContent className={`acf-scope ${styles.switcher}`} align="end" sideOffset={10} initialFocus={input}>
      <PopoverTitle className={styles.switcherTitle}>대화와 자료</PopoverTitle>{browser}
    </PopoverContent>
  </Popover>;
}

const RAIL_ITEMS = [
  { value: "chats", label: "채팅 목록", icon: "chat-circle-dots" },
  { value: "records", label: "커리어 기록 목록", icon: "notebook" },
  { value: "jobs", label: "채용 공고 목록", icon: "target" },
  { value: "portfolios", label: "내 포트폴리오 목록", icon: "browsers" },
];
function ResourceSidebar({ children, activeTab, onTab }: { children: ReactNode; activeTab: string; onTab(value: string): void }) {
  const { setCollapsed } = useSidebarCollapse();
  return <SidebarFrame title="대화와 자료" label="자료 사이드바" className={styles.conversationRail ?? ""} collapsedChildren={
    <GlideMenu className={sidebar.navGroup}>{RAIL_ITEMS.map(item => <button key={item.value} data-row className={`${sidebar.row} ${sidebar.primaryItem} ${activeTab === item.value ? sidebar.rowActive : ""}`} title={item.label} aria-label={item.label} onClick={() => { onTab(item.value); setCollapsed(false); }}><Icon name={item.icon} size={16} /></button>)}</GlideMenu>
  }>{children}</SidebarFrame>;
}
