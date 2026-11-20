// 소각장·파쇄기 물건 고르기 (순수). 물건 표는 config.js 의 INCINERATOR.items(소각장: 태우기 전용)와 INCINERATOR.shredItems(파쇄기: 파쇄 전용)이고, 여기서는 행동별 목록·숫자 키·멘트·자동 선택·표 검사를 한다.
import { INCINERATOR } from '../config.js';

export const MAX_LINE_LENGTH = 32; // 말풍선이 읽기 좋도록 멘트 한 줄의 최대 글자 수
export const PICKER_ACTIONS = ['burn', 'shred']; // 선택 창을 여는 행동(세탁소 행동은 물건이 없다)
export const DOC_KINDS = ['resume', 'letter', 'mail']; // 서류 한 장(머리글·색·도장만 다른 종이 그림)

// 두 목록을 합친 전체 물건(소품을 미리 만들고 id 로 찾을 때). cfg: INCINERATOR 와 같은 모양.
export const allItems = (cfg = INCINERATOR) => [...(cfg.items ?? []), ...(cfg.shredItems ?? [])];

// 숫자 키(윗줄·숫자패드) -> 0 부터의 번호. 목록 길이 밖이거나 숫자 키가 아니면 -1.
export function pickIndexFromCode(code, count) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code ?? '');
  const i = m ? Number(m[1]) - 1 : -1;
  return i >= 0 && i < count ? i : -1;
}

// 그 행동으로 할 수 있는 물건만, 표의 순서대로(선택 창의 번호 순서).
export function itemsFor(actionId, items = allItems()) {
  return items.filter((item) => item[actionId]?.lines?.length > 0);
}

// 손동작 종류: 두툼한 물건(prop.solid: 뭉치·책·주머니)은 구기지 않고 통째로 던진다('solid'), 나머지 종이는 구겨서 던진다('paper').
export const variantOf = (item) => (item?.prop?.solid ? 'solid' : 'paper');
// 불꽃 색을 바꾸는 물건(오로라 가루)인가.
export const isFlameItem = (item) => Boolean(item?.flame?.tint);

// 멘트 목록에서 한 줄(rng: 0 이상 1 미만). 없으면 빈 글자. 세탁소(logic/laundryItems.js)도 쓴다.
export function pickLine(lines, rng = Math.random) {
  return lines?.length ? lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))] : '';
}

// 그 행동의 멘트 한 줄(rng: 0 이상 1 미만). 없으면 빈 글자.
export const lineFor = (item, actionId, rng = Math.random) => pickLine(item?.[actionId]?.lines, rng);

// 자동(R)이 고르는 물건. 태우기에서는 auroraChance 의 확률로 불꽃 색을 바꾸는 물건(오로라 가루), 아니면 나머지 중 하나. 직전 물건(lastId)은 가능하면 피한다.
export function pickRandomItem(actionId, rng = Math.random, { items = allItems(), auroraChance = INCINERATOR.auroraChance, lastId = null } = {}) {
  const all = itemsFor(actionId, items);
  const flame = all.filter(isFlameItem);
  const plain = all.filter((i) => !isFlameItem(i));
  if (flame.length && (rng() < auroraChance || !plain.length)) return flame[Math.min(flame.length - 1, Math.floor(rng() * flame.length))];
  const pool = plain.length > 1 ? plain.filter((i) => i.id !== lastId) : plain;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? null;
}

// 표 검사: 문제 목록(빈 배열이면 이상 없음). id 중복·없음, 이름 없음, 멘트 없음·길이 초과, 주머니(pouch)·교재·단어장의 파쇄, 행동이 하나도 없는 물건,
// 태우기와 파쇄를 함께 가진 물건(소각장과 파쇄기의 물건은 따로다), 머리글 없는 서류 한 장.
export function validateItems(items = allItems()) {
  const problems = [];
  const seen = new Set();
  for (const item of items) {
    const name = item?.id ?? '(id 없음)';
    if (!item?.id) problems.push(`${name}: id 가 없다`);
    else if (seen.has(item.id)) problems.push(`${name}: id 가 겹친다`);
    seen.add(item?.id);
    if (!item?.label) problems.push(`${name}: label 이 없다`);
    if (!item?.prop?.kind) problems.push(`${name}: prop.kind 가 없다`);
    if (!item?.burn && !item?.shred) problems.push(`${name}: burn 도 shred 도 없다`);
    for (const action of PICKER_ACTIONS) {
      if (!item?.[action]) continue;
      const lines = item[action].lines;
      if (!Array.isArray(lines) || lines.length === 0) problems.push(`${name}.${action}: 멘트가 없다`);
      for (const line of lines ?? []) {
        if (typeof line !== 'string' || line.trim() === '') problems.push(`${name}.${action}: 빈 멘트`);
        else if ([...line].length > MAX_LINE_LENGTH) problems.push(`${name}.${action}: 멘트가 ${MAX_LINE_LENGTH}자를 넘는다 (${line})`);
      }
    }
    if (['pouch', 'workbook', 'booklet'].includes(item?.prop?.kind) && item.shred) problems.push(`${name}: 주머니·교재·단어장은 파쇄할 수 없다(태우기 전용)`);
    if (item?.burn && item?.shred) problems.push(`${name}: burn 과 shred 를 함께 가질 수 없다(소각장 물건과 파쇄기 서류는 따로다)`);
    if (DOC_KINDS.includes(item?.prop?.kind) && !item.prop.title) problems.push(`${name}: 서류 한 장에는 prop.title(머리글)이 있어야 한다`);
  }
  return problems;
}

// 단계 이름(phase) -> 그 순간 캐릭터의 절차적 몸짓 { nod(고개 끄덕임), tilt(갸웃), lean(상체 숙임) } (라디안). k: 단계 안 진행(0~1), t: 단계 시작 뒤 초.
// 클립(팔 동작) 위에 작게 얹는다: 주머니를 뒤질 때 숙이고, 물건을 들여다보며 고개를 숙이고, 던지기 전 뒤로 젖혔다가 앞으로 숙이고, 타는 걸 보며 만족스럽게 끄덕인다.
export function poseFor(phase, k = 0, t = 0) {
  const sin = Math.sin;
  switch (phase) {
    case 'pocket': return { lean: 0.07, nod: 0.12 };
    case 'pull': return { lean: 0.05, nod: 0.2 };
    case 'look': return { nod: 0.3 * Math.min(1, k * 2) };
    case 'mutter': return { nod: 0.2, tilt: 0.07 * sin(t * 6) };
    case 'heft': return { nod: 0.25, lean: 0.1 };
    case 'crumple': return { nod: 0.3, lean: 0.12 };
    case 'throw': return k < 0.5 ? { lean: -0.2 * (k / 0.5), nod: -0.1 } : { lean: -0.2 + 0.5 * ((k - 0.5) / 0.5), nod: 0.1 };
    case 'fly': return { lean: 0.14, nod: 0.05 };
    case 'watch': case 'settle': return { nod: 0.06 + 0.08 * sin(t * 3.4), tilt: 0.04 * sin(t * 1.7) };
    case 'relief': return { nod: -0.1 * Math.min(1, k * 3), lean: -0.05 };
    case 'place': return { lean: 0.1, nod: 0.12 };
    case 'feed': return { lean: 0.13, nod: 0.18 + 0.03 * sin(t * 30) };
    default: return {};
  }
}
