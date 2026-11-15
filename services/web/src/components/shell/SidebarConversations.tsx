"use client";

import { AgentConversationListSchema } from "@expresso/contracts";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { GlideMenu } from "@/components/ui/GlideMenu";
import { Icon } from "@/components/ui/Icon";

import styles from "./Sidebar.module.css";

type Row = { id: string; title: string };

/** 사이드바에 세우는 대화 수. 넘는 대화는 홈의 대화 목록이 보여 준다. */
const SHOWN = 8;

/**
 * 사이드바의 「최근 대화」 묶음. 어느 화면에서든 하던 대화로 돌아가는 자리다.
 *
 * 목록은 에이전트 대화 프록시(`/api/agent/conversations`)가 주는 최근 수정순 그대로다.
 * 대화가 없으면 묶음을 세우지 않는다.
 */
export function SidebarConversations() {
  const [rows, setRows] = useState<Row[]>([]);
  const pathname = usePathname();
  const current = useSearchParams().get("chat");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/agent/conversations", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? AgentConversationListSchema.parse(await response.json()).data : []))
      .then((list) => setRows(list.slice(0, SHOWN).map(({ id, title }) => ({ id, title }))))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  if (rows.length === 0) return null;

  return (
    <>
      <div className={`${styles.groupHead} ${styles.groupHeadFirst}`}>
        <div className={`${styles.copy} ${styles.groupHeadRow}`}>
          <span className={styles.groupLabel}>최근 대화</span>
        </div>
      </div>
      <GlideMenu className={`${styles.conversations} ${styles.navGroup}`}>
        {rows.map((row) => (
          <Link
            key={row.id}
            href={{ pathname: "/home", query: { chat: row.id } }}
            data-row
            title={row.title}
            className={`${styles.row} ${styles.conversationItem} ${current === row.id ? styles.rowActive : ""}`}
            aria-current={current === row.id ? "page" : undefined}
          >
            <span className={styles.rowLead}>
              <Icon name="chat-circle" size={14} color="var(--ex-fg-subtle)" />
            </span>
            <span className={`${styles.copy} ${styles.conversationTitle}`}>{row.title}</span>
          </Link>
        ))}
      </GlideMenu>
    </>
  );
}
