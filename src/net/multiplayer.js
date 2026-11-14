// 브라우저 전용: 멀티플레이를 게임에 붙이는 얇은 접착제. main.js 는 멀티플레이가 켜져 있을 때만 이 모듈을 불러온다.
// 전송 선택(transport.js) -> 세션(session.js) -> 다른 방문자 아바타(remotePlayers.js) + 안내 칩(netHud.js). 어떤 오류도 게임 루프로 던지지 않는다.
import { MULTIPLAYER as BASE_CFG } from '../config.js';
import { channelPrefix, numberParam } from '../env.js';
import { makeId, nickFor } from '../logic/net.js';
import { pickTransport } from './transport.js';
import { createSession } from './session.js';
import { createRemotePlayers } from '../remotePlayers.js';
import { createNetHud } from '../netHud.js';

const SEARCH = globalThis.location?.search ?? '';
// 시작할 때 한 번 읽는 시험용 주소 옵션: ?mpdev=<태그>(시험 채널), ?mpcap=<명>(방 정원)
const MULTIPLAYER = { ...BASE_CFG, channelPrefix: channelPrefix(SEARCH, BASE_CFG), roomCap: numberParam(SEARCH, 'mpcap', BASE_CFG.roomCap, 1, 50) };
const PREF_KEY = 'catch-world-mp';
const FOOTER_NOTICE = '접속 중에는 닉네임과 위치가 다른 방문자에게 공유됩니다(개인정보 아님).';

function readPref() {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}
function writePref(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* 저장소를 못 써도 이번 방문에는 동작한다 */ }
}

// ctx: { scene, camera, renderer, container(#game), gltf(캐릭터 모델 또는 null) }. 쓰지 않는 설정이면 null.
export function createMultiplayer(ctx) {
  const pick = pickTransport();
  if (!pick) return null;
  const { scene, camera, renderer, container, gltf } = ctx;
  const self = { id: makeId(), nick: '' };
  self.nick = nickFor(self.id, MULTIPLAYER.nickAdjectives, MULTIPLAYER.nickNouns);
  const footer = document.querySelector('footer');
  if (footer && !footer.textContent.includes(FOOTER_NOTICE)) footer.textContent = `${footer.textContent} ${FOOTER_NOTICE}`;

  const remotes = createRemotePlayers({ scene, container, camera, gltf, maxAvatars: MULTIPLAYER.maxRemote });
  let on = readPref();
  let session = null;
  let transport = null;
  let starting = false;
  let unsub = null;
  let warned = false;
  const hud = createNetHud(container, { enabled: on, onToggle: toggle });
  const refresh = () => hud.set({ enabled: on, status: session?.status ?? 'connecting', count: session?.count ?? 1 });

  async function start() {
    if (session || starting || !on) return;
    starting = true;
    try {
      transport ??= await pick.create();
      if (!on) return;
      session = createSession({ transport, self, cfg: MULTIPLAYER });
      unsub = session.subscribe(refresh);
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
    session?.dispose();
    session = null;
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
    // 매 프레임. local: { space, x, z, y, rotY, anim, outfit, seat }.
    update(dt, local) {
      if (!session) return;
      try {
        const now = performance.now();
        session.setActive(!document.hidden && now - lastInput < MULTIPLAYER.idleMs);
        session.update(local, now);
        remotes.update(dt, session.sample(now, local), local.space, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
      } catch (err) {
        if (!warned) { warned = true; console.warn('멀티플레이 갱신 오류', err); }
      }
    },
  };
}
