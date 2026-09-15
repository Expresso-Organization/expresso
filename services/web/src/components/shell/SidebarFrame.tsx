"use client";

import type { ReactNode } from "react";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

import { useSidebarCollapse } from "./SidebarCollapse";
import styles from "./Sidebar.module.css";

/**
 * 사이드바의 껍데기 — 내용은 부르는 쪽이 채운다.
 *
 * 접힘은 **폭만** 줄인다. 안쪽 패널은 250px에 고정되어 있고 바깥이 그것을
 * 잘라 낸다. 폭이 줄 때마다 내용이 다시 흐르면 글자가 줄바꿈되었다가
 * 사라지는 장면이 그대로 보인다.
 *
 * `Sidebar`와 `SidebarSkeleton`이 같은 틀을 쓴다 — 응답을 기다리는 동안에도
 * 접힘 상태와 브랜드 줄은 이미 정해져 있다.
 */
export function SidebarFrame({
  footer,
  children,
  title,
  label = "사이드바",
  className = "",
  collapsedChildren,
}: {
  title?: string;
  label?: string;
  className?: string | undefined;
  collapsedChildren?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { collapsed, animated, setCollapsed } = useSidebarCollapse();

  return (
    <aside
      className={`${styles.sidebar} ${animated ? styles.sidebarAnimated : ""} ${className}`}
      data-sidebar-collapsed={collapsed}
      aria-label={label}
    >
      <div className={styles.panel} data-slot="sidebar-panel">
        <div className={styles.head}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <LogoMark size={22} />
            </span>
            <span className={`${styles.copy} ${styles.brandName}`}>
              {title ?? <Wordmark />}
            </span>
          </div>

          {/*
            접기와 펴기는 한 자리를 나눠 쓴다 — 접으면 로고가 물러난 자리에
            펴기가 들어선다. 둘 다 DOM에 남는 이유는 전환이다. 대신 지금
            보이지 않는 쪽은 보조 기술과 탭 순서에서 빼 둔다.
          */}
          <button
            type="button"
            className={styles.collapseControl}
            aria-label={`${label} 접기`}
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={() => setCollapsed(true)}
          >
            <Icon name="sidebar-simple" size={17} />
          </button>
          <button
            type="button"
            className={styles.expandControl}
            aria-label={`${label} 펼치기`}
            aria-hidden={!collapsed}
            tabIndex={collapsed ? 0 : -1}
            onClick={() => setCollapsed(false)}
          >
            <Icon name="sidebar-simple" size={17} />
          </button>
        </div>

        <div className={styles.scroll} data-slot="sidebar-scroll">{collapsed && collapsedChildren ? collapsedChildren : children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </aside>
  );
}
