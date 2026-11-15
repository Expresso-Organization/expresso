import { logoutAction } from "@/app/auth-actions";
import { AppHeader, appShellStyles } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Icon } from "@/components/ui/Icon";


/**
 * 홈의 헤더 — 화면과 `loading.tsx`가 함께 쓴다. 세션이 없어도 그릴 수 있어 기다리는 동안에도 진짜로 선다.
 */
export function HomeHeader() {
  return (
    <AppHeader
      title="홈"
      actions={
        <>
          <SearchAndNotifications />
          <form action={logoutAction}>
            <button
              type="submit"
              className={appShellStyles.iconButton}
              aria-label="로그아웃"
            >
              <Icon name="sign-out" size={17} />
            </button>
          </form>
        </>
      }
    />
  );
}
