// 브라우저 전용: 멀티플레이를 게임에 붙이는 얇은 접착제. main.js 는 멀티플레이가 켜져 있을 때만 이 모듈을 불러온다.
// 전송 선택(transport.js) -> 세션(session.js) -> 다른 방문자 아바타(remotePlayers.js) + 안내 칩(netHud.js). 어떤 오류도 게임 루프로 던지지 않는다.
import { MULTIPLAYER as BASE_CFG, INTERVIEW, QUICK_CHAT } from '../config.js';
import { channelPrefix, numberParam } from '../env.js';
import { makeId } from '../logic/net.js';
import { validateNick, suggestNickFor } from '../logic/nick.js';
import { loadNick, saveNick, wasAsked, markAsked, createNickCard } from '../nickCard.js';
import { IMPROV_IDS } from '../logic/interview.js';
import { buildLaundryInterior } from '../logic/interiors.js';
import { pickTransport } from './transport.js';
import { createSession } from './session.js';
import { createRemotePlayers } from '../remotePlayers.js';
import { createNetHud } from '../netHud.js';

const SEARCH = globalThis.location?.search ?? '';
// 시작할 때 한 번 읽는 시험용 주소 옵션: ?mpdev=<태그>(시험 채널), ?mpcap=<명>(방 정원)
const MULTIPLAYER = { ...BASE_CFG, channelPrefix: channelPrefix(SEARCH, BASE_CFG), roomCap: numberParam(SEARCH, 'mpcap', BASE_CFG.roomCap, 1, 50) };
// 면접 답변·돌발행동 한마디를 받을 때의 허용 범위(내 설정의 질문 수·답변 수·돌발행동 id). 이 밖의 값은 버린다.
const SAY_LIMITS = { questions: INTERVIEW.questions.length, answers: Math.max(...INTERVIEW.questions.map((q) => q.answers.length)), improvs: [...IMPROV_IDS] };
// 세탁소 빨랫줄·세탁기 효과 메시지의 허용 범위(칸 수·공용 칸 수·세탁기 수는 세탁소 데이터에서).
const LAUNDRY = buildLaundryInterior();
const ROOM_LIMITS = { slots: LAUNDRY.clothesline.slots, shared: LAUNDRY.clothesline.shared, washers: LAUNDRY.washers.length };
// 인사·응원말 프리셋을 받을 때의 허용 범위(내 QUICK_CHAT 개수). 이 밖의 번호는 버린다.
const CHAT_LIMITS = { count: QUICK_CHAT.length };
const PREF_KEY = 'catch-world-mp';
const FOOTER_NOTICE = '접속 중에는 닉네임과 위치가 다른 방문자에게 공유됩니다(개인정보 아님).';

function readPref() {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}
function writePref(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* 저장소를 못 써도 이번 방문에는 동작한다 */ }
}

// ctx: { scene, camera, renderer, container(#game), gltf(캐릭터 모델 또는 null), id(선택: 내 방문자 id. 빨랫줄 소유자 표시와 같게 맞출 때) }. 쓰지 않는 설정이면 null.
export function createMultiplayer(ctx) {
  const pick = pickTransport();
  if (!pick) return null;
  const { scene, camera, renderer, container, gltf } = ctx;
  const self = { id: ctx.id ?? makeId(), nick: '' };
  self.nick = loadNick() ?? suggestNickFor(self.id, MULTIPLAYER.nickAdjectives, MULTIPLAYER.nickNouns); // 저장된 내 닉네임, 없으면 id 로 만든 무작위 추천(10자 이하)
  const footer = document.querySelector('footer');
  if (footer && !footer.textContent.includes(FOOTER_NOTICE)) footer.textContent = `${footer.textContent} ${FOOTER_NOTICE}`;

  const remotes = createRemotePlayers({ scene, container, camera, gltf, maxAvatars: MULTIPLAYER.maxRemote });
  let on = readPref();
  let session = null;
  let transport = null;
  let starting = false;
  let unsub = null;
  let warned = false;
  let lastList = []; // 마지막으로 그린 방문자들(보간된 위치·seat 여부: 좌석 점유 판정과 말풍선 위치에 쓴다)
  const roomHandlers = new Set(); // 세탁소 메시지 구독
  let roomUnsub = null;
  const chatHandlers = new Set(); // 인사·응원말 구독
  let chatUnsub = null;
  const sayHandlers = new Set(); // 한마디 구독(세션이 다시 만들어져도 유지한다)
  let sayUnsub = null;
  const hud = createNetHud(container, { enabled: on, onToggle: toggle, nick: self.nick, onNick: () => nickCard.isOpen ? nickCard.close() : nickCard.open(self.nick) });
  // 닉네임 정하기 카드: 처음 방문이면 한 번 자동으로 띄운다("나중에 정하기"를 누르면 다시 묻지 않는다). 이름 칩을 누르면 언제든 다시 연다.
  const nickCard = createNickCard(container, {
    adjectives: MULTIPLAYER.nickAdjectives, nouns: MULTIPLAYER.nickNouns,
    onSubmit: (nick) => setNick(nick),
    onLater: () => markAsked(),
  });
  const refresh = () => hud.set({ enabled: on, status: session?.status ?? 'connecting', count: session?.count ?? 1 });

  // 내 닉네임을 바꾼다(검사를 통과해야 한다). 저장하고 곧바로 다른 방문자에게 알린다. 반환: 바꿨는가.
  function setNick(raw) {
    const v = validateNick(raw);
    if (!v.ok) return false;
    self.nick = v.nick;
    saveNick(v.nick);
    hud.setNick(v.nick);
    session?.announce();
    return true;
  }
  if (!loadNick() && !wasAsked()) nickCard.open(self.nick, { first: true });

  async function start() {
    if (session || starting || !on) return;
    starting = true;
    try {
      transport ??= await pick.create();
      if (!on) return;
      session = createSession({ transport, self, cfg: MULTIPLAYER, sayLimits: SAY_LIMITS, roomLimits: ROOM_LIMITS, chatLimits: CHAT_LIMITS });
      unsub = session.subscribe(refresh);
      sayUnsub = session.onSay((ev) => { for (const fn of sayHandlers) fn(ev); });
      roomUnsub = session.onRoom((ev) => { for (const fn of roomHandlers) fn(ev); });
      chatUnsub = session.onChat((ev) => { for (const fn of chatHandlers) fn(ev); });
    } catch (err) {
      console.warn('멀티플레이를 시작하지 못했습니다.', err);
      session = null;
    } finally {
      starting = false;
      refresh();
    }
  }

  function stop() {
    unsub?.();
    unsub = null;
    sayUnsub?.();
    sayUnsub = null;
    roomUnsub?.();
    roomUnsub = null;
    chatUnsub?.();
    chatUnsub = null;
    session?.dispose();
    session = null;
    lastList = [];
    remotes.clear();
  }

  function toggle() {
    on = !on;
    writePref(on);
  if (on) start();
    else stop();
    refresh();
  }

  // 숨김·유휴(입력 없음 idleMs 이상)이면 상태 전송을 멈춘다(연결은 유지). 돌아오면 곧바로 재개.
  let lastInput = performance.now();
  const touch = () => { lastInput = performance.now(); };
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel']) window.addEventListener(ev, touch, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) touch();
    session?.setActive(!document.hidden);
  });
  window.addEventListener('pagehide', () => { try { session?.dispose(); } catch { /* 무시 */ } });
  if (on) start();

  return {
    self,
    get session() { return session; },
    // 다른 방문자 보기가 켜져 있고 연결되어 있는가(꺼져 있으면 다른 방문자의 효과음도 모두 끈다).
    get enabled() { return on && session !== null; },
    // 지금 그려지는 다른 방문자들 [{ id, nick, x, y, z, seat, ... }](연결이 없으면 빈 목록).
    get remotes() { return lastList; },
    // 내 한마디 보내기({ ty:'ans', q, a } | { ty:'imp', imp }). 보냈으면 true.
    say(msg) { return session ? session.say(msg) : false; },
    // 내 인사·응원말 보내기(프리셋 번호만). 보냈으면 true. 다른 방문자의 것은 onChat(fn) 으로 받는다(fn({ id, nick, i })).
    chat(i) { return session ? session.chat(i) : false; },
    onChat(fn) { chatHandlers.add(fn); return () => chatHandlers.delete(fn); },
    // 닉네임 바꾸기(검사 통과해야 함). 지금 닉네임은 self.nick.
    setNick,
    openNickCard() { nickCard.open(self.nick); },
    // 세탁소 메시지 보내기: { k:'line', slot, c, t } | { k:'lines', e } | { k:'fx', i }. 보냈으면 true. 다른 방문자의 것은 onRoom(fn) 으로 받는다(fn({ k, id, ... })).
    sendRoom(msg) { return session ? session.sendRoom(msg) : false; },
    onRoom(fn) { roomHandlers.add(fn); return () => roomHandlers.delete(fn); },
    // 다른 방문자의 한마디 구독: fn({ id, nick, ty, q, a, imp }). 해제 함수를 돌려준다.
    onSay(fn) { sayHandlers.add(fn); return () => sayHandlers.delete(fn); },
    // 매 프레임. local: { space, x, z, y, rotY, anim, outfit, seat }.
    update(dt, local) {
      if (!session) { lastList = []; return; }
      try {
        const now = performance.now();
        session.setActive(!document.hidden && now - lastInput < MULTIPLAYER.idleMs);
        session.update(local, now);
        lastList = session.sample(now, local);
        remotes.update(dt, lastList, local.space, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
      } catch (err) {
        if (!warned) { warned = true; console.warn('멀티플레이 갱신 오류', err); }
      }
    },
  };
}
