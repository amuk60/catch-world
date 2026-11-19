// 브라우저 전용: 첫 접속 튜토리얼(소개 카드 -> 움직이기 -> 모닥불로 가기 -> 태우기 -> 축하)과 "오늘의 힐링 코스" 체크리스트 칩, 길안내 화살표.
// 상태 기계는 logic/tutorial.js(순수). 여기는 화면과 연결만 한다. 모든 안내는 입력을 막지 않는다(소개 카드·칩·건너뛰기 링크만 클릭을 받고, 화살표·토스트는 pointer-events 없음).
// 스타일은 이 파일이 직접 넣는다(guideHud 와 같다). 다른 창(닉네임 카드·고르기·포춘·결과·팝업)이 떠 있으면(update 의 blocked) 모두 숨고 시간도 멈춘다.
import { createTutorial, createCourse, eventOfTrack, compassArrow, resolveTarget, STEP } from './logic/tutorial.js';

const CSS = `
#tut-dim { position: absolute; inset: 0; background: rgba(10, 10, 20, 0.3); z-index: 3; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 0.25s, visibility 0.25s; }
#tut-dim.open { opacity: 1; visibility: visible; }
#tut-intro { position: absolute; left: 50%; top: 50%; width: 340px; max-width: calc(100% - 32px); box-sizing: border-box; padding: 20px 22px 14px; border-radius: 16px;
  background: #fdf6e3; color: #3a2f1f; text-align: center; box-shadow: 0 10px 34px rgba(0, 0, 0, 0.45); z-index: 3; opacity: 0; visibility: hidden;
  transform: translate(-50%, -46%); transition: opacity 0.25s, transform 0.25s, visibility 0.25s; }
#tut-intro.open { opacity: 1; visibility: visible; transform: translate(-50%, -50%); }
#tut-intro h2 { margin: 0 0 10px; font-size: 20px; line-height: 1.35; word-break: keep-all; }
#tut-intro p { margin: 0 0 6px; font-size: 14px; line-height: 1.55; word-break: keep-all; }
#tut-intro .tut-note { margin: 10px 0 14px; font-size: 12px; color: #8a7a5f; }
#tut-intro .tut-go { width: 100%; padding: 11px 0; border: 0; border-radius: 999px; background: #e8833a; color: #fff; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 3px 0 #b9611f; }
#tut-intro .tut-go:hover { background: #f0913f; }
.tut-skip { padding: 4px 8px; border: 0; background: none; color: inherit; font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; opacity: 0.75; pointer-events: auto; }
.tut-skip:hover { opacity: 1; }
#tut-intro .tut-skip { margin-top: 6px; color: #6b5d44; }
#tut-toast { position: absolute; left: 50%; top: 92px; transform: translate(-50%, -6px); width: max-content; max-width: calc(100% - 32px); box-sizing: border-box;
  padding: 9px 14px 8px; border-radius: 14px; background: rgba(18, 18, 31, 0.88); color: #fff; font-size: 15px; line-height: 1.55; text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); z-index: 2; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 0.2s, transform 0.2s, visibility 0.2s; }
#tut-toast.open { opacity: 1; visibility: visible; transform: translate(-50%, 0); }
#tut-toast .tut-badge { display: block; margin-bottom: 1px; font-size: 11px; letter-spacing: 0.04em; color: #ffd9a8; }
#tut-toast .tut-line { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 3px 5px; word-break: keep-all; }
#tut-toast .tut-sub { display: block; font-size: 13px; color: #cfcfe6; }
#tut-toast .tut-up { display: block; color: #ffd9a8; font-size: 14px; line-height: 1; animation: tut-bob 0.9s ease-in-out infinite; }
#tut-toast .tut-skip { margin-top: 2px; color: #cfcfe6; font-size: 12px; }
#tut-toast .keycap { font-size: 12px; min-width: 18px; padding: 1px 6px; }
@keyframes tut-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes tut-bob-down { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(5px); } }
#tut-pin, #tut-edge { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; will-change: transform; }
#tut-pin.open, #tut-edge.open { opacity: 1; visibility: visible; }
#tut-pin .tut-pin-box { display: flex; flex-direction: column; align-items: center; gap: 1px; }
#tut-pin .tut-pin-label { padding: 3px 10px; border-radius: 999px; background: #e8833a; color: #fff; font-size: 13px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
#tut-pin .tut-pin-arrow { color: #ff9a4a; font-size: 26px; line-height: 1; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.55); animation: tut-bob-down 0.9s ease-in-out infinite; }
#tut-edge .tut-edge-icon { position: absolute; left: 0; top: 0; width: 40px; height: 40px; margin: -20px 0 0 -20px; display: flex; align-items: center; justify-content: center; border-radius: 50%;
  background: rgba(18, 18, 31, 0.86); box-shadow: 0 0 0 2px #e8833a, 0 3px 10px rgba(0, 0, 0, 0.45); font-size: 20px; }
#tut-edge .tut-edge-tri { position: absolute; left: 0; top: 0; color: #ff9a4a; font-size: 16px; line-height: 1; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); }
#tut-course { position: absolute; left: 12px; top: 84px; width: 270px; max-width: calc(100% - 24px); box-sizing: border-box; z-index: 2; color: #fff; font-size: 13px; line-height: 1.45;
  transition: opacity 1.2s, visibility 1.2s; opacity: 1; }
#tut-course.hide { opacity: 0; visibility: hidden; }
#tut-course.fading { opacity: 0; }
#tut-course .tut-head { display: flex; align-items: center; gap: 2px; border-radius: 999px; background: rgba(18, 18, 31, 0.8); }
#tut-course .tut-toggle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 6px 4px 6px 12px; border: 0; background: none; color: inherit; font: inherit; font-weight: 700; text-align: left; cursor: pointer; white-space: nowrap; }
#tut-course .tut-count { margin-left: auto; padding: 0 6px; border-radius: 999px; background: #e8833a; font-size: 12px; }
#tut-course .tut-close { width: 28px; height: 28px; margin-right: 3px; padding: 0; border: 0; border-radius: 999px; background: none; color: #cfcfe6; font-size: 16px; line-height: 1; cursor: pointer; }
#tut-course .tut-close:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
#tut-course .tut-body { margin-top: 4px; padding: 6px; border-radius: 14px; background: rgba(18, 18, 31, 0.86); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); }
#tut-course.collapsed .tut-body { display: none; }
#tut-course .tut-sub { margin: 0 4px 4px; font-size: 12px; color: #cfcfe6; }
#tut-course .tut-item { display: flex; align-items: flex-start; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 10px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
#tut-course .tut-item:hover { background: rgba(255, 255, 255, 0.1); }
#tut-course .tut-item.on { background: rgba(232, 131, 58, 0.28); box-shadow: 0 0 0 1px #e8833a inset; }
#tut-course .tut-item.done { cursor: default; opacity: 0.7; }
#tut-course .tut-item.done:hover { background: none; }
#tut-course .tut-ico { font-size: 17px; line-height: 1.3; }
#tut-course .tut-txt { flex: 1; min-width: 0; }
#tut-course .tut-name { display: block; font-weight: 700; }
#tut-course .tut-item.done .tut-name { text-decoration: line-through; }
#tut-course .tut-hint { display: block; font-size: 12px; color: #cfcfe6; }
#tut-course .tut-tick { width: 18px; height: 18px; margin-top: 2px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.35); box-sizing: border-box; flex: none; text-align: center; font-size: 11px; line-height: 14px; }
#tut-course .tut-item.done .tut-tick { border-color: #5fd38d; background: #5fd38d; color: #12301f; font-weight: 700; }
#tut-course .tut-prog { margin-left: 4px; font-size: 12px; font-weight: 400; color: #ffd9a8; }
#tut-course .tut-fresh { animation: tut-pop 0.6s ease-out; }
#tut-course .tut-cheer { margin: 4px 4px 2px; padding: 6px 8px; border-radius: 10px; background: rgba(95, 211, 141, 0.18); color: #d9ffe8; font-size: 12px; word-break: keep-all; }
#tut-course .tut-toggle:focus-visible, #tut-course .tut-close:focus-visible, #tut-course .tut-item:focus-visible, #tut-intro button:focus-visible, .tut-skip:focus-visible { outline: 2px solid #ffd9a8; outline-offset: 2px; }
@keyframes tut-pop { 0% { transform: scale(0.96); background: rgba(95, 211, 141, 0.5); } 100% { transform: none; } }
@media (max-width: 640px) { #tut-intro { padding: 16px 16px 12px; } #tut-intro h2 { font-size: 18px; } #tut-intro p { font-size: 13px; } #tut-toast { font-size: 14px; } }
`;

const k = (t) => `<span class="keycap">${t}</span>`;
const KEYS = `${k('W')}${k('A')}${k('S')}${k('D')} / ${k('↑')}${k('←')}${k('↓')}${k('→')}`;
const fill = (text) => text.replace('{keys}', KEYS).replace('{key1}', k('1'));
const MARGIN = { left: 46, right: 46, top: 100, bottom: 132 }; // 가장자리 화살표: 스트레스 막대·행동 막대·E 안내를 피한다
const MARGIN_TOAST = { ...MARGIN, top: 200 }; // 위쪽 토스트가 떠 있을 때는 그 아래로
const MAX_STEP_PER_FRAME = 1.5; // 한 프레임에 이만큼 넘게 옮겨졌으면 이동이 아니라 순간이동(공간 전환 등)

// opts: { storage, track, config(TUTORIAL), places, exits, onStart(), onEnd({ replay, how }) }
export function createTutorialUi(container, { storage = null, track = () => {}, config, places, exits, onStart = () => {}, onEnd = () => {} }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const tutorial = createTutorial({ storage, track, moveDistance: config.moveDistance, congratsSeconds: config.congratsSeconds });
  const course = createCourse({ storage, items: config.course.items, track });
  if (course.complete && !course.hidden) course.setHidden(true); // 완주 뒤 탭을 닫았다면 다음 방문에는 축하 없이 접어 둔다
  let autoPending = tutorial.shouldAutoStart(); // 이번 방문에 자동으로 시작할 차례인가(건너뛰면 칩은 접힌 채로)
  let isReplay = false;
  let readyFor = 0; // 가려지지 않은 시간(초): 막 열린 직후에는 잠깐 두었다가 소개를 띄운다
  let lastPos = null;
  let lastSpace = null;
  let selected = null; // 체크리스트에서 눌러 방향을 보고 있는 항목 id
  let celebrate = 0; // 완주 축하 남은 초(0 이면 없음)
  let fresh = new Set();

  const el = (tag, attrs = {}, html = '') => { const n = document.createElement(tag); Object.assign(n, attrs); if (html) n.innerHTML = html; return n; };
  const noFocus = (btn) => btn.addEventListener('pointerdown', (e) => e.preventDefault()); // 버튼이 포커스를 가져가 Space·Enter 가 게임 키를 삼키지 않게

  // 소개 카드
  const dim = el('div', { id: 'tut-dim' });
  const intro = el('div', { id: 'tut-intro' });
  intro.setAttribute('role', 'dialog');
  intro.setAttribute('aria-labelledby', 'tut-intro-title');
  const c = config.intro;
  intro.innerHTML = `<h2 id="tut-intro-title"></h2>${c.lines.map(() => '<p></p>').join('')}<p class="tut-note"></p>`;
  intro.querySelector('h2').textContent = c.title;
  intro.querySelectorAll('p:not(.tut-note)').forEach((p, i) => { p.textContent = c.lines[i]; });
  intro.querySelector('.tut-note').textContent = c.note;
  const goBtn = el('button', { type: 'button', className: 'tut-go', textContent: c.start });
  const introSkip = el('button', { type: 'button', className: 'tut-skip', textContent: c.skip });
  intro.append(goBtn, introSkip);
  noFocus(goBtn); noFocus(introSkip);

  // 단계 토스트(위쪽 가운데, 스트레스 막대 아래)
  const toast = el('div', { id: 'tut-toast' });
  toast.setAttribute('role', 'status');
  const toastBody = el('div');
  const toastSkip = el('button', { type: 'button', className: 'tut-skip', textContent: config.steps.skip });
  noFocus(toastSkip);
  toast.append(toastBody, toastSkip);

  // 길안내 화살표: 목표 위에 뜨는 핀(화면 안) / 가장자리 화살표(화면 밖)
  const pin = el('div', { id: 'tut-pin' }, '<div class="tut-pin-box"><span class="tut-pin-label"></span><span class="tut-pin-arrow">▼</span></div>');
  const pinLabel = pin.querySelector('.tut-pin-label');
  const edge = el('div', { id: 'tut-edge' }, '<span class="tut-edge-icon"></span><span class="tut-edge-tri">▶</span>');
  const edgeIcon = edge.querySelector('.tut-edge-icon');
  const edgeTri = edge.querySelector('.tut-edge-tri');

  // 체크리스트 칩
  const chip = el('div', { id: 'tut-course', className: 'hide' });
  chip.setAttribute('role', 'group');
  chip.setAttribute('aria-label', config.course.title);
  const head = el('div', { className: 'tut-head' });
  const toggle = el('button', { type: 'button', className: 'tut-toggle' });
  const closeBtn = el('button', { type: 'button', className: 'tut-close', textContent: '×' });
  closeBtn.setAttribute('aria-label', `${config.course.title} 닫기`);
  head.append(toggle, closeBtn);
  const body = el('div', { className: 'tut-body' });
  chip.append(head, body);
  noFocus(toggle); noFocus(closeBtn);
  container.append(dim, intro, toast, pin, edge, chip);

  const itemById = (id) => config.course.items.find((i) => i.id === id);
  const needsDone = (item) => item.needs.filter((e) => course.hasGot(e)).length;

  function renderChip() {
    const { done, total } = course.progress();
    toggle.innerHTML = `<span>🌿 ${config.course.title}</span><span class="tut-count">${done}/${total}</span>`;
    toggle.setAttribute('aria-expanded', String(!course.collapsed));
    chip.classList.toggle('collapsed', course.collapsed);
    body.innerHTML = '';
    if (celebrate > 0) body.append(el('p', { className: 'tut-cheer', textContent: config.course.celebrate }));
    else body.append(el('p', { className: 'tut-sub', textContent: config.course.sub }));
    for (const item of config.course.items) {
      const isDone = course.isDone(item.id);
      const row = el('button', { type: 'button', className: `tut-item${isDone ? ' done' : ''}${selected === item.id && !isDone ? ' on' : ''}${fresh.has(item.id) ? ' tut-fresh' : ''}` });
      const progress = item.needs.length > 1 && !isDone ? ` <span class="tut-prog">${needsDone(item)}/${item.needs.length}</span>` : '';
      row.innerHTML = `<span class="tut-ico">${item.icon}</span><span class="tut-txt"><span class="tut-name"></span><span class="tut-hint"></span></span><span class="tut-tick">${isDone ? '✓' : ''}</span>`;
      row.querySelector('.tut-name').innerHTML = `${item.label}${progress}`;
      row.querySelector('.tut-hint').textContent = item.hint;
      row.dataset.id = item.id;
      row.setAttribute('aria-pressed', String(selected === item.id && !isDone));
      noFocus(row);
      row.addEventListener('click', () => {
        if (course.isDone(item.id)) return;
        selected = selected === item.id ? null : item.id; // 한 번 더 누르면 방향 표시를 끈다
        renderChip();
      });
      body.append(row);
    }
    fresh = new Set();
  }
  renderChip();
  toggle.addEventListener('click', () => { course.setCollapsed(!course.collapsed); renderChip(); });
  closeBtn.addEventListener('click', () => { course.setHidden(true); selected = null; });

  function begin(replay) {
    isReplay = replay;
    selected = null;
    celebrate = 0;
    chip.classList.remove('fading');
    tutorial.start({ replay });
    onStart({ replay });
  }
  function ended(how) {
    if (how === 'complete') course.setCollapsed(false); // 끝까지 하면 펼쳐서 다음 목표를 보여 준다
    else if (!isReplay) course.setCollapsed(true); // 처음 방문에 건너뛰면 접힌 채로
    course.setHidden(false);
    renderChip();
    const replay = isReplay;
    isReplay = false;
    onEnd({ replay, how });
  }
  goBtn.addEventListener('click', () => tutorial.begin());
  introSkip.addEventListener('click', () => { tutorial.skip(); ended('skip'); });
  toastSkip.addEventListener('click', () => { tutorial.skip(); ended('skip'); });

  // 지금 가리킬 목표: 튜토리얼 2단계는 모닥불, 아니면 체크리스트에서 고른 항목.
  function goal() {
    if (tutorial.step === STEP.FIRE) return { id: 'burn', icon: '🔥', label: '모닥불' };
    if (!tutorial.active && selected && !course.isDone(selected)) { const it = itemById(selected); return { id: it.id, icon: it.icon, label: `${it.icon} ${it.label}` }; }
    return null;
  }

  let toastKey = '';
  function renderToast(busy) {
    const s = tutorial.step;
    const key = `${s}|${busy}`;
    if (key === toastKey) return;
    toastKey = key;
    const t = config.steps;
    let html = '';
    if (s === STEP.MOVE) html = `<span class="tut-badge">튜토리얼 1/3</span><div class="tut-line">${fill(t.move)}</div>`;
    else if (s === STEP.FIRE) html = `<span class="tut-badge">튜토리얼 2/3</span><div class="tut-line">${fill(t.fire)}</div>`;
    else if (s === STEP.BURN) html = `<span class="tut-badge">튜토리얼 3/3</span><div class="tut-line">${fill(t.burn)}</div>`;
    else if (s === STEP.CONGRATS) html = `<span class="tut-up">▲</span><div class="tut-line"><b>${t.congrats}</b></div><span class="tut-sub">${t.congratsSub}</span>`;
    toastBody.innerHTML = html;
    toastSkip.hidden = s === STEP.CONGRATS;
  }

  const view = { width: 0, height: 0 };
  let ctxNarrow = false;
  function placeArrow(g, ctx) {
    const target = resolveTarget(g.id, ctx.spaceId, places, exits);
    const here = places[g.id]?.[ctx.spaceId]; // 이 공간에 목표 자체가 있나(없으면 출구를 가리키는 중)
    if (!target) return false;
    if (here && Math.hypot(ctx.player.x - target.x, ctx.player.z - target.z) <= config.arriveRadius && tutorial.step !== STEP.FIRE) { selected = null; renderChip(); return false; } // 도착: 방향 표시 끝
    view.width = ctx.view.width; view.height = ctx.view.height;
    const p = ctx.project(target.x, g.id === 'burn' ? config.pinHeight : 2.4, target.z);
    const r = compassArrow({ x: p.x, y: p.y }, p.behind, view, toast.classList.contains('open') ? MARGIN_TOAST : MARGIN);
    if (r.onScreen) {
      pinLabel.textContent = here ? g.label : `${g.label} (출구로)`;
      pin.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px) translate(-50%, -100%)`;
      pin.classList.add('open');
      edge.classList.remove('open');
    } else {
      edgeIcon.textContent = g.icon;
      edge.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)`;
      edgeTri.style.transform = `translate(-50%, -50%) rotate(${r.angle.toFixed(3)}rad) translateX(31px)`;
      edge.classList.add('open');
      pin.classList.remove('open');
    }
    return true;
  }

  function render(blocked, busy, guideOpen) {
    const s = tutorial.step;
    const showIntro = s === STEP.INTRO && !blocked;
    intro.classList.toggle('open', showIntro);
    dim.classList.toggle('open', showIntro);
    intro.inert = !showIntro;
    const toastOn = !blocked && (s === STEP.MOVE || s === STEP.FIRE || (s === STEP.BURN && !busy) || s === STEP.CONGRATS);
    if (toastOn) renderToast(busy);
    toast.classList.toggle('open', toastOn);
    toastSkip.style.pointerEvents = toastOn ? 'auto' : 'none';
    const chipOn = !tutorial.active && !autoPending && !course.hidden && !blocked && !(guideOpen && ctxNarrow); // 좁은 화면에서는 조작 안내 카드와 자리가 겹쳐 그동안 숨는다
    chip.classList.toggle('hide', !chipOn);
  }

  return {
    get active() { return tutorial.active; },
    get step() { return tutorial.step; },
    course,
    replay() { begin(true); },
    // 분석 이벤트를 코스 이벤트로 바꿔 튜토리얼 3단계와 체크리스트에 넣는다.
    onTrack(name, params) {
      const id = eventOfTrack(name, params);
      if (!id) return;
      tutorial.notifyEvent(id);
      const done = course.notify(id);
      if (done.length) {
        fresh = new Set(done);
        if (course.complete && !celebrate) { celebrate = config.course.celebrateSeconds; chip.classList.remove('fading'); course.setHidden(false); course.setCollapsed(false); }
        if (selected && course.isDone(selected)) selected = null;
        renderChip();
      }
      renderChip(); // 세탁소처럼 여러 단계인 항목의 n/m 도 갱신한다
    },
    // 매 프레임(카메라 자세를 정한 뒤). ctx: { blocked, busy, guideOpen, free, zoneId, spaceId, player: {x, z}, view: {width, height}, project(x, y, z) -> {x, y, behind} }
    update(dt, ctx) {
      // 걸은 거리(공간이 바뀌었거나 크게 튀었으면 이동으로 치지 않는다)
      if (lastPos && ctx.spaceId === lastSpace) {
        const d = Math.hypot(ctx.player.x - lastPos.x, ctx.player.z - lastPos.z);
        if (d < MAX_STEP_PER_FRAME && ctx.free) tutorial.notifyMoved(d);
      }
      lastPos = { x: ctx.player.x, z: ctx.player.z };
      lastSpace = ctx.spaceId;

      if (!ctx.blocked) readyFor += dt; else readyFor = 0;
      if (autoPending && readyFor >= 1.2 && !tutorial.active) { autoPending = false; begin(false); }

      if (!ctx.blocked) {
        const result = tutorial.update(dt, { zoneId: ctx.zoneId, free: ctx.free });
        if (result === 'complete') ended('complete');
        if (celebrate > 0) {
          celebrate -= dt;
          if (celebrate <= 0) { celebrate = 0; chip.classList.add('fading'); setTimeout(() => { course.setHidden(true); chip.classList.remove('fading'); }, 1300); renderChip(); }
        }
      }
      ctxNarrow = ctx.view.width <= 640;
      render(ctx.blocked, ctx.busy, ctx.guideOpen);

      const g = ctx.blocked ? null : goal();
      const arrowOn = g ? placeArrow(g, ctx) : false;
      if (!arrowOn) { pin.classList.remove('open'); edge.classList.remove('open'); }
    },
  };
}
