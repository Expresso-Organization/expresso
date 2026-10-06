// 포털의 화면 테마와 변경 알림 읽음 상태를 브라우저별로 보관합니다.
window.ExpressoPortalControls = (() => {
  const themeKey = 'expresso_portal_theme_v1';
  const seenKey = 'expresso_portal_seen_changes_v1';
  const modes = new Set(['light', 'dark', 'system']);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const read = key => { try { return window.localStorage.getItem(key); } catch { return null; } };
  let mode = modes.has(read(themeKey)) ? read(themeKey) : 'light';
  const apply = () => { document.documentElement.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode; };
  apply();
  media.addEventListener?.('change', () => { if (mode === 'system') apply(); });
  return {
    getMode: () => mode,
    setMode(value) {
      if (!modes.has(value)) return;
      mode = value;
      try { window.localStorage.setItem(themeKey, value); } catch {}
      apply();
    },
    readSeen() {
      try {
        const parsed = JSON.parse(read(seenKey) || '[]');
        return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
      } catch { return []; }
    },
    writeSeen(ids) {
      try { window.localStorage.setItem(seenKey, JSON.stringify([...new Set(ids)])); } catch {}
    }
  };
})();
