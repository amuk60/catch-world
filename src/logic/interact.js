export function findInteractable(pos, objects, radius) {
  let best = null;
  let bestDist = Infinity;
  for (const obj of objects) {
    const d = Math.hypot(obj.x - pos.x, obj.y - pos.y);
    if (d <= radius && d < bestDist) {
      best = obj;
      bestDist = d;
    }
  }
  return best;
}
