import type { AgentWorkMaterials } from "@expresso/contracts";

/**
 * 작업물 재료를 커리어 기록에 붙이는 일(`intent_work-materials.md`).
 *
 * 받은 그림 · 찍은 사이트 · 레포 요약은 기록 본문의 「작업물」 절에 덧붙인다. 생성은 고른 기록 본문의 `/v1/media/…` 그림을 지면 그림으로
 * 읽으므로(`page/service.ts`) 따로 잇지 않아도 그 기록으로 만든 지면에 실린다. 다음 제작에서도 같은 기록이 그림을 갖고 있다.
 */
export interface AgentWorkDeps {
  /** 그 사용자가 올린 미디어인가. */
  ownsMedia(userId: string, mediaId: string): Promise<boolean>;
  /** 찍은 사이트 그림을 그 사용자의 미디어로 저장한다. */
  uploadImage(userId: string, bytes: Buffer): Promise<{ id: string }>;
  /** 사이트 첫 화면을 찍는다. 사설 주소는 막는다(`platform/browser/site-capture.ts`). */
  capture(url: string): Promise<{ bytes: Buffer; title: string; finalUrl: string }>;
  /** 공개 깃허브 레포를 읽는다(`platform/github/repo-reader.ts`). */
  readRepo(url: string): Promise<unknown>;
}

export const WORK_HEADING = "## 작업물";

/** 마크다운의 대괄호 · 줄바꿈이 글을 깨지 않게 한 줄로 만든다. */
const inline = (text: string) => text.replace(/[\r\n]+/g, " ").replace(/[[\]]/g, "").trim();

/** 붙일 항목 하나를 본문 줄로 편다. */
export function workLines(item: AgentWorkMaterials["items"][number]): string[] {
  const caption = inline(item.caption);
  if (item.kind === "image") return [`![${caption}](${item.src})`];
  if (item.kind === "site") return [`![${caption}](${item.src})`, `[사이트 열기](${item.url}) — ${caption}`];
  return [`[저장소 ${inline(item.url!.replace(/^https?:\/\/(www\.)?github\.com\//, ""))}](${item.url}) — ${caption}`];
}

/**
 * 본문의 「작업물」 절 끝에 줄을 덧붙인다. 절이 없으면 본문 끝에 새로 만든다. 앞선 줄은 건드리지 않는다.
 * 절은 `## 작업물` 줄부터 다음 `## ` 머리줄(또는 본문 끝)까지다.
 */
export function appendWorkMaterials(bodyMd: string, items: AgentWorkMaterials["items"]): string {
  const added = items.flatMap((item) => [...workLines(item), ""]).join("\n").trimEnd();
  const lines = bodyMd.replace(/\s+$/, "").split("\n");
  const start = lines.findIndex((line) => line.trim() === WORK_HEADING);
  if (start < 0) return `${lines.join("\n")}${bodyMd.trim() ? "\n\n" : ""}${WORK_HEADING}\n\n${added}\n`;
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const end = next < 0 ? lines.length : next;
  const section = lines.slice(start, end).join("\n").trimEnd();
  const rest = lines.slice(end).join("\n");
  return `${[...lines.slice(0, start)].join("\n")}${start ? "\n" : ""}${section}\n\n${added}\n${rest ? `\n${rest}\n` : ""}`;
}
