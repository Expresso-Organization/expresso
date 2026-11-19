/**
 * 사이드바 묶음 접힘을 저장하는 자리와, 첫 페인트 전에 그것을 적용하는 스크립트.
 *
 * `SidebarGroup`은 클라이언트 부품이라 저장값을 하이드레이션 뒤에야 읽는다. 서버가 보낸
 * HTML은 언제나 펼친 묶음이므로, 그대로 두면 접어 둔 사람은 새로고침할 때마다 묶음이
 * 펼쳐졌다 접히는 한 프레임을 본다 — 그 아래 묶음까지 함께 흔들린다. 그래서 `<head>`에서
 * 저장값을 읽어, 하이드레이션 전(`data-animated="false"`)에만 걸리는 규칙을 붙인다.
 * 하이드레이션이 끝나면 부품의 `data-open`이 같은 모습을 이어받는다.
 *
 * 루트 레이아웃(서버)이 이 상수를 읽으므로 `"use client"` 파일에 두지 않는다.
 * 고른 지면 밝기(`lib/theme.ts`의 `THEME_BOOTSTRAP`)와 같은 방식이다.
 */

export const SIDEBAR_GROUP_STORAGE_PREFIX = "ex.sidebar.group.";

export const SIDEBAR_GROUPS_BOOTSTRAP = `(function(){try{var p=${JSON.stringify(SIDEBAR_GROUP_STORAGE_PREFIX)},c=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(p)===0&&localStorage.getItem(k)==="closed"){var id=k.slice(p.length);if(/^[a-z-]+$/.test(id))c.push(id);}}if(!c.length)return;var s=document.createElement("style");s.textContent=c.map(function(id){var g='[data-sidebar-group="'+id+'"][data-animated="false"] ';return g+'[data-sidebar-group-body]{grid-template-rows:0fr;visibility:hidden}'+g+'[data-sidebar-group-caret]{opacity:1;transform:rotate(-90deg)}';}).join("");document.head.appendChild(s);}catch(e){}})();`;
