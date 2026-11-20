// 브라우저 전용: 마당 자연 소리(새소리·풀벌레·바람결). 배경음악이 아니라 마당에서만 아주 작게 깔리는 소리다.
// 효과음 엔진(audio/engine.js) 위에 자연 소리 버스 하나(크기 = logic/ambient.js 의 ambientLevel)를 두고, 드문드문 레시피(audio/recipes.js)를 낸다.
// - 소리 끔(M)·실내·불멍·탭 숨김(엔진이 멈춘 동안)에서는 아무 소리도 만들지 않는다. 버스가 다 잦아들면 바람결도 멈춘다.
// - 어떤 호출도 던지지 않는다(소리 오류가 게임 루프를 멈추면 안 된다).
// update(dt, { space, listener, firePos, meditating, sky }) 를 매 프레임 부른다(sky: logic/skyCycle.js 의 skyAt 결과).
import { RECIPES, LOOPS } from './recipes.js';
import { buildVoice } from './engine.js';
import { ambientLevel, createAmbientScheduler } from '../logic/ambient.js';
import { stepFade, varied } from '../logic/audioPolicy.js';
import { AMBIENT } from '../config.js';

const OFF = 0.002; // 버스가 이보다 작고 목표가 0 이면 바람결을 멈춘다
const PAN = 0.6; // 새소리·풀벌레는 좌우 이쪽저쪽에서(무작위)

export function createAmbient(engine, cfg = AMBIENT) {
  const scheduler = createAmbientScheduler(cfg, Math.random);
  let bus = null;
  let level = 0;
  let wind = null;
  let failed = false;
  let played = 0;
  let applied = -1; // 버스에 마지막으로 지정한 크기(조금 바뀔 때마다 다시 지정하지 않는다)
  const setBus = (v) => {
    if (!bus || Math.abs(v - applied) < 0.002) return;
    bus.gain.setTargetAtTime(v, engine.now, 0.1);
    applied = v;
  };

  const ensureBus = () => {
    if (bus) return bus;
    const ctx = engine.context;
    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(engine.graph.sfxBus);
    return bus;
  };
  const stopWind = () => {
    if (!wind) return;
    try { wind.stop(engine.now + 0.3); } catch { /* 이미 멈췄다 */ }
    const g = wind.gain;
    setTimeout(() => { try { g.disconnect(); } catch { /* 이미 끊겼다 */ } }, 600);
    wind = null;
  };
  const startWind = () => {
    if (wind || !cfg.wind?.enabled) return;
    const ctx = engine.context;
    const g = ctx.createGain();
    g.gain.value = LOOPS.wind.gain * (cfg.wind.level ?? 1);
    g.connect(bus);
    const handle = LOOPS.wind.run({ ctx, out: g, t: ctx.currentTime, noise: engine.noise, rng: engine.rng, rate: 1 });
    wind = { stop: (at) => handle.stop(at), gain: g };
  };
  const playOne = (name, gain) => {
    const def = RECIPES[name];
    if (!def) return;
    const ctx = engine.context;
    const built = buildVoice({
      ctx, bus, noise: engine.noise, rng: engine.rng, run: def.run, opts: {},
      gain: gain * def.gain * varied(1, def.jitter.gain, Math.random),
      pan: (Math.random() * 2 - 1) * PAN, rate: varied(1, def.jitter.pitch, Math.random),
    });
    played++;
    setTimeout(() => { try { built.out.disconnect(); built.panner?.disconnect(); } catch { /* 이미 끊겼다 */ } }, (built.duration + 0.5) * 1000);
  };

  return {
    get stats() { return { level: +level.toFixed(3), wind: Boolean(wind), played, failed }; },
    update(dt, { space, listener, firePos, meditating, sky }) {
      if (failed || !cfg.enabled) return;
      try {
        if (!engine.ready) return; // 첫 입력 전이거나 탭이 숨겨져 멈춘 동안
        const fireDistance = firePos && listener ? Math.hypot(firePos.x - listener.x, firePos.z - listener.z) : Infinity;
        const target = ambientLevel({ space, muted: engine.muted, meditating, fireDistance }, cfg);
        level = stepFade(level, target, dt, cfg.fadeSeconds);
        if (target === 0 && level < OFF) {
          setBus(0);
          stopWind();
          level = 0;
          return;
        }
        ensureBus();
        setBus(level);
        startWind();
        // 소리 끔·실내·불멍으로 꺼지는 중에는 새 소리를 만들지 않는다(일정표 시간도 멈춘다).
        for (const e of scheduler.step(dt, sky, target > 0 && engine.canPlay)) playOne(e.name, e.gain);
      } catch (err) {
        failed = true;
        stopWind();
        console.warn('마당 자연 소리 오류(자연 소리만 꺼집니다)', err);
      }
    },
  };
}
