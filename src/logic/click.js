// 짧고 움직임이 작은 포인터 입력만 클릭으로 본다(드래그와 구분).
export function isClick({ dx, dy, dtMs }, { maxMovePx, maxMs }) {
  return Math.hypot(dx, dy) <= maxMovePx && dtMs <= maxMs;
}
