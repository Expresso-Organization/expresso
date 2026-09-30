import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { AgentChat } from "@/features/agent-chat/AgentChat";
import { requireSession } from "@/lib/require-session";
export default async function Page() { await requireSession(); return <><AppHeader title="에이전트 채팅" /><AppBody><AgentChat standalone /></AppBody></>; }
