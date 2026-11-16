// 세탁소 "빨 것" 고르기 (순수). 표는 config.js 의 LAUNDRY_ITEMS 이고, 여기서는 멘트·자동 선택·표 검사를 한다.
// 숫자 키 매핑(pickIndexFromCode)과 멘트 길이 한도·한 줄 고르기는 소각장(logic/incinerator.js)과 같은 것을 쓴다.
import { LAUNDRY_ITEMS, LAUNDRY_HANG } from '../config.js';
import { MAX_LINE_LENGTH, pickIndexFromCode, pickLine } from './incinerator.js';

export { pickIndexFromCode };
export const ICON_KINDS = ['smell', 'grime', 'sweat', 'ink', 'dust']; // 선택 창 그림 종류(laundryFx.js 의 buildStainIcon)
export const MAX_DISPLAY_LENGTH = 14; // 세탁기 LED 에 한 줄로 읽히는 표시 글의 최대 글자 수(점·퍼센트는 따로)

// 세탁을 시작하며 하는 한마디(rng: 0 이상 1 미만).
export const washLine = (item, rng = Math.random) => pickLine(item?.lines, rng);
// 널기 한마디.
export const hangLine = (rng = Math.random, hang = LAUNDRY_HANG) => pickLine(hang?.lines, rng);

// 자동(R)이 고르는 빨 것: 직전(lastId)은 가능하면 피한다.
export function pickRandomStain(rng = Math.random, { items = LAUNDRY_ITEMS, lastId = null } = {}) {
  const pool = items.length > 1 ? items.filter((i) => i.id !== lastId) : items;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? null;
}

// 안내 문구에 쓸 이름({item} 자리). 빨 것이 없으면 null.
export const stainName = (item) => item?.label ?? null;

// 표 검사: 문제 목록(빈 배열이면 이상 없음). id 중복·없음, 이름·표시 글·마무리 멘트 없음, 멘트 3~4개·길이 초과, 그림 종류.
export function validateLaundryItems(items = LAUNDRY_ITEMS, hang = LAUNDRY_HANG) {
  const problems = [];
  const seen = new Set();
  const checkLine = (name, line) => {
    if (typeof line !== 'string' || line.trim() === '') problems.push(`${name}: 빈 멘트`);
    else if ([...line].length > MAX_LINE_LENGTH) problems.push(`${name}: 멘트가 ${MAX_LINE_LENGTH}자를 넘는다 (${line})`);
  };
  for (const item of items) {
    const name = item?.id ?? '(id 없음)';
    if (!item?.id) problems.push(`${name}: id 가 없다`);
    else if (seen.has(item.id)) problems.push(`${name}: id 가 겹친다`);
    seen.add(item?.id);
    if (!item?.label) problems.push(`${name}: label 이 없다`);
    if (!item?.display) problems.push(`${name}: display(세탁기 표시 글)가 없다`);
    else if ([...item.display].length > MAX_DISPLAY_LENGTH) problems.push(`${name}: display 가 ${MAX_DISPLAY_LENGTH}자를 넘는다`);
    if (!Array.isArray(item?.lines) || item.lines.length < 3 || item.lines.length > 4) problems.push(`${name}: 멘트는 3~4개여야 한다`);
    for (const line of item?.lines ?? []) checkLine(`${name}.lines`, line);
    checkLine(`${name}.done`, item?.done);
    if (!ICON_KINDS.includes(item?.icon?.kind)) problems.push(`${name}: icon.kind 가 없거나 모른다`);
  }
  if (!Array.isArray(hang?.lines) || hang.lines.length < 3 || hang.lines.length > 4) problems.push('hang: 멘트는 3~4개여야 한다');
  for (const line of hang?.lines ?? []) checkLine('hang.lines', line);
  if (items.length < 1 || items.length > 9) problems.push('빨 것은 1~9개(숫자 키 1~9)');
  return problems;
}
