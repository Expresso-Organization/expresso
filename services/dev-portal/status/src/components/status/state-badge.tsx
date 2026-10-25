import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { STATE_HELP, STATE_LABEL, type State } from "@/lib/status"

const VARIANT = {
  done: "success",
  partial: "warning",
  api: "secondary",
  todo: "outline",
} as const

export function StateBadge({ state }: { state: State }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant={VARIANT[state]} />}>{STATE_LABEL[state]}</TooltipTrigger>
      <TooltipContent>{STATE_HELP[state]}</TooltipContent>
    </Tooltip>
  )
}

const PHASE = {
  done: ["success", "끝남"],
  wip: ["warning", "진행 중"],
  pilot: ["warning", "파일럿"],
  todo: ["outline", "시작 전"],
} as const

export function PhaseBadge({ state }: { state: keyof typeof PHASE }) {
  const [variant, label] = PHASE[state]
  return <Badge variant={variant}>{label}</Badge>
}
