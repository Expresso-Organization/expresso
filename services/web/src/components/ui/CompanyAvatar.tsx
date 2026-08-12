import { API_BASE_URL } from "@/lib/api/client";

/**
 * 회사 자리에 서는 동그라미.
 *
 * 로고를 받아 둔 회사는 로고가, 못 받아 둔 회사는 지금까지처럼 이름 첫 글자가
 * 선다. **자리와 크기는 부르는 쪽이 정한다** — 06 목록은 30px, 06b 상세와
 * 사이드바는 저마다 다른 값을 쓰고 있고, 그 규칙을 여기로 가져오면 화면마다
 * 예외가 하나씩 붙는다. 그래서 `className`을 그대로 받아 쓴다.
 *
 * 로고는 **우리 주소에서** 온다. 회사 서버를 직접 링크하면 보는 사람의 IP가 그
 * 회사로 가고, 상대가 경로를 바꾸면 화면이 조용히 깨진다.
 */
export function CompanyAvatar({
  company,
  className,
  fit = "box",
}: {
  company: {
    name: string;
    initial?: string | null;
    avatarBackground?: string | null;
    avatarColor?: string | null;
    logoUrl?: string | null;
  };
  className?: string | undefined;
  /**
   * `box`는 정사각 안에 맞춰 넣는다. 칸이 줄지어 서는 자리(06 목록 · 사이드바)는
   * 이쪽이어야 한다 — 회사마다 폭이 달라지면 옆의 제목이 들쭉날쭉해진다.
   *
   * `line`은 높이만 맞추고 폭은 그림에 맡긴다. **워드마크를 쓰는 회사** 때문에
   * 있다 — 쿠팡의 마크는 가로세로 4.3:1이라 정사각에 넣으면 18px 칸에서 높이가
   * 4px밖에 안 남는다. 06b 회사 줄처럼 옆으로 자리가 남는 곳에서만 쓴다.
   */
  fit?: "box" | "line";
}) {
  if (company.logoUrl) {
    return (
      <span className={className} style={{ background: "transparent", padding: 0 }}>
        <img
          src={new URL(company.logoUrl, API_BASE_URL).href}
          // 회사 이름이 바로 옆에 적혀 있다. 여기까지 읽어 주면 두 번 읽는다.
          alt=""
          width={64}
          height={64}
          style={
            fit === "line"
              // 높이는 칸이 잡고 폭은 그림이 정한다. 퍼센트 높이는 부모가
              // grid일 때 안 잡혀서 `inherit`으로 내려받는다.
              ? { height: "inherit", width: "auto", objectFit: "contain", display: "block" }
              : {
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  borderRadius: "inherit",
                  display: "block",
                }
          }
        />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        background: company.avatarBackground ?? "var(--ex-tint-50)",
        color: company.avatarColor ?? "var(--ex-slate-700)",
      }}
    >
      {company.initial ?? [...company.name][0]}
    </span>
  );
}
