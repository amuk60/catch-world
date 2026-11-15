// 소리 점검: 레시피를 실제 마스터 체인(압축기·마스터 볼륨·소프트 클립)에 그대로 통과시켜 오프라인으로 렌더하고 길이·최대 진폭·RMS·직류 성분·끝 잘림과 소리 성격(파고율·스펙트럼 중심·600Hz 아래 비율)을 잰다.
// 사운드 시험 페이지(sounds.html)의 "자동 점검"과 시험이 쓴다. 게임 본체는 이 모듈을 불러오지 않는다.
import { RECIPES, LOOPS } from './recipes.js';
import { FIRE } from './fireSynth.js';
import { createGraph, createNoiseBuffers, buildVoice } from './engine.js';
import { crestFactor, spectralCentroid, bandShare, spikeRatio } from './metrics.js';
import { volumeToGain, DEFAULT_VOLUME } from '../logic/audioPolicy.js';

const SAMPLE_RATE = 44100;
const START = 0.01; // 소리 시작 시각(초)
const LOOP_SECONDS = FIRE.seconds; // 반복음(모닥불)은 이만큼(되풀이 한 바퀴) 렌더한다
const SILENT = 1e-4; // 이 아래는 무음으로 본다

async function render(seconds, masterVolume, build) {
  const off = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const graph = createGraph(off, { masterGain: volumeToGain(masterVolume) });
  const noise = createNoiseBuffers(off);
  build(off, graph, noise);
  return off.startRendering();
}

// 렌더된 버퍼 -> { peak, rms, finite, dc, endLevel, activeSeconds, crest, centroid, low600, spike }. from~to(초) 구간만 잰다.
// crest: 파고율(peak/RMS), centroid: 스펙트럼 중심(Hz, 낮을수록 따뜻하다), low600: 600Hz 아래 에너지 비율, spike: 홀로 튀는 정도(클수록 틱 소리).
function measure(buffer, from, to) {
  const a = Math.floor(from * buffer.sampleRate);
  const b = Math.min(buffer.length, Math.floor(to * buffer.sampleRate));
  let peak = 0; let sum = 0; let sumSq = 0; let n = 0; let finite = true; let active = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = a; i < b; i++) {
      const v = data[i];
      if (!Number.isFinite(v)) { finite = false; continue; }
      peak = Math.max(peak, Math.abs(v));
      sum += v;
      sumSq += v * v;
      n++;
      if (c === 0 && Math.abs(v) > SILENT) active++;
    }
  }
  const last = buffer.getChannelData(0);
  let endLevel = 0;
  for (let i = Math.max(0, buffer.length - 64); i < buffer.length; i++) endLevel = Math.max(endLevel, Math.abs(last[i]));
  const seg = last.subarray(a, b);
  const rms = n ? Math.sqrt(sumSq / n) : 0;
  return {
    peak, rms, dc: n ? sum / n : 0, finite, endLevel, activeSeconds: active / buffer.sampleRate,
    crest: finite && seg.length ? crestFactor(seg) : 0,
    centroid: finite && seg.length ? spectralCentroid(seg, buffer.sampleRate) : 0,
    low600: finite && seg.length ? bandShare(seg, buffer.sampleRate, 0, 600) : 0,
    spike: finite && seg.length > 4096 ? spikeRatio(seg, buffer.sampleRate) : 0,
  };
}

// 소리 하나(이름)를 렌더해 잰다. 기본 볼륨(DEFAULT_VOLUME)과 최대 볼륨 두 번. opts 는 레시피 옵션(말소리의 voice 같은 것).
export async function analyzeSound(name, opts = {}) {
  const def = RECIPES[name];
  if (!def) throw new Error(`알 수 없는 소리: ${name}`);
  let declared = 0;
  const run = (volume) => render(def.duration[1] + 0.6, volume, (off, graph, noise) => {
    const built = buildVoice({ ctx: off, bus: graph.sfxBus, noise, rng: Math.random, run: def.run, opts: { ...def.demo, ...opts }, gain: def.gain, rate: 1, t: START });
    declared = built.duration;
  });
  const normal = await run(DEFAULT_VOLUME);
  const loud = await run(1);
  const m = measure(normal, START, START + declared + 0.1);
  const peakMax = measure(loud, START, START + declared + 0.1).peak;
  return { name, duration: declared, ...m, peakAtMax: peakMax };
}

// 반복음 하나를 LOOP_SECONDS 렌더해 잰다(되풀이 한 바퀴 전체).
export async function analyzeLoop(name) {
  const def = LOOPS[name];
  if (!def) throw new Error(`알 수 없는 반복음: ${name}`);
  const run = (volume) => render(LOOP_SECONDS + 0.3, volume, (off, graph, noise) => {
    const g = off.createGain();
    g.gain.value = def.gain;
    g.connect(graph.sfxBus);
    def.run({ ctx: off, out: g, t: 0, noise, rng: Math.random, rate: 1 }).stop(LOOP_SECONDS);
  });
  const normal = await run(DEFAULT_VOLUME);
  const loud = await run(1);
  const m = measure(normal, 0.05, LOOP_SECONDS);
  return { name, duration: LOOP_SECONDS, ...m, peakAtMax: measure(loud, 0, LOOP_SECONDS).peak };
}
