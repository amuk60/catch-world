// 첫 접속 튜토리얼과 "오늘의 힐링 코스" 체크리스트 (순수). 저장소(localStorage 처럼 getItem/setItem)는 주입받고, 없거나 막혀도 던지지 않는다.
// 튜토리얼 단계: 0 소개 카드 -> 1 움직여 보기 -> 2 모닥불로 가기 -> 3 태워 보기 -> 4 축하 -> 끝. 건너뛰기는 언제든(전체를 끝낸다).
// 체크리스트: 실제 게임 이벤트(track 이름)를 eventOfTrack 으로 코스 이벤트로 바꿔 넣으면 스스로 체크된다.
export const TUTORIAL_KEY = 'catchworld.tutorialSeen';
export const COURSE_KEY = 'catchworld.healingCourse';
export const STEP = { INTRO: 0, MOVE: 1, FIRE: 2, BURN: 3, CONGRATS: 4 };
export const FIRE_ZONE_ID = 'incinerator';

const read = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const write = (storage, key, value) => { try { storage?.setItem(key, value); } catch { /* 저장 불가: 이번 방문에만 동작 */ } };

// 분석 이벤트(이름·값) -> 코스 이벤트 id (없으면 null). burn: 태우기·파쇄, wash/hang: 세탁·널기, wear: 새 셔츠 입기.
export function eventOfTrack(name, params = {}) {
  if (name === 'action_done') {
    const a = params?.action;
    return a === 'burn' || a === 'shred' ? 'burn' : a === 'wash' ? 'wash' : a === 'hang' ? 'hang' : null;
  }
  return { outfit_ready: 'wear', interview_answer: 'interview', fortune_crack: 'fortune', marshmallow: 'marshmallow' }[name] ?? null;
}

// ---- 튜토리얼 상태 기계 ----
export const isTutorialSeen = (storage) => read(storage, TUTORIAL_KEY) === '1';

// opts: { storage, track(name, params), moveDistance, congratsSeconds }
export function createTutorial({ storage = null, track = () => {}, moveDistance = 2.5, congratsSeconds = 4.5 } = {}) {
  let step = null; // null: 진행 중이 아님
  let moved = 0;
  let congratsLeft = 0;
  const enter = (n) => { step = n; if (n === STEP.CONGRATS) congratsLeft = congratsSeconds; track('tutorial_step', { n }); };
  return {
    get step() { return step; },
    get active() { return step !== null; },
    shouldAutoStart: () => !isTutorialSeen(storage),
    // 처음 방문(또는 다시 보기)을 시작한다. 이미 진행 중이면 처음부터 다시.
    start({ replay = false } = {}) {
      moved = 0;
      write(storage, TUTORIAL_KEY, '1'); // 소개를 보인 순간 본 것으로 친다(도중에 닫아도 다시 강요하지 않는다)
      track('tutorial_start', { replay });
      enter(STEP.INTRO);
    },
    // "시작하기": 소개 -> 1단계
    begin() { if (step === STEP.INTRO) { moved = 0; enter(STEP.MOVE); } },
    // 걸어서 움직인 거리(월드 단위, 이번 프레임 증가분). 1단계에서만 센다.
    notifyMoved(distance) {
      if (step !== STEP.MOVE || !(distance > 0)) return;
      moved += distance;
      if (moved >= moveDistance) enter(STEP.FIRE);
    },
    // 코스 이벤트(eventOfTrack 의 값). 3단계에서 태우기(burn)가 끝나면 축하로.
    notifyEvent(id) { if (step === STEP.BURN && id === 'burn') enter(STEP.CONGRATS); },
    // 매 프레임. ctx: { zoneId(지금 행동 구역 id 또는 null), free(자유 상태인가) }. 끝나면 'complete' 를 돌려준다.
    update(dt, { zoneId = null, free = true } = {}) {
      if (step === STEP.FIRE && zoneId === FIRE_ZONE_ID) enter(STEP.BURN);
      else if (step === STEP.BURN && free && zoneId !== FIRE_ZONE_ID) enter(STEP.FIRE); // 불에서 멀어지면 다시 모닥불로
      else if (step === STEP.CONGRATS) {
        congratsLeft -= dt;
        if (congratsLeft <= 0) { step = null; track('tutorial_complete'); return 'complete'; }
      }
      return null;
    },
    skip() {
      if (step === null) return false;
      track('tutorial_skip', { n: step });
      step = null;
      return true;
    },
  };
}

// ---- 체크리스트 ----
// items: [{ id, needs: [코스 이벤트 id...] }] (TUTORIAL.course.items). 저장 형식: { got: [이벤트], done: [항목 id], hidden, collapsed }
export function createCourse({ storage = null, items, track = () => {} } = {}) {
  const ids = items.map((i) => i.id);
  const events = new Set(items.flatMap((i) => i.needs));
  const state = { got: new Set(), done: new Set(), hidden: false, collapsed: false, complete: false };
  try {
    const saved = JSON.parse(read(storage, COURSE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const e of Array.isArray(saved.got) ? saved.got : []) if (events.has(e)) state.got.add(e);
      for (const d of Array.isArray(saved.done) ? saved.done : []) if (ids.includes(d)) state.done.add(d);
      state.hidden = saved.hidden === true;
      state.collapsed = saved.collapsed === true;
    }
  } catch { /* 깨진 저장값은 처음부터 */ }
  state.complete = state.done.size === ids.length;
  const save = () => write(storage, COURSE_KEY, JSON.stringify({ got: [...state.got], done: [...state.done], hidden: state.hidden, collapsed: state.collapsed }));
  return {
    items,
    // 코스 이벤트를 넣는다. 새로 완료된 항목 id 목록(없으면 [])
    notify(eventId) {
      if (!events.has(eventId) || state.got.has(eventId)) return [];
      state.got.add(eventId);
      const fresh = [];
      for (const item of items) {
        if (!state.done.has(item.id) && item.needs.every((e) => state.got.has(e))) { state.done.add(item.id); fresh.push(item.id); track('checklist_item', { id: item.id }); }
      }
      if (!state.complete && state.done.size === ids.length) { state.complete = true; track('checklist_complete'); }
      save();
      return fresh;
    },
    isDone: (id) => state.done.has(id),
    hasGot: (e) => state.got.has(e),
    progress: () => ({ done: state.done.size, total: ids.length }),
    get complete() { return state.complete; },
    get hidden() { return state.hidden; },
    get collapsed() { return state.collapsed; },
    setHidden(v) { state.hidden = Boolean(v); save(); },
    setCollapsed(v) { state.collapsed = Boolean(v); save(); },
  };
}

// ---- 길안내 화살표 ----
// 목표를 지금 공간에서 가야 할 지점으로: places[id] = { 공간 id: {x, z} }(그 공간에 목표가 있을 때), exits[공간 id] = 그 공간의 출구 {x, z}.
// 목표가 있는 공간이면 그 지점, 다른 실내라면 그 공간의 출구, 어디에도 없으면 null.
export function resolveTarget(placeId, spaceId, places, exits) {
  const place = places[placeId];
  if (!place) return null;
  const here = place[spaceId] ?? exits[spaceId];
  return here ? { x: here.x, z: here.z } : null;
}

// 화면 안내: ndc(투영된 점: 화면 가운데 0, 위가 +y), behind(카메라 뒤인가), view({width, height} px), margin(숫자 또는 {left,right,top,bottom} px: 가장자리에서 띄울 거리).
// 보이고 여백 안쪽이면 { onScreen: true, x, y }, 아니면 가장자리 사각형에 붙인 { onScreen: false, x, y, angle }. angle 은 화면 가운데에서 목표 쪽(라디안, 0 = 오른쪽, 시계 방향이 +).
export function compassArrow({ x: nx, y: ny }, behind, view, margin = 0) {
  const m = typeof margin === 'number' ? { left: margin, right: margin, top: margin, bottom: margin } : { left: 0, right: 0, top: 0, bottom: 0, ...margin };
  const cx = view.width / 2;
  const cy = view.height / 2;
  let dx = (nx * view.width) / 2;
  let dy = (-ny * view.height) / 2;
  if (behind) { dx = -dx; dy = -dy; } // 카메라 뒤의 점은 투영하면 거울상이 된다
  const px = cx + dx;
  const py = cy + dy;
  if (!behind && px >= m.left && px <= view.width - m.right && py >= m.top && py <= view.height - m.bottom) return { onScreen: true, x: px, y: py };
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = 1; // 정확히 겹치면(뒤쪽 한가운데) 아래를 가리킨다
  const tx = dx > 0 ? (view.width - m.right - cx) / dx : dx < 0 ? (m.left - cx) / dx : Infinity;
  const ty = dy > 0 ? (view.height - m.bottom - cy) / dy : dy < 0 ? (m.top - cy) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { onScreen: false, x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}
