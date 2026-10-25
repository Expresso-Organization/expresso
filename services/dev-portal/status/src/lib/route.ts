import { useCallback, useEffect, useState } from "react"

import { STATES, type State } from "./status"

export const TABS = ["overview", "tasks", "ai", "ops", "next"] as const
export type Tab = (typeof TABS)[number]

export type View = {
  tab: Tab
  owner: string | null
  domain: string | null
  state: State | null
  q: string
}

const ROUTE_MESSAGE = "expresso-status-route"

function parse(search: string): View {
  const p = new URLSearchParams(search)
  const tab = p.get("tab")
  const state = p.get("state")
  return {
    tab: TABS.includes(tab as Tab) ? (tab as Tab) : "overview",
    owner: p.get("owner") || null,
    domain: p.get("domain") || null,
    state: STATES.includes(state as State) ? (state as State) : null,
    q: p.get("q") ?? "",
  }
}

function serialize(view: View): string {
  const p = new URLSearchParams()
  if (view.tab !== "overview") p.set("tab", view.tab)
  if (view.owner) p.set("owner", view.owner)
  if (view.domain) p.set("domain", view.domain)
  if (view.state) p.set("state", view.state)
  if (view.q) p.set("q", view.q)
  return p.toString()
}

// 보고 있는 자리를 주소에 싣습니다. 포털 안에서 열렸으면 포털 주소(#/status?…)도
// 같은 값으로 맞추도록 알립니다 — 그 주소를 보내면 같은 화면이 열립니다.
export function useView() {
  const [view, setViewState] = useState<View>(() => parse(window.location.search))

  useEffect(() => {
    const query = serialize(view)
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`
    window.history.replaceState(null, "", url)
    if (window.parent !== window) {
      window.parent.postMessage({ type: ROUTE_MESSAGE, query }, window.location.origin)
    }
  }, [view])

  const setView = useCallback((patch: Partial<View>) => {
    setViewState((current) => ({ ...current, ...patch }))
  }, [])

  return [view, setView] as const
}
