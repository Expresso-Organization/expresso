import { useEffect } from "react"

// 포털이 저장하는 테마 설정을 그대로 읽습니다(docs/library/portal-controls.js 와 같은 키).
// 포털은 같은 출처의 다른 창이므로, 거기서 바꾸면 storage 이벤트가 여기로 옵니다.
const THEME_KEY = "expresso_portal_theme_v1"
const MODES = new Set(["light", "dark", "system"])

function readMode(): string {
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return value && MODES.has(value) ? value : "light"
  } catch {
    return "light"
  }
}

export function usePortalTheme() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const mode = readMode()
      document.documentElement.dataset.theme =
        mode === "system" ? (media.matches ? "dark" : "light") : mode
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_KEY) apply()
    }
    apply()
    window.addEventListener("storage", onStorage)
    media.addEventListener("change", apply)
    return () => {
      window.removeEventListener("storage", onStorage)
      media.removeEventListener("change", apply)
    }
  }, [])
}
