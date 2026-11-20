import test from 'node:test';
import assert from 'node:assert/strict';
import { INCINERATOR } from '../src/config.js';
import { itemsFor, allItems, DOC_KINDS, pickIndexFromCode, variantOf, isFlameItem, lineFor, pickRandomItem, validateItems, poseFor, MAX_LINE_LENGTH } from '../src/logic/incinerator.js';
import { nextMode, canWalk, showPrompt, holdsSeat } from '../src/logic/playerMode.js';
import { ANIMS } from '../src/logic/net.js';
import { ACTIONS } from '../src/logic/actions.js';

const items = INCINERATOR.items; // 소각장(태우기 전용)
const docs = INCINERATOR.shredItems; // 파쇄기(파쇄 전용)
const every = [...items, ...docs];
const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; }; // 정해진 난수열

test('물건 표: 5종이고 순서는 자소서·이력서 뭉치·불합격 통지서·인적성 교재·취업 잔소리 쪽지·오로라 가루(면접 탈락 메일은 없다)', () => {
  assert.deepEqual(items.map((i) => i.id), ['resume', 'notice', 'workbook', 'nag', 'aurora']);
  assert.deepEqual(items.map((i) => i.label), ['자소서·이력서 뭉치', '불합격 통지서', '인적성 검사 교재', '취업 잔소리 쪽지', '오로라 가루']);
  assert.ok(!items.some((i) => ['cover', 'mail'].includes(i.id)));
});

test('물건 표 검사: 현재 config 는 문제가 없다(두 목록 전체에서 id 중복 없음, 멘트 3~5개, 길이 이하, 주머니·교재·단어장은 파쇄 없음)', () => {
  assert.deepEqual(validateItems(every), []);
  assert.deepEqual(validateItems(), []); // 기본값은 두 목록을 합친 것
  const ids = every.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of every) {
    for (const action of ['burn', 'shred']) {
      if (!item[action]) continue;
      assert.ok(item[action].lines.length >= 3 && item[action].lines.length <= 5, `${item.id}.${action} 멘트 3~5개`);
      for (const line of item[action].lines) assert.ok(line.trim() && [...line].length <= MAX_LINE_LENGTH, `${item.id}.${action}: ${line}`);
    }
  }
});

test('소각장과 파쇄기는 물건이 겹치지 않는다: 소각장 물건은 태우기만, 파쇄기 서류는 파쇄만', () => {
  for (const item of items) { assert.ok(item.burn, item.id); assert.equal(item.shred, undefined, item.id); }
  for (const doc of docs) { assert.ok(doc.shred, doc.id); assert.equal(doc.burn, undefined, doc.id); }
  const labels = new Set(items.map((i) => i.label));
  for (const doc of docs) assert.ok(!labels.has(doc.label), doc.label);
  assert.deepEqual(allItems().map((i) => i.id), every.map((i) => i.id));
});

test('파쇄기 서류 5종: 취준생이 갈아 버리고 싶은 서류 한 장들(기존 종이 kind 재사용, 머리글·색·도장만 다르다)', () => {
  assert.deepEqual(docs.map((d) => d.id), ['app_copy', 'eval_sheet', 'spec_sheet', 'wrong_notes', 'job_post']);
  assert.deepEqual(docs.map((d) => d.label), ['지원서 출력 사본', '탈락 면접 평가표', '스펙 정리표·증명서 사본', '인적성 오답 노트 출력본', '마감 지난 채용공고 스크랩']);
  for (const doc of docs) {
    assert.ok(DOC_KINDS.includes(doc.prop.kind), doc.id);
    assert.ok(doc.prop.title && /^#[0-9a-f]{6}$/i.test(doc.prop.accent), doc.id);
    assert.notEqual(doc.prop.solid, true, `${doc.id}: 종이 한 장`);
  }
  assert.equal(new Set(docs.map((d) => d.prop.title)).size, docs.length, '머리글이 서로 다르다');
});

test('자소서·이력서 뭉치: 하나로 합쳐졌고 하기 싫은 걸 없애는 멘트(자소설, 수정, 다시 쓰기)가 있다', () => {
  const resume = items[0];
  assert.equal(resume.burn.lines[0], '매번 고치고 새로 지어내는 것도 힘들다, 잠깐 쉴게');
  assert.ok(resume.burn.lines.some((l) => /다시 쓰라고/.test(l)) && resume.burn.lines.some((l) => /자소설 쓰느라/.test(l)));
  assert.ok(resume.burn.lines.length >= 4);
  assert.ok(resume.burn.lines.some((l) => /자소설/.test(l)));
  assert.equal(resume.shred, undefined, '파쇄는 파쇄기 서류만');
  assert.equal(resume.prop.solid, true);
});

test('물건 표 검사: 잘못된 표는 문제를 알려 준다', () => {
  const ok = { id: 'a', label: 'A', burn: { lines: ['안녕'] }, prop: { kind: 'stack' } };
  assert.deepEqual(validateItems([ok]), []);
  assert.ok(validateItems([ok, { ...ok }]).some((p) => /겹친다/.test(p)));
  assert.ok(validateItems([{ ...ok, id: '' }]).some((p) => /id/.test(p)));
  assert.ok(validateItems([{ ...ok, burn: { lines: [] } }]).some((p) => /멘트가 없다/.test(p)));
  assert.ok(validateItems([{ ...ok, burn: { lines: ['가'.repeat(MAX_LINE_LENGTH + 1)] } }]).some((p) => /넘는다/.test(p)));
  assert.ok(validateItems([{ ...ok, burn: { lines: [' '] } }]).some((p) => /빈 멘트/.test(p)));
  assert.ok(validateItems([{ ...ok, burn: undefined }]).some((p) => /burn 도 shred 도 없다/.test(p)));
  for (const kind of ['pouch', 'workbook', 'booklet']) assert.ok(validateItems([{ ...ok, prop: { kind }, shred: { lines: ['안녕'] } }]).some((p) => /파쇄할 수 없다/.test(p)), kind);
  assert.ok(validateItems([{ ...ok, shred: { lines: ['안녕'] } }]).some((p) => /함께 가질 수 없다/.test(p)));
  assert.ok(validateItems([{ id: 'd', label: 'D', shred: { lines: ['안녕'] }, prop: { kind: 'letter' } }]).some((p) => /머리글/.test(p)));
  assert.deepEqual(validateItems([{ id: 'd', label: 'D', shred: { lines: ['안녕'] }, prop: { kind: 'letter', title: '문서' } }]), []);
});

test('선택 창 목록: 태우기는 소각장 물건 5종, 파쇄는 파쇄기 서류 5종(표의 순서 그대로, 서로 겹치지 않음)', () => {
  assert.deepEqual(itemsFor('burn').map((i) => i.id), ['resume', 'notice', 'workbook', 'nag', 'aurora']);
  assert.deepEqual(itemsFor('shred').map((i) => i.id), ['app_copy', 'eval_sheet', 'spec_sheet', 'wrong_notes', 'job_post']);
  assert.deepEqual(itemsFor('shred', items), []); // 소각장 물건은 파쇄 목록에 없다
  assert.deepEqual(itemsFor('burn', docs), []); // 파쇄기 서류는 태우기 목록에 없다
  assert.deepEqual(itemsFor('wash'), []); // 세탁소 행동에는 물건 목록이 없다
});

test('숫자 키 1~6: 목록 길이 안이면 0 부터의 번호, 밖이거나 다른 키면 -1(윗줄·숫자패드 모두)', () => {
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].forEach((code, i) => assert.equal(pickIndexFromCode(code, 5), i, code));
  ['Numpad1', 'Numpad5'].forEach((code, i) => assert.equal(pickIndexFromCode(code, 5), [0, 4][i]));
  assert.equal(pickIndexFromCode('Digit4', 3), -1, '3종 목록에서 4 는 없다');
  assert.equal(pickIndexFromCode('Digit5', itemsFor('shred').length), 4, '파쇄(5종)에서 5 는 마지막 서류');
  assert.equal(pickIndexFromCode('Digit3', 3), 2);
  for (const code of ['Digit0', 'Digit6', 'KeyA', 'Escape', 'Space', '', undefined]) assert.equal(pickIndexFromCode(code, 5), -1, String(code));
});

test('취소 규칙: Esc 는 번호가 아니므로 고르기로 취급되지 않는다(취소는 playerMode 의 pick:cancel)', () => {
  assert.equal(pickIndexFromCode('Escape', 5), -1);
});

test('멘트: 그 행동의 멘트 중 하나(rng 로 고른다), 없으면 빈 글자', () => {
  const resume = items[0];
  assert.equal(lineFor(resume, 'burn', () => 0), '매번 고치고 새로 지어내는 것도 힘들다, 잠깐 쉴게');
  assert.equal(lineFor(docs[0], 'shred', () => 0), '출력만 하고 못 낸 지원서, 안녕~');
  assert.equal(lineFor(resume, 'shred'), '', '소각장 물건에는 파쇄 멘트가 없다');
  assert.equal(lineFor(items[3], 'burn', () => 0), '힘 빠지는 잔소리는 프리패스! 응원만 받을게요');
  assert.equal(lineFor(resume, 'burn', () => 0.999999), resume.burn.lines.at(-1));
  assert.equal(lineFor(items[5], 'shred'), '');
  assert.equal(lineFor(undefined, 'burn'), '');
  for (const item of every) for (const action of ['burn', 'shred']) if (item[action]) assert.ok(item[action].lines.includes(lineFor(item, action)));
});

test('손동작 종류: 두툼한 물건(뭉치·교재·주머니)은 통째로 던지기(solid), 종이(통지서·쪽지·파쇄기 서류)는 구겨 던지기(paper)', () => {
  assert.deepEqual(items.map(variantOf), ['solid', 'paper', 'solid', 'paper', 'solid']);
  assert.deepEqual(docs.map(variantOf), ['paper', 'paper', 'paper', 'paper', 'paper']);
  for (const item of items) assert.ok(ACTIONS.burn.variants[variantOf(item)] || variantOf(item) === 'paper');
});

test('오로라 가루: 주머니(pouch)이고 불꽃 색을 바꾼다(태우기 전용)', () => {
  const aurora = items.find((i) => i.id === 'aurora');
  assert.equal(aurora.prop.kind, 'pouch');
  assert.equal(aurora.flame.tint, 'aurora');
  assert.equal(isFlameItem(aurora), true);
  assert.equal(items.filter(isFlameItem).length, 1);
});

test('자동 선택: 파쇄 차례에는 파쇄기 서류만 나오고 소각장 물건(오로라 포함)은 절대 나오지 않는다', () => {
  const ids = docs.map((d) => d.id);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const id = pickRandomItem('shred', Math.random, { auroraChance: 1 }).id; assert.ok(ids.includes(id), id); seen.add(id); }
  assert.equal(seen.size, docs.length, '서류 5종이 모두 나온다');
  for (let i = 0; i < 500; i++) { const id = pickRandomItem('burn').id; assert.ok(items.some((it) => it.id === id), '태우기는 소각장 물건만'); }
});

test('자동 선택: 태우기 차례에는 auroraChance 확률로만 오로라 가루(0 이면 절대 안 나오고 1 이면 항상)', () => {
  for (let i = 0; i < 500; i++) {
    assert.notEqual(pickRandomItem('burn', Math.random, { items, auroraChance: 0 }).id, 'aurora');
    assert.equal(pickRandomItem('burn', Math.random, { items, auroraChance: 1 }).id, 'aurora');
  }
  let aurora = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (pickRandomItem('burn', Math.random, { items }).id === 'aurora') aurora++;
  assert.ok(aurora / N > 0.05 && aurora / N < 0.2, `기본 확률 ${INCINERATOR.auroraChance}: ${aurora / N}`); // 가끔(드물게)
});

test('자동 선택: 직전 물건은 가능하면 피하고(고를 물건이 둘 이상일 때), 난수로 고르면 결정적이다', () => {
  for (let i = 0; i < 500; i++) assert.notEqual(pickRandomItem('shred', Math.random, { lastId: 'app_copy' }).id, 'app_copy');
  assert.equal(pickRandomItem('shred', seq(0)).id, 'app_copy'); // 파쇄에는 오로라 판정이 없어 첫 난수가 고르기
  assert.equal(pickRandomItem('shred', seq(0.999)).id, 'job_post');
  assert.equal(pickRandomItem('burn', seq(0.99, 0), { items }).id, 'resume'); // 태우기: 첫 난수는 오로라 판정(0.99 >= 확률 이라 일반), 둘째가 고르기
  const onlyOne = [docs[0], items[4]];
  assert.equal(pickRandomItem('shred', Math.random, { items: onlyOne, lastId: 'app_copy' }).id, 'app_copy'); // 하나뿐이면 어쩔 수 없다
  assert.equal(pickRandomItem('shred', Math.random, { items: [items[4]] }), null);
});

test('몸짓: 단계마다 작은 각도(라디안)이고, 들여다볼 때 고개를 숙이고 던지기 전엔 뒤로 젖혔다가 앞으로 숙인다', () => {
  for (const phase of ['pocket', 'pull', 'look', 'mutter', 'heft', 'crumple', 'throw', 'fly', 'watch', 'relief', 'place', 'feed', 'settle']) {
    for (const k of [0, 0.5, 1]) for (const t of [0, 0.7]) {
      const p = poseFor(phase, k, t);
      for (const v of Object.values(p)) assert.ok(Math.abs(v) < 0.45, `${phase} ${JSON.stringify(p)}`);
    }
  }
  assert.ok(poseFor('look', 1).nod > 0.2);
  assert.ok(poseFor('throw', 0.5).lean < -0.1);
  assert.ok(poseFor('throw', 1).lean > 0.1);
  assert.ok(poseFor('relief', 1).nod < 0, '후련: 고개를 든다');
  assert.deepEqual(poseFor('turn'), {});
  assert.deepEqual(poseFor('nope'), {});
});

// ---- 플레이어 모드: 선택 창이 열려 있는 동안 ----
test('모드: free 에서 pick:open 하면 item-choice, 거기서 cancel/choose 하면 free 로 돌아온다', () => {
  assert.equal(nextMode('free', 'pick:open'), 'item-choice');
  assert.equal(nextMode('item-choice', 'pick:cancel'), 'free');
  assert.equal(nextMode('item-choice', 'pick:choose'), 'free');
});

test('모드: item-choice 에서는 걷기·E 안내·앉기·다른 전이가 모두 잠긴다(표에 없는 이벤트는 그대로)', () => {
  assert.equal(canWalk('item-choice'), false);
  assert.equal(showPrompt('item-choice'), false);
  assert.equal(holdsSeat('item-choice'), false);
  for (const event of ['move', 'interact', 'interact:seat', 'interact:fortune', 'close', 'open:result', 'transition:start', 'wear:start', 'interview:open', 'pick:open', 'transition:end']) {
    assert.equal(nextMode('item-choice', event), 'item-choice', event);
  }
});

test('모드: free 가 아닌 곳(앉음·포춘·전환·옷 갈아입기·면접·종료 화면)에서는 선택 창이 열리지 않는다', () => {
  for (const mode of ['seated', 'fortune', 'result', 'transition', 'wearing', 'interview-choice', 'interview-play']) assert.equal(nextMode(mode, 'pick:open'), mode, mode);
  assert.equal(nextMode('free', 'pick:cancel'), 'free');
  assert.equal(nextMode('free', 'pick:choose'), 'free');
});

test('멀티플레이: 새 클립(holding-right/both)과 단계의 모든 클립이 전송 가능한 동작 이름이다', () => {
  assert.ok(ANIMS.includes('holding-right') && ANIMS.includes('holding-both'));
  const clips = [...ACTIONS.burn.steps, ...ACTIONS.burn.variants.solid, ...ACTIONS.shred.steps].filter((s) => s.kind === 'clip' || s.kind === 'move').map((s) => s.name);
  for (const name of clips) assert.ok(ANIMS.includes(name), name);
});
