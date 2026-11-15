// 사운드 시험 페이지(sounds.html)의 스크립트: 모든 소리의 재생 버튼, 모두 재생, 음소거·볼륨, 자동 점검 표. 게임(main.js)은 불러오지 않는다.
import { sfx } from './sfx.js';
import { RECIPES, LOOPS } from './recipes.js';
import { analyzeSound, analyzeLoop } from './analyze.js';

const $ = (id) => document.getElementById(id);
const VOICES = [['leader', '팀장 목소리'], ['hr', '인사담당 목소리'], ['mentor', '예비 사수 목소리'], ['player', '내 목소리'], ['r-demo', '다른 방문자 목소리']];
// 첫 눌림에서 AudioContext 가 막 만들어지면 아직 멈춰 있을 수 있어, 돌기 시작한 뒤에 재생한다.
function whenReady(fn) {
  sfx.unlock();
  if (sfx.engine.ready) { fn(); return; }
  const off = sfx.onChange(() => { if (sfx.engine.ready) { off(); fn(); } });
}
const GAP = 0.45; // 모두 재생에서 소리 사이의 여유(초)
const PEAK_LIMIT = 0.95;
const RMS_FLOOR = 0.0015;

// 점검 표에 그릴 항목: { id, label, group, kind: 'sound'|'loop'|'special', play(), stop?(), seconds }
const items = [];
for (const [name, def] of Object.entries(RECIPES)) {
  if (name === 'speech') continue;
  items.push({ id: name, label: def.label, group: def.group, seconds: def.duration[1], play: () => sfx.play(name, { gain: 1 }) });
}
for (const [id, label] of VOICES) {
  items.push({ id: `speech:${id}`, label: `말풍선 웅얼거림 · ${label}`, group: '면접장', seconds: 0.9, play: () => sfx.speech(id, 22, { remote: false }) });
}
items.push(
  { id: 'remote-near', label: '다른 방문자 발소리 · 가까이(작게)', group: '다른 방문자', seconds: 0.3, play: () => sfx.play('stepGrass', { at: { x: 3, z: 1 }, remote: true }) },
  { id: 'remote-far', label: '다른 방문자 발소리 · 멀리(거의 안 들림)', group: '다른 방문자', seconds: 0.3, play: () => sfx.play('stepGrass', { at: { x: 16, z: 6 }, remote: true }) },
);
const loops = Object.entries(LOOPS).map(([name, def]) => ({ id: name, label: def.label, group: def.group, name }));

let timer = 0;
let playing = false;
const running = new Map(); // 반복음 이름 -> 핸들

function flash(li) {
  li.classList.add('flash');
  setTimeout(() => li.classList.remove('flash'), 350);
}

function render() {
  const groups = new Map();
  for (const it of items) (groups.get(it.group) ?? groups.set(it.group, []).get(it.group)).push(it);
  const order = ['이동', '소각장', '세탁소', '면접장', '화면', '앰비언스', '다른 방문자'];
  const root = $('groups');
  for (const group of order) {
    const list = groups.get(group) ?? [];
    const loopList = loops.filter((l) => l.group === group);
    if (!list.length && !loopList.length) continue;
    const h = document.createElement('h2');
    h.textContent = group;
    const ul = document.createElement('ul');
    for (const it of list) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="label"></span><span class="meta"></span>';
      li.querySelector('.label').innerHTML = `${it.label}<code>${it.id}</code>`;
      li.querySelector('.meta').textContent = `${it.seconds.toFixed(1)}초 이하`;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '재생';
      b.setAttribute('aria-label', `${it.label} 재생`);
      b.addEventListener('click', () => { whenReady(() => it.play()); flash(li); });
      li.append(b);
      it.li = li;
      ul.append(li);
    }
    for (const l of loopList) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="label"></span><span class="meta">반복</span>';
      li.querySelector('.label').innerHTML = `${l.label}<code>${l.name}</code>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '켜기';
      b.addEventListener('click', () => whenReady(() => {
        if (running.has(l.name)) { running.get(l.name).stop(); running.delete(l.name); b.textContent = '켜기'; b.classList.remove('on'); return; }
        const h2 = sfx.engine.startLoop(LOOPS[l.name], 1);
        if (!h2) { $('status').textContent = '소리가 아직 준비되지 않았어요. 한 번 더 눌러 주세요.'; return; }
        running.set(l.name, h2);
        b.textContent = '끄기';
        b.classList.add('on');
      }));
      li.append(b);
      ul.append(li);
    }
    root.append(h, ul);
  }
}

function stopAll() {
  clearTimeout(timer);
  playing = false;
  $('play-all').textContent = '모두 재생';
}

function playAll() {
  if (playing) return;
  playing = true;
  $('play-all').textContent = '재생 중…';
  let i = 0;
  const next = () => {
    if (!playing) return;
    if (i >= items.length) { stopAll(); return; }
    const it = items[i++];
    whenReady(() => it.play());
    flash(it.li);
    it.li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    timer = setTimeout(next, (Math.min(it.seconds, 1.6) + GAP) * 1000);
  };
  next();
}

async function analyzeAll() {
  const button = $('analyze');
  button.disabled = true;
  button.textContent = '점검 중…';
  const body = $('report').querySelector('tbody');
  body.replaceChildren();
  $('report').hidden = false;
  const add = (r, loop) => {
    const problems = [];
    if (!r.finite) problems.push('숫자 깨짐');
    if (r.peakAtMax > PEAK_LIMIT || r.peak > PEAK_LIMIT) problems.push('너무 큼');
    if (r.rms < RMS_FLOOR) problems.push('거의 무음');
    if (Math.abs(r.dc) > 0.02) problems.push('직류 치우침');
    if (!loop && r.endLevel > 0.01) problems.push('끝이 잘림');
    const tr = document.createElement('tr');
    const cells = [r.name, r.duration.toFixed(2), r.peak.toFixed(3), r.peakAtMax.toFixed(3), r.rms.toFixed(4), r.dc.toFixed(4), problems.length ? problems.join(', ') : '정상'];
    cells.forEach((text, k) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (problems.length && (k === 6)) td.className = 'bad';
      tr.append(td);
    });
    body.append(tr);
  };
  try {
    for (const name of Object.keys(RECIPES)) add(await analyzeSound(name, name === 'speech' ? { voice: 'hr', syllables: 6 } : {}), false);
    for (const name of Object.keys(LOOPS)) add(await analyzeLoop(name), true);
  } catch (err) {
    $('status').textContent = `점검 실패: ${err.message}`;
  }
  button.disabled = false;
  button.textContent = '점검 다시 실행';
}

function init() {
  render();
  const mute = $('mute');
  const volume = $('volume');
  const syncControls = () => {
    mute.checked = sfx.isMuted();
    volume.value = String(Math.round(sfx.getVolume() * 100));
    $('volume-text').textContent = `${volume.value}%`;
    $('status').textContent = !sfx.supported ? '이 브라우저는 Web Audio 를 지원하지 않아요.' : sfx.engine.ready ? '' : '아무 버튼이나 누르면 소리가 켜져요(브라우저 정책).';
  };
  sfx.onChange(syncControls);
  mute.addEventListener('change', () => sfx.setMuted(mute.checked));
  volume.addEventListener('input', () => { sfx.setVolume(Number(volume.value) / 100); });
  $('play-all').addEventListener('click', playAll);
  $('stop-all').addEventListener('click', () => { stopAll(); for (const h of running.values()) h.stop(); running.clear(); for (const b of document.querySelectorAll('button.on')) { b.classList.remove('on'); b.textContent = '켜기'; } });
  $('analyze').addEventListener('click', analyzeAll);
  syncControls();
}
init();
