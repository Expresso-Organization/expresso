import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { STATE_LABEL, type State } from "@/lib/data"

const VARIANT = {
  done: "success",
  partial: "warning",
  api: "secondary",
  todo: "outline",
} as const

export function StateBadge({ state, change }: { state: State | null; change?: "up" | "down" | null }) {
  if (!state) return <Badge variant="ghost">판정 전</Badge>
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={VARIANT[state]}>{STATE_LABEL[state]}</Badge>
      {change === "up" && <ArrowUpIcon className="size-3.5 text-success" aria-label="직전 판정보다 나아짐" />}
      {change === "down" && <ArrowDownIcon className="size-3.5 text-destructive" aria-label="직전 판정보다 나빠짐" />}
    </span>
  )
}

// 차트 · 막대 · 범례가 판정마다 같은 색을 쓴다(src/index.css 의 --viz-*).
export const STATE_COLOR: Record<State, string> = {
  done: "var(--color-chart-1)",
  partial: "var(--color-chart-2)",
  api: "var(--color-chart-3)",
  todo: "var(--color-chart-4)",
}

export const STATE_CHART = {
  done: { label: STATE_LABEL.done, color: STATE_COLOR.done },
  partial: { label: STATE_LABEL.partial, color: STATE_COLOR.partial },
  api: { label: STATE_LABEL.api, color: STATE_COLOR.api },
  todo: { label: STATE_LABEL.todo, color: STATE_COLOR.todo },
}
