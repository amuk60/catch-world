import { CLICK } from './config.js';
import { isClick } from './logic/click.js';

// 포인터 입력을 드래그/클릭/휠/호버 핸들러로 변환한다. 왼쪽 버튼만 사용.
// setEnabled(false) 이면 모든 입력을 무시한다(소각 미니게임 중). 진행 중이던 눌림은 취소된다.
// onHover(ndc, clientX, clientY): 버튼을 누르지 않은 이동에서 프레임당 한 번. 캔버스를 벗어나면 onHover(null).
export function createControls(domElement, { onDrag, onClick, onWheel, onHover }) {
  let down = null; // { x, y, t, lastX, lastY }
  let hoverEvent = null; // 다음 프레임에 처리할 마지막 이동
  let hoverFrame = 0;
  let enabled = true;

  function flushHover() {
    hoverFrame = 0;
    const e = hoverEvent;
    hoverEvent = null;
    if (!e || down || !enabled) return;
    const rect = domElement.getBoundingClientRect();
    onHover({
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    }, e.clientX, e.clientY);
  }

  domElement.addEventListener('pointerdown', (e) => {
    if (!enabled || e.button !== 0) return;
    domElement.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), lastX: e.clientX, lastY: e.clientY };
  });

  domElement.addEventListener('pointermove', (e) => {
    if (!enabled) return;
    if (!down) {
      if (onHover && e.buttons === 0) {
        hoverEvent = e;
        if (!hoverFrame) hoverFrame = requestAnimationFrame(flushHover);
      }
      return;
    }
    onDrag(e.clientX - down.lastX, e.clientY - down.lastY);
    down.lastX = e.clientX;
    down.lastY = e.clientY;
  });

  domElement.addEventListener('pointerup', (e) => {
    if (!enabled || !down || e.button !== 0) return;
    const start = down;
    down = null;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!isClick({ dx, dy, dtMs: performance.now() - start.t }, CLICK)) return;
    const rect = domElement.getBoundingClientRect();
    onClick({
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    });
  });

  domElement.addEventListener('pointerleave', () => {
    if (!onHover || !enabled) return;
    hoverEvent = null;
    onHover(null);
  });

  domElement.addEventListener('pointercancel', () => { down = null; });

  domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (enabled) onWheel(e.deltaY);
  }, { passive: false });

  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    setEnabled(value) {
      enabled = value;
      if (!value) { down = null; hoverEvent = null; }
    },
  };
}
