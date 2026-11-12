// 브라우저 전용: 공간 전환. 마당과 실내는 한 씬 안의 따로 떨어진 그룹이고, 지금 공간의 그룹만 보이게 하고 배경·안개를 바꾼다.
// spaces: { [id]: { root, fog, background } } (공간 id 는 logic/spaces.js 의 SPACES 와 같다). 면접장 같은 새 공간은 여기에 항목만 더하면 된다.
// 조명은 각 공간 root 안에 들어 있어(마당: 해·반구광·불의 점광, 실내: 반구광·램프 점광·방향광) root 를 숨기면 함께 꺼진다.
export function createSpaces({ scene, spaces, initial = 'yard' }) {
  let current = null;
  const api = {
    get current() { return current; },
    apply(id) {
      const target = spaces[id];
      if (!target) throw new Error(`알 수 없는 공간: ${id}`);
      for (const [key, s] of Object.entries(spaces)) s.root.visible = key === id;
      scene.fog = target.fog;
      scene.background = target.background;
      current = id;
    },
  };
  api.apply(initial);
  return api;
}
