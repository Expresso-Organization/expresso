import { useCallback, useEffect, useState } from "react"

import { STATES, type State } from "../../shared/report.ts"

// 아래 목록 표의 탭.
export const TABS = ["features", "pulls", "runs", "scans"] as const
export type Tab = (typeof TABS)[number]

export type View = {
  tab: Tab
  member: string | null
  group: string | null
  state: State | null
  changed: boolean
  q: string
}

const ROUTE_MESSAGE = "expresso-status-route"

function parse(search: string): View {
  const p = new URLSearchParams(search)
  const tab = p.get("tab")
  const state = p.get("state")
  return {
    tab: TABS.includes(tab as Tab) ? (tab as Tab) : "features",
    member: p.get("member") || null,
    group: p.get("group") || null,
    state: STATES.includes(state as State) ? (state as State) : null,
    changed: p.get("changed") === "1",
    q: p.get("q") ?? "",
  }
}

function serialize(view: View): string {
  const p = new URLSearchParams()
  if (view.tab !== "features") p.set("tab", view.tab)
  if (view.member) p.set("member", view.member)
  if (view.group) p.set("group", view.group)
  if (view.state) p.set("state", view.state)
  if (view.changed) p.set("changed", "1")
  if (view.q) p.set("q", view.q)
  return p.toString()
}

// 보고 있는 자리를 주소에 싣는다. 포털 안(iframe)에서는 포털 주소(#/status?…)도 맞추도록 알린다.
export function useView() {
  const [view, setViewState] = useState<View>(() => parse(window.location.search))

  useEffect(() => {
    const query = serialize(view)
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`)
    if (window.parent !== window) window.parent.postMessage({ type: ROUTE_MESSAGE, query }, window.location.origin)
  }, [view])

  const setView = useCallback((patch: Partial<View>) => setViewState((current) => ({ ...current, ...patch })), [])
  return [view, setView] as const
}
