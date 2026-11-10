/**
 * 단축키 표시. 키 입력은 `metaKey || ctrlKey`로 두 플랫폼을 모두 받으므로,
 * 여기서는 사용자가 보는 글자만 플랫폼에 맞춘다.
 */

/** 맥·iOS·iPadOS는 ⌘를 쓰고, 나머지는 Ctrl을 쓴다. */
export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** `shortcutLabel("K", true)` → `⌘K`, `shortcutLabel("K", false)` → `Ctrl+K` */
export function shortcutLabel(key: string, apple: boolean): string {
  return apple ? `⌘${key}` : `Ctrl+${key}`;
}
