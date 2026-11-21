/*
 * Vanta 효과 하나를 런타임 효과로 감싼다. Vanta는 화면 밖이면 스스로 그리기를 멈춘다(isOnScreen).
 * 동작 줄이기면 첫 장면들을 그린 뒤 루프를 멈춘다.
 */
export function vantaEffect(create, options) {
  return {
    mount({ el, palette, values, reduce }) {
      const instance = create(Object.assign({ el, THREE: window.THREE, mouseControls: true, touchControls: true, gyroControls: false, minHeight: 200, minWidth: 200, scale: 1, scaleMobile: 1 }, options(palette, values)));
      if (!instance) return null;
      if (reduce) setTimeout(() => { window.cancelAnimationFrame(instance.req); instance.animationLoop = () => {}; }, 400);
      return { destroy: () => instance.destroy() };
    },
  };
}
