// 브라우저 전용: 인사·응원말(프리셋) — 우하단 💬 버튼, T 키 선택 창(1~8 로 고르기), 내 머리 위 말풍선, 다른 방문자의 말풍선.
// 글은 전송하지 않는다: 번호만 보내고(onSend), 받은 번호는 이 목록에서 글을 찾아 보여 준다(세션이 이미 검사·속도 제한을 거친다).
// 말풍선은 hud.say 를 쓴다(소리 없음). 다른 방문자 것은 키 'r-<id>~c' 라서 remoteSpeech 가 그 방문자 머리 위로 옮기고, 같은 방문자의 면접 답변 말풍선 위에 쌓는다.
import * as THREE from 'three';
import { quickChatText, cleanQuickChat, quickChatKey, QUICK_CHAT_SECONDS } from './logic/quickChat.js';
import { isTypingTarget } from './logic/typing.js';

const SELF_KEY = 'q-self';
const HEAD_HEIGHT = 1.9; // 내 머리 위(발 기준)
const GAP_PX = 6;

// opts: { container(#game), hud, camera, renderer, player(Object3D), list(QUICK_CHAT), isBlocked(): 면접·전환·포춘·종료 화면 등이면 true, onSend(i): 보냈으면 true(없으면 아무 일 없다), onUse(i): 분석 등 }
export function createQuickChat({ container, hud, camera, renderer, player, list, isBlocked = () => false, onSend = () => false, onUse = () => {} }) {
  const items = cleanQuickChat(list);
  const valid = items.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
  const count = items.length;

  const button = document.createElement('button');
  button.id = 'qc-btn';
  button.type = 'button';
  button.setAttribute('aria-label', '인사·응원말 (T)');
  button.setAttribute('aria-haspopup', 'true');
  button.innerHTML = '<span class="qc-emoji" aria-hidden="true">💬</span><span class="qc-label">인사·응원말 (T)</span>';
  const picker = document.createElement('div');
  picker.id = 'qc-picker';
  picker.setAttribute('role', 'menu');
  picker.setAttribute('aria-label', '인사·응원말 고르기');
  for (const i of valid) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.index = String(i);
    b.setAttribute('role', 'menuitem');
    const key = document.createElement('span');
    key.className = 'keycap';
    key.textContent = String(i + 1);
    const text = document.createElement('span');
    text.className = 'qc-text';
    text.textContent = items[i];
    b.append(key, text);
    picker.append(b);
  }
  container.append(button, picker);

  let open = false;
  const point = new THREE.Vector3();
  function setOpen(next) {
    open = next && valid.length > 0 && !isBlocked();
    picker.classList.toggle('open', open);
    button.classList.toggle('active', open);
    button.setAttribute('aria-expanded', String(open));
  }

  // 말풍선 고르기: 내 말풍선을 띄우고 번호를 보낸다(멀티플레이가 꺼져 있으면 말풍선만).
  function choose(i) {
    const text = quickChatText(items, i);
    if (!text) return false;
    setOpen(false);
    hud.say(SELF_KEY, text, { seconds: QUICK_CHAT_SECONDS, silent: true });
    onSend(i);
    onUse(i);
    return true;
  }

  button.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스를 가져가지 않는다(스페이스·엔터로 다시 눌리지 않게)
  picker.addEventListener('pointerdown', (e) => e.preventDefault());
  button.addEventListener('click', () => setOpen(!open));
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) choose(Number(b.dataset.index));
  });
  // 선택 창 밖을 누르면 닫는다(그 클릭은 그대로 게임으로 간다: 캐릭터가 멈추지 않는다).
  window.addEventListener('pointerdown', (e) => {
    if (open && !picker.contains(e.target) && !button.contains(e.target)) setOpen(false);
  }, true);
  // 키: 캡처 단계에서 먼저 본다. 선택 창이 열려 있을 때의 숫자 키·Esc·T 만 가져가고(게임의 1·2 행동 키가 같이 눌리지 않게), 나머지는 게임이 그대로 쓴다.
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const inCard = typeof e.target?.closest === 'function' && e.target.closest('#nick-card');
    const act = quickChatKey({ code: e.code, open, typing: isTypingTarget(e.target) || Boolean(inCard), blocked: isBlocked(), repeat: e.repeat, count });
    if (!act) return;
    if (act.type === 'open') setOpen(true);
    else if (act.type === 'close') setOpen(false);
    else if (act.type === 'pick') choose(act.index);
    if (act.type !== 'close' || e.code === 'Escape' || e.code === 'KeyT') { e.stopImmediatePropagation(); e.preventDefault(); } // 막힘 때문에 닫는 경우(다른 키)에는 키를 게임에 그대로 넘긴다
  }, true);

  // 화면 위치를 매 프레임 갱신: 내 말풍선은 내 머리 위(면접 중 내 답변 말풍선이 있으면 그 위).
  return {
    update() {
      if (isBlocked() && open) setOpen(false);
      button.classList.toggle('blocked', isBlocked());
      const size = hud.speechSize(SELF_KEY);
      if (!size) return;
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      camera.updateMatrixWorld();
      point.set(player.position.x, player.position.y + HEAD_HEIGHT, player.position.z).project(camera);
      if (point.z >= 1) { hud.clearSpeech(SELF_KEY); return; }
      let y = (-point.y * 0.5 + 0.5) * h;
      const mine = hud.speechSize('player');
      if (mine) y -= mine.h + GAP_PX; // 면접 중 내 답변 말풍선과 겹치지 않게 위로
      hud.positionSpeech(SELF_KEY, (point.x * 0.5 + 0.5) * w, y);
    },
    // 다른 방문자의 인사·응원말. ev: session.onChat 의 { id, nick, i }. 보여 줬으면 true.
    showRemote(ev, at) {
      const text = quickChatText(items, ev?.i);
      if (!text) return false;
      hud.say(`r-${ev.id}~c`, text, { name: ev.nick, seconds: QUICK_CHAT_SECONDS, remote: true, silent: true, at });
      return true;
    },
    close() { setOpen(false); },
    get isOpen() { return open; },
    choose,
    dispose() { button.remove(); picker.remove(); },
  };
}
