// 모닥불 소리 파일(assets/audio/fire.mp3)을 불러와 이음매 없이 되풀이하는 표본으로 바꾼다.
// 파일이 없거나 불러오기·해독에 실패하면 아무 일도 없고, 소각로는 코드로 합성한 모닥불 소리(fireSynth.js)를 그대로 쓴다.
// 소리 파일을 바꾸려면 assets/audio/fire.mp3 를 같은 이름으로 덮어쓰면 된다(길이 30초~2분, 2MB 안팎 권장). 크기는 FIRE_FILE.gain 으로 맞춘다.

export const FIRE_FILE = {
  url: 'assets/audio/fire.mp3',
  gain: 2.0, // 파일 소리의 크기 배율(합성 모닥불은 LOOPS.fire.gain 만 쓴다). 너무 작으면 올리고, 타닥임이 너무 크면 내린다.
  crossfadeSeconds: 2.5, // 끝과 처음을 이렇게 겹쳐서 이어 붙인다(mp3 되풀이의 "툭" 하는 틈을 없앤다)
};

// 순수: 채널별 표본 배열을 받아 끝 xf 개와 처음 xf 개를 같은 힘으로 겹친 되풀이용 표본(길이 n - xf)을 만든다.
// 되풀이하면 마지막 표본(in[n-xf-1]) 다음에 처음 표본(in[n-xf]에서 이어지는 값)이 오므로 끊기지 않는다.
export function makeLoopData(channels, crossfadeSamples) {
  if (!Array.isArray(channels) || channels.length === 0) return null;
  const n = channels[0].length;
  const xf = Math.max(0, Math.min(Math.floor(crossfadeSamples) || 0, Math.floor(n / 2) - 1));
  const len = n - xf;
  if (len < 1) return null;
  return channels.map((src) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      if (i < xf) {
        const t = (i + 0.5) / xf; // 0 -> 1
        out[i] = src[i] * Math.sin((t * Math.PI) / 2) + src[len + i] * Math.cos((t * Math.PI) / 2);
      } else {
        out[i] = src[i];
      }
    }
    return out;
  });
}

const state = { buffer: null, status: 'idle', listeners: new Set() }; // status: idle | loading | ready | failed

export const fireFile = {
  get buffer() { return state.buffer; },
  get status() { return state.status; },
  onLoaded(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); },
};

// 컨텍스트가 만들어진 뒤 한 번 부른다. 중복 호출은 무시한다. 어떤 실패도 던지지 않는다.
export async function loadFireFile(ctx, fetchFn = globalThis.fetch, url = FIRE_FILE.url) {
  if (state.status !== 'idle' || !ctx || typeof fetchFn !== 'function') return false;
  state.status = 'loading';
  try {
    const res = await fetchFn(url);
    if (!res || !res.ok) throw new Error(`fire file ${res ? res.status : 'no response'}`);
    const encoded = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(encoded);
    const channels = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    const loop = makeLoopData(channels, Math.round(FIRE_FILE.crossfadeSeconds * decoded.sampleRate));
    if (!loop) throw new Error('fire file empty');
    const buffer = ctx.createBuffer(loop.length, loop[0].length, decoded.sampleRate);
    loop.forEach((data, c) => buffer.getChannelData(c).set(data));
    state.buffer = buffer;
    state.status = 'ready';
    for (const fn of state.listeners) { try { fn(buffer); } catch { /* 듣는 쪽의 오류는 무시 */ } }
    return true;
  } catch {
    state.status = 'failed';
    return false;
  }
}

// 시험용: 상태를 처음으로 돌린다.
export function resetFireFile() { state.buffer = null; state.status = 'idle'; state.listeners.clear(); }
