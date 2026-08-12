/**
 * Phosphor는 서브패스로 CSS만 내보내서 타입 선언이 없다. 번들러는 그대로
 * 처리하지만 tsc는 side-effect import를 해석하지 못하므로 여기서 알려준다.
 */
declare module "@phosphor-icons/web/regular";
declare module "@phosphor-icons/web/fill";
declare module "@phosphor-icons/web/bold";
