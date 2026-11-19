// 오로라 불꽃의 세기(0..1) 진행 (순수). 던질 때마다 처음부터 번지고(in 초), 끝나기 전 out 초 동안 사그라든다. 중간에 또 던지면 지금 세기에서 이어서 다시 시작하고(번쩍이지 않는다),
// 불꽃을 클릭하면 지금 세기에서 returnSeconds 동안 부드럽게 원래 색으로 돌아온다(스트레스에는 아무 영향이 없다).
import { INCINERATOR } from '../config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// t 초 지난 시점의 세기: 번짐 x 사그라듦(dur 초 길이).
export function auroraEnvelope(t, dur, fade = INCINERATOR.auroraFade) {
  if (!(dur > 0) || !(t >= 0) || t >= dur) return 0;
  return clamp01(t / fade.in) * clamp01((dur - t) / fade.out);
}

export function createAuroraTint(fade = INCINERATOR.auroraFade) {
  let dur = 0;
  let t = 0;
  let amount = 0;
  let ret = null; // { from, t } 클릭해서 돌아가는 중
  return {
    get amount() { return amount; },
    get active() { return dur > 0 || ret !== null; },
    get returning() { return ret !== null; },
    // 던졌다. 지금 세기에서 이어서 번지게 시작 시각을 맞춘다.
    start(seconds) {
      if (!(seconds > 0)) { this.stop(); return; }
      dur = seconds;
      ret = null;
      t = Math.min(fade.in, amount * fade.in);
    },
    // 클릭해서 되돌리기: 켜져 있을 때만(되돌리는 중이면 아무 일 없다). 시작했으면 true.
    clear() {
      if (ret || !(amount > 0.001)) return false;
      ret = { from: amount, t: 0 };
      dur = 0;
      return true;
    },
    // 바로 끈다.
    stop() { dur = 0; t = 0; amount = 0; ret = null; },
    update(dt) {
      if (ret) {
        ret.t += dt;
        amount = ret.from * clamp01(1 - ret.t / fade.returnSeconds);
        if (ret.t >= fade.returnSeconds) { ret = null; amount = 0; }
      } else if (dur > 0) {
        t += dt;
        amount = auroraEnvelope(t, dur, fade);
        if (t >= dur) { dur = 0; amount = 0; }
      }
      return amount;
    },
  };
}
