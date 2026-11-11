import { CLICK } from './config.js';
import { isClick } from './logic/click.js';

// 포인터 입력을 드래그/클릭/휠 핸들러로 변환한다. 왼쪽 버튼만 사용.
export function createControls(domElement, { onDrag, onClick, onWheel }) {
  let down = null; // { x, y, t, lastX, lastY }

  domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    domElement.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), lastX: e.clientX, lastY: e.clientY };
  });

  domElement.addEventListener('pointermove', (e) => {
    if (!down) return;
    onDrag(e.clientX - down.lastX, e.clientY - down.lastY);
    down.lastX = e.clientX;
    down.lastY = e.clientY;
  });

  domElement.addEventListener('pointerup', (e) => {
    if (!down || e.button !== 0) return;
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

  domElement.addEventListener('pointercancel', () => { down = null; });

  domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    onWheel(e.deltaY);
  }, { passive: false });

  domElement.addEventListener('contextmenu', (e) => e.preventDefault());
}
