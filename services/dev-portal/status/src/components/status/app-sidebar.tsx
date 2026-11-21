import {
  ActivityIcon,
  GitPullRequestIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  ListChecksIcon,
  ListTodoIcon,
  NotebookTextIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ago, type Data } from "@/lib/data"
import type { Page } from "@/lib/route"

// 맨 위 화면 둘. 진행 현황을 열면 패치노트가 먼저 선택된다(lib/route.ts).
const PAGES: Array<{ id: Page; label: string; icon: typeof NotebookTextIcon }> = [
  { id: "notes", label: "패치노트", icon: NotebookTextIcon },
  { id: "dashboard", label: "대시보드", icon: LayoutDashboardIcon },
]

const SECTIONS = [
  { id: "todos", label: "할 일", icon: ListTodoIcon },
  { id: "scope", label: "작업 범위", icon: LayoutGridIcon },
  { id: "progress", label: "도메인 진척", icon: TrendingUpIcon },
  { id: "activity", label: "활동 · CI", icon: ActivityIcon },
  { id: "list", label: "목록", icon: ListChecksIcon },
]

export function AppSidebar({
  data,
  page,
  member,
  onMember,
  onPage,
}: {
  data: Data
  page: Page
  member: string | null
  onMember: (member: string | null) => void
  onPage: (page: Page) => void
}) {
  const { report } = data
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => onPage("notes")}>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-brand text-sm text-primary-foreground">
                Ex
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-semibold">진행 현황</span>
                <span className="text-xs text-muted-foreground">스캔 {ago(report.generatedAt)}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PAGES.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton isActive={page === p.id} onClick={() => onPage(p.id)}>
                    <p.icon />
                    <span>{p.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>
            <UsersIcon className="mr-1.5" />
            팀원 · 할 일
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={page === "dashboard" && member === null} onClick={() => onMember(null)}>
                  <span>팀 전체</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {report.members.map((m) => (
                <SidebarMenuItem key={m.name}>
                  <SidebarMenuButton isActive={page === "dashboard" && member === m.name} onClick={() => onMember(m.name)}>
                    <span>{m.name}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="tabular-nums">{m.todos.length}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>바로가기</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SECTIONS.map((s) => (
                <SidebarMenuItem key={s.id}>
                  <SidebarMenuButton render={<a href={`#${s.id}`} />} onClick={() => onPage("dashboard")}>
                    <s.icon />
                    <span>{s.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton render={<a href={`https://github.com/${report.repo}/pulls`} target="_blank" rel="noopener noreferrer" />}>
                  <GitPullRequestIcon />
                  <span>GitHub PR</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="text-xs text-muted-foreground">
        <span>판정 {ago(report.scan.judgedAt)} · 전체 {ago(report.scan.fullAt)}</span>
        <span className="font-mono">main {report.main.commit}</span>
      </SidebarFooter>
    </Sidebar>
  )
}
