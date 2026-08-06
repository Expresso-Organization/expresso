# 포털 저장 백엔드 (미착수)

포털의 칸반 보드와 위키는 지금 브라우저 `localStorage`에 저장되어 팀원 간에 공유되지 않습니다.
여기에 저장 API를 두고, 포털의 저장 어댑터만 교체하면 4명이 같은 보드를 보게 됩니다.

교체 대상은 `docs/Expresso 개발 포털.dc.html` 안의 네 지점입니다:

| 함수 | 대상 데이터 | localStorage 키 |
|---|---|---|
| `loadBoard` / `saveBoard` | 칸반 티켓 | `expresso-portal-board` |
| `loadWiki` / `saveWiki` | 위키 문서 · 댓글 | `expresso-portal-wiki` |
| `load` / `save` | 태스크 진행 체크 | `expresso-portal-progress` |
| — | 내 프로필(이니셜) | `expresso-portal-me` |

착수 전에 정해야 할 것: 인증 방식(GitHub OAuth 연동이 자연스러움), 호스팅 위치,
그리고 Pages(정적)에서 API를 부를 때의 CORS 처리.
