# 캐치 월드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 취업 준비생용 웹 기반 2D 탑다운 힐링 월드 '번아웃 소각장'(싱글 플레이 미니게임 1개 + 캐치 배너 + 결과 공유)을 만들어 Vercel에 배포한다.

**Architecture:** 빌드 도구 없는 정적 사이트. Phaser 3(CDN)로 4개 씬(Boot → World → BurnGame → Result)을 구성하고, 게임 규칙(스트레스 지수, 종이 구성, 파쇄기 연타, 상호작용 거리, 공유 문구, 분석 이벤트)은 Phaser에 의존하지 않는 순수 JS 모듈(`src/logic/*`, `src/*.js`)로 분리해 `node --test`로 검증한다. 에셋은 코드로 만든 임시 도형 텍스처로 먼저 동작시키고, 나중에 `ASSET_MANIFEST`로 같은 키의 실제 이미지(Kenney 팩)로 교체한다.

**Tech Stack:** Phaser 3.80.1 (jsDelivr CDN, 버전 고정), JavaScript ES 모듈, Node 내장 테스트 러너(`node:test`), Vercel 정적 호스팅, Google Analytics 4.

**Spec:** [SPEC.md](../../../SPEC.md)

## Global Constraints

- 2D 탑다운(도트 RPG 스타일), 맵 1개, **싱글 플레이**, 서버 없음.
- **PC 브라우저만** (키보드·마우스). 모바일은 안내 문구만 표시.
- 월드 이동은 방향키/WASD, 상호작용은 E/스페이스.
- 스트레스 지수: 시작 **100**, 목표치 **20 이하**, 실패 상태 없음.
- 종이 순서·장수·감소량: 이력서 5장(장당 5, 불에 드래그) → 불합격 통지서 6장(장당 4, 불에 드래그) → 자소서 4장(파쇄기에 드래그 후 연타 8회, 회당 1). 합계 81. 종이는 약 3.5초 간격으로 등장.
- 종료 화면 메시지는 "스트레스 지수 N! 이제 새 시작할 준비 끝. 다음 지원서는 캐치가 같이 찾아드릴게요!" (N은 최종 지수), 배너 버튼 문구는 "캐치 구경하기".
- 공유: 결과 이미지 저장(PNG) + 사이트 주소 복사 버튼 (서버 없이 구현).
- **"학사 과제용 비공식 프로젝트"** 를 월드 화면(하단 표기)과 결과 이미지에 명시.
- 실존 기업·재직자 소재, 회사 불태우기·퇴사·회식 등 재직자 시점 소재 사용 금지.
- 캐치 공식 API·실제 공고 연동 없음 (캐치 사이트로 가는 일반 링크만).
- 분석은 GA4 이벤트: 방문(자동 page_view), `game_start`, `game_clear`, `banner_click`, `share_image`, `share_link`.
- 유료 서버·유료 도메인 없음. 호스팅은 Vercel 무료 플랜 기본 주소.
- 3D 미사용. 미니게임 2개 이상은 MVP(11/16) 이후 확장 단계에서만 추가.
- 마감: 2026-11-27 23:59. 마일스톤: ~11/16 MVP, ~11/20 버그 수정·연출 강화(·미니게임 추가), 11/21~27 예비·최종 점검.
- 커밋 메시지 끝에는 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` 줄을 붙인다.

## 파일 구조

```
catch world/
├─ index.html                  # 페이지, Phaser CDN, 하단 비공식 표기, 모바일 안내
├─ package.json                # 테스트·로컬 서버 스크립트
├─ .gitignore
├─ vercel.json                 # (필요 시) 정적 배포 설정
├─ assets/
│  ├─ CREDITS.md               # 사용한 에셋 출처·라이선스
│  └─ (Kenney 팩 PNG/오디오)
├─ src/
│  ├─ config.js                # 모든 상수 (크기, 수치, 문구, URL, GA ID, 에셋 목록)
│  ├─ env.js                   # isMobileUA
│  ├─ analytics.js             # initAnalytics, track
│  ├─ share.js                 # 공유 문구·파일명·카드 렌더·저장·복사
│  ├─ main.js                  # Phaser 게임 생성
│  ├─ textures.js              # 임시 도형 텍스처 생성
│  ├─ logic/
│  │  ├─ stress.js             # StressMeter
│  │  ├─ paperQueue.js         # PAPER_TYPES, buildQueue, totalReduction
│  │  ├─ shredder.js           # ShredderState
│  │  └─ interact.js           # findInteractable
│  └─ scenes/
│     ├─ BootScene.js
│     ├─ WorldScene.js
│     ├─ BurnGameScene.js
│     └─ ResultScene.js
└─ test/
   ├─ env.test.js
   ├─ stress.test.js
   ├─ paperQueue.test.js
   ├─ shredder.test.js
   ├─ interact.test.js
   ├─ analytics.test.js
   └─ share.test.js
```

## 일정 대응

| 날짜 | 태스크 |
|---|---|
| 11/12 | 1~4 (뼈대, 순수 로직) |
| 11/13 | 5~6 (분석, 월드). **11/13까지 에셋 팩·수치 확정** |
| 11/14~15 | 7~8 (미니게임, 종료 화면·공유) |
| 11/16 | 9 에셋 적용, 10 첫 배포 → **MVP 완성** |
| 11/17~20 | 11 연출 강화, 버그 수정 |
| 11/21~27 | 12 최종 점검·배포 확정 |

---

### Task 1: 프로젝트 뼈대와 부팅

**Files:**
- Create: `index.html`, `package.json`, `.gitignore`, `src/config.js`, `src/env.js`, `src/main.js`, `src/textures.js`, `src/scenes/BootScene.js`, `src/scenes/WorldScene.js`(임시), `test/env.test.js`

**Interfaces:**
- Produces: `config.js`가 내보내는 상수 `GAME_WIDTH=960`, `GAME_HEIGHT=640`, `CATCH_URL`, `GA_MEASUREMENT_ID`, `STRESS={start:100,goal:20}`, `SPAWN_INTERVAL_MS=3500`, `SHREDDER_TAPS=8`, `PLAYER_SPEED=180`, `INTERACT_RADIUS=60`, `COMFORT_MESSAGES`(3개 문자열 배열), `ASSET_MANIFEST`(`{}`). `env.js`의 `isMobileUA(ua: string): boolean`. `textures.js`의 `makeTextures(scene): void`(키: `floor, player, furnace, comfort, resume, notice, coverLetter, fire, shredder`).

- [ ] **Step 1: Node 버전 확인**

Run: `node --version`
Expected: `v20` 이상. 없으면 https://nodejs.org 에서 LTS를 설치한다. (게임 실행 자체에는 필요 없고 테스트용이다.)

- [ ] **Step 2: 실패하는 테스트 작성**

`test/env.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileUA } from '../src/env.js';

test('안드로이드·아이폰은 모바일로 판별한다', () => {
  assert.equal(isMobileUA('Mozilla/5.0 (Linux; Android 13; SM-S918N) Mobile Safari'), true);
  assert.equal(isMobileUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
});

test('데스크톱 브라우저는 모바일이 아니다', () => {
  assert.equal(isMobileUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'), false);
});

test('빈 값은 모바일이 아니다', () => {
  assert.equal(isMobileUA(''), false);
  assert.equal(isMobileUA(undefined), false);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test`
Expected: FAIL (`Cannot find module '../src/env.js'`)

- [ ] **Step 4: 파일 작성**

`package.json`:

```json
{
  "name": "catch-world",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "start": "npx --yes serve@14.2.4 . -l 5173"
  }
}
```

`.gitignore`:

```
node_modules/
.vercel/
```

`src/env.js`:

```js
export function isMobileUA(ua) {
  return /Android|iPhone|iPad|iPod|Mobi/i.test(ua || '');
}
```

`src/config.js`:

```js
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;

// 캐치 사이트 주소. 배포 전 브라우저에서 열어 캐치 사이트가 맞는지 확인한다.
export const CATCH_URL = 'https://www.catch.co.kr';

// GA4 측정 ID ('G-'로 시작). 비어 있으면 분석이 꺼진다. Task 10에서 입력한다.
export const GA_MEASUREMENT_ID = '';

export const STRESS = { start: 100, goal: 20 };
export const SPAWN_INTERVAL_MS = 3500;
export const SHREDDER_TAPS = 8;
export const PLAYER_SPEED = 180;
export const INTERACT_RADIUS = 60;

// 초안 문구. 팀이 자유롭게 수정한다.
export const COMFORT_MESSAGES = [
  '합격 메일은 아직 오는 중이에요. 배송이 좀 느릴 뿐!',
  '오늘 이력서 한 줄 썼다면 이미 상위 1% (제 마음속에서요).',
  '잠깐 쉬는 것도 스펙입니다. 휴식 경력 한 줄 추가!',
];

// 실제 이미지로 교체할 텍스처 키 → 파일 경로. Task 9에서 채운다.
export const ASSET_MANIFEST = {};
```

`src/textures.js`:

```js
// 에셋이 없어도 게임이 돌아가도록 도형으로 임시 텍스처를 만든다.
// 이미 로드된 키(실제 이미지)는 건드리지 않는다.
export function makeTextures(scene) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const make = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw(g);
    g.generateTexture(key, w, h);
  };

  make('floor', 32, 32, (c) => {
    c.fillStyle(0x4a4a6a).fillRect(0, 0, 32, 32);
    c.fillStyle(0x424262).fillRect(0, 0, 16, 16).fillRect(16, 16, 16, 16);
  });
  make('player', 28, 28, (c) => {
    c.fillStyle(0x6ec6ff).fillRect(0, 0, 28, 28);
    c.fillStyle(0x1b1b2f).fillRect(7, 9, 4, 4).fillRect(17, 9, 4, 4);
  });
  make('furnace', 64, 64, (c) => {
    c.fillStyle(0x555566).fillRect(0, 0, 64, 64);
    c.fillStyle(0xff7b3a).fillRect(12, 20, 40, 34);
    c.fillStyle(0xffd166).fillRect(22, 30, 20, 24);
  });
  make('comfort', 24, 24, (c) => {
    c.fillStyle(0xffd166).fillCircle(12, 12, 11);
    c.fillStyle(0x1b1b2f).fillRect(10, 6, 4, 8).fillRect(10, 16, 4, 4);
  });
  make('resume', 80, 100, (c) => {
    c.fillStyle(0xffffff).fillRect(0, 0, 80, 100);
    c.fillStyle(0xcccccc).fillRect(8, 60, 64, 4).fillRect(8, 72, 64, 4).fillRect(8, 84, 40, 4);
  });
  make('notice', 80, 100, (c) => {
    c.fillStyle(0xffd9d9).fillRect(0, 0, 80, 100);
    c.fillStyle(0xe05555).fillRect(0, 0, 80, 10);
  });
  make('coverLetter', 80, 100, (c) => {
    c.fillStyle(0xdbe9ff).fillRect(0, 0, 80, 100);
    c.fillStyle(0x8fb4ee).fillRect(8, 60, 64, 4).fillRect(8, 72, 64, 4).fillRect(8, 84, 40, 4);
  });
  make('fire', 160, 120, (c) => {
    c.fillStyle(0x3a2a2a).fillRect(0, 40, 160, 80);
    c.fillStyle(0xff7b3a).fillTriangle(20, 80, 80, 0, 140, 80);
    c.fillStyle(0xffd166).fillTriangle(50, 80, 80, 30, 110, 80);
  });
  make('shredder', 140, 100, (c) => {
    c.fillStyle(0x777788).fillRect(0, 20, 140, 80);
    c.fillStyle(0x222233).fillRect(20, 30, 100, 10);
    c.fillStyle(0xaaaabb).fillRect(0, 0, 140, 20);
  });
  g.destroy();
}
```

`src/scenes/BootScene.js`:

```js
import { ASSET_MANIFEST } from '../config.js';
import { makeTextures } from '../textures.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    Object.entries(ASSET_MANIFEST).forEach(([key, path]) => this.load.image(key, path));
  }

  create() {
    makeTextures(this);
    this.scene.start('World');
  }
}
```

`src/scenes/WorldScene.js` (임시, Task 6에서 전체 교체):

```js
export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    this.add.text(20, 20, '월드 준비 중', { fontSize: '24px', color: '#ffffff' });
    this.add.image(480, 320, 'player');
  }
}
```

`src/main.js`:

```js
import { GAME_WIDTH, GAME_HEIGHT } from './config.js';
import { isMobileUA } from './env.js';
import BootScene from './scenes/BootScene.js';
import WorldScene from './scenes/WorldScene.js';

if (isMobileUA(navigator.userAgent)) {
  document.getElementById('mobile-notice').style.display = 'flex';
} else {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#2a2a40',
    pixelArt: true,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, WorldScene],
  });
}
```

`index.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>캐치 월드 - 번아웃 소각장</title>
  <style>
    html, body { margin: 0; height: 100%; background: #1b1b2f; color: #cfcfe6;
      font-family: system-ui, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
    #wrap { display: flex; flex-direction: column; height: 100%; }
    #game { flex: 1; min-height: 0; }
    footer { font-size: 12px; text-align: center; padding: 6px 8px; background: #12121f; }
    #mobile-notice { display: none; position: fixed; inset: 0; background: #1b1b2f;
      align-items: center; justify-content: center; text-align: center;
      padding: 24px; font-size: 18px; z-index: 10; }
  </style>
</head>
<body>
  <div id="wrap">
    <div id="game"></div>
    <footer>※ 학사 과제용 비공식 프로젝트입니다. '캐치(Catch)'와 무관하며 비상업적 목적으로만 제작되었습니다. 방문 통계(Google Analytics)를 수집합니다.</footer>
  </div>
  <div id="mobile-notice">이 체험은 PC 브라우저(키보드·마우스)에서 이용해 주세요.</div>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test`
Expected: PASS (3 tests)

- [ ] **Step 6: 화면 확인**

Run: `npm start` 후 브라우저에서 http://localhost:5173 열기. (Node가 없으면 `python -m http.server 5173`)
Expected: 어두운 배경에 "월드 준비 중" 글자와 파란 사각형 캐릭터가 보이고, 하단에 비공식 표기 문구가 보인다. 브라우저 콘솔(F12)에 빨간 오류가 없다.

- [ ] **Step 7: 커밋**

```bash
git init
git add .
git commit -m "feat: 프로젝트 뼈대와 Phaser 부팅"
```

---

### Task 2: 스트레스 지수 (StressMeter)

**Files:**
- Create: `src/logic/stress.js`
- Test: `test/stress.test.js`

**Interfaces:**
- Produces: `class StressMeter { constructor({start, goal}) ; get value(): number ; get cleared(): boolean ; reduce(amount: number): number ; reset(): void }` (`reduce`는 새 값을 반환, 0 미만으로 내려가지 않고, 음수·NaN 입력은 무시)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/stress.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { StressMeter } from '../src/logic/stress.js';

const make = () => new StressMeter({ start: 100, goal: 20 });

test('시작값으로 시작한다', () => {
  assert.equal(make().value, 100);
});

test('reduce는 지수를 낮추고 새 값을 돌려준다', () => {
  const m = make();
  assert.equal(m.reduce(5), 95);
  assert.equal(m.value, 95);
});

test('0 아래로 내려가지 않는다', () => {
  const m = make();
  m.reduce(500);
  assert.equal(m.value, 0);
});

test('목표치 이하가 되면 cleared', () => {
  const m = make();
  m.reduce(79);
  assert.equal(m.cleared, false); // 21
  m.reduce(1);
  assert.equal(m.cleared, true);  // 20
});

test('음수·NaN 감소는 무시한다', () => {
  const m = make();
  m.reduce(-10);
  m.reduce(NaN);
  assert.equal(m.value, 100);
});

test('reset은 시작값으로 되돌린다', () => {
  const m = make();
  m.reduce(50);
  m.reset();
  assert.equal(m.value, 100);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/stress.test.js`
Expected: FAIL (`Cannot find module '../src/logic/stress.js'`)

- [ ] **Step 3: 구현**

`src/logic/stress.js`:

```js
export class StressMeter {
  constructor({ start, goal }) {
    this.start = start;
    this.goal = goal;
    this._value = start;
  }

  get value() {
    return this._value;
  }

  get cleared() {
    return this._value <= this.goal;
  }

  reduce(amount) {
    if (Number.isFinite(amount) && amount > 0) {
      this._value = Math.max(0, this._value - amount);
    }
    return this._value;
  }

  reset() {
    this._value = this.start;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/stress.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/logic/stress.js test/stress.test.js
git commit -m "feat: 스트레스 지수 로직"
```

---

### Task 3: 종이 구성 (paperQueue)

**Files:**
- Create: `src/logic/paperQueue.js`
- Test: `test/paperQueue.test.js`

**Interfaces:**
- Consumes: `config.js`의 `SHREDDER_TAPS`, `STRESS`
- Produces: `PAPER_TYPES`, `SEQUENCE`, `buildQueue(): Item[]`, `totalReduction(queue): number`. `Item = { id: string, type: 'resume'|'notice'|'coverLetter', label: string, action: 'burn'|'shred', reduce: number, taps: number, reducePerTap: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/paperQueue.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, totalReduction } from '../src/logic/paperQueue.js';
import { STRESS } from '../src/config.js';

test('이력서 5 → 통지서 6 → 자소서 4 순서로 15장', () => {
  const q = buildQueue();
  assert.equal(q.length, 15);
  assert.deepEqual(q.slice(0, 5).map((i) => i.type), Array(5).fill('resume'));
  assert.deepEqual(q.slice(5, 11).map((i) => i.type), Array(6).fill('notice'));
  assert.deepEqual(q.slice(11).map((i) => i.type), Array(4).fill('coverLetter'));
});

test('처리 방식: 이력서·통지서는 burn, 자소서는 shred', () => {
  const q = buildQueue();
  assert.equal(q[0].action, 'burn');
  assert.equal(q[5].action, 'burn');
  assert.equal(q[11].action, 'shred');
});

test('감소량 합계는 81', () => {
  assert.equal(totalReduction(buildQueue()), 81);
});

test('끝까지 하면 반드시 목표치 이하가 된다 (실패 없음)', () => {
  assert.ok(STRESS.start - totalReduction(buildQueue()) <= STRESS.goal);
});

test('id는 모두 고유하다', () => {
  const ids = buildQueue().map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('자소서는 연타 8회, 회당 1 감소', () => {
  const item = buildQueue().find((i) => i.type === 'coverLetter');
  assert.equal(item.taps, 8);
  assert.equal(item.reducePerTap, 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/paperQueue.test.js`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: 구현**

`src/logic/paperQueue.js`:

```js
import { SHREDDER_TAPS } from '../config.js';

export const PAPER_TYPES = {
  resume: { label: '이력서', count: 5, action: 'burn', reduce: 5 },
  notice: { label: '불합격\n통지서', count: 6, action: 'burn', reduce: 4 },
  coverLetter: { label: '자소서', count: 4, action: 'shred', taps: SHREDDER_TAPS, reducePerTap: 1 },
};

export const SEQUENCE = ['resume', 'notice', 'coverLetter'];

export function buildQueue() {
  const queue = [];
  for (const type of SEQUENCE) {
    const spec = PAPER_TYPES[type];
    for (let i = 0; i < spec.count; i++) {
      queue.push({
        id: `${type}-${i + 1}`,
        type,
        label: spec.label,
        action: spec.action,
        reduce: spec.reduce ?? 0,
        taps: spec.taps ?? 0,
        reducePerTap: spec.reducePerTap ?? 0,
      });
    }
  }
  return queue;
}

export function totalReduction(queue) {
  return queue.reduce(
    (sum, it) => sum + (it.action === 'burn' ? it.reduce : it.taps * it.reducePerTap),
    0,
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/paperQueue.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/logic/paperQueue.js test/paperQueue.test.js
git commit -m "feat: 종이 구성과 감소량 로직"
```

---

### Task 4: 파쇄기 연타 (ShredderState)

**Files:**
- Create: `src/logic/shredder.js`
- Test: `test/shredder.test.js`

**Interfaces:**
- Consumes: Task 3의 `Item`
- Produces: `class ShredderState { get loaded(): boolean ; get remaining(): number ; load(item): boolean ; tap(): { reduced: number, done: boolean } }`. 이미 장전돼 있으면 `load`는 false. 장전되지 않았을 때 `tap`은 `{reduced:0, done:false}`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/shredder.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShredderState } from '../src/logic/shredder.js';

const letter = { id: 'coverLetter-1', taps: 8, reducePerTap: 1 };

test('처음에는 비어 있다', () => {
  const s = new ShredderState();
  assert.equal(s.loaded, false);
  assert.deepEqual(s.tap(), { reduced: 0, done: false });
});

test('장전하면 loaded, 남은 횟수는 taps', () => {
  const s = new ShredderState();
  assert.equal(s.load(letter), true);
  assert.equal(s.loaded, true);
  assert.equal(s.remaining, 8);
});

test('이미 장전돼 있으면 추가 장전 불가', () => {
  const s = new ShredderState();
  s.load(letter);
  assert.equal(s.load({ ...letter, id: 'coverLetter-2' }), false);
});

test('8번 치면 done, 매 탭 1 감소', () => {
  const s = new ShredderState();
  s.load(letter);
  for (let i = 0; i < 7; i++) assert.deepEqual(s.tap(), { reduced: 1, done: false });
  assert.deepEqual(s.tap(), { reduced: 1, done: true });
  assert.equal(s.loaded, false);
});

test('완료 후 다시 장전할 수 있다', () => {
  const s = new ShredderState();
  s.load(letter);
  for (let i = 0; i < 8; i++) s.tap();
  assert.equal(s.load(letter), true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/shredder.test.js`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: 구현**

`src/logic/shredder.js`:

```js
export class ShredderState {
  constructor() {
    this.item = null;
    this._remaining = 0;
  }

  get loaded() {
    return this.item !== null;
  }

  get remaining() {
    return this._remaining;
  }

  load(item) {
    if (this.item) return false;
    this.item = item;
    this._remaining = item.taps;
    return true;
  }

  tap() {
    if (!this.item) return { reduced: 0, done: false };
    const reduced = this.item.reducePerTap;
    this._remaining -= 1;
    const done = this._remaining <= 0;
    if (done) {
      this.item = null;
      this._remaining = 0;
    }
    return { reduced, done };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test`
Expected: 지금까지 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/logic/shredder.js test/shredder.test.js
git commit -m "feat: 파쇄기 연타 로직"
```

---

### Task 5: 분석 모듈 (GA4)

**Files:**
- Create: `src/analytics.js`
- Modify: `src/main.js` (초기화 호출 추가)
- Test: `test/analytics.test.js`

**Interfaces:**
- Consumes: `config.js`의 `GA_MEASUREMENT_ID`
- Produces: `initAnalytics(id: string, doc?: Document): boolean`, `track(name: string, params?: object): boolean`. 측정 ID가 비어 있거나 gtag가 없으면 아무 일도 하지 않고 false.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/analytics.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { initAnalytics, track } from '../src/analytics.js';

test('gtag가 없으면 track은 아무것도 하지 않고 false', () => {
  delete globalThis.gtag;
  assert.equal(track('game_start'), false);
});

test('gtag가 있으면 이벤트를 보낸다', () => {
  const calls = [];
  globalThis.gtag = (...args) => calls.push(args);
  assert.equal(track('banner_click', { place: 'result' }), true);
  assert.deepEqual(calls[0], ['event', 'banner_click', { place: 'result' }]);
  delete globalThis.gtag;
});

test('측정 ID가 비어 있으면 초기화하지 않는다', () => {
  assert.equal(initAnalytics('', {}), false);
});

test('측정 ID가 있으면 스크립트를 넣고 gtag를 만든다', () => {
  const appended = [];
  const doc = {
    createElement: () => ({}),
    head: { appendChild: (el) => appended.push(el) },
  };
  assert.equal(initAnalytics('G-TEST123', doc), true);
  assert.equal(appended.length, 1);
  assert.match(appended[0].src, /googletagmanager\.com\/gtag\/js\?id=G-TEST123/);
  assert.equal(typeof globalThis.gtag, 'function');
  delete globalThis.gtag;
  delete globalThis.dataLayer;
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/analytics.test.js`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: 구현**

`src/analytics.js`:

```js
export function initAnalytics(id, doc = globalThis.document) {
  if (!id || !doc) return false;
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  doc.head.appendChild(script);
  globalThis.dataLayer = globalThis.dataLayer || [];
  globalThis.gtag = function gtag() {
    globalThis.dataLayer.push(arguments);
  };
  globalThis.gtag('js', new Date());
  globalThis.gtag('config', id);
  return true;
}

export function track(name, params = {}) {
  if (typeof globalThis.gtag !== 'function') return false;
  globalThis.gtag('event', name, params);
  return true;
}
```

`src/main.js` 수정 — import 추가와 게임 생성 전 호출:

```js
import { GAME_WIDTH, GAME_HEIGHT, GA_MEASUREMENT_ID } from './config.js';
import { initAnalytics } from './analytics.js';
```

그리고 `else {` 블록 첫 줄에 `initAnalytics(GA_MEASUREMENT_ID);` 추가.

- [ ] **Step 4: 통과 확인**

Run: `node --test`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/analytics.js src/main.js test/analytics.test.js
git commit -m "feat: GA4 분석 모듈"
```

---

### Task 6: 상호작용 판정과 월드 씬

**Files:**
- Create: `src/logic/interact.js`
- Replace: `src/scenes/WorldScene.js`
- Modify: `src/main.js`(씬 목록은 변경 없음)
- Test: `test/interact.test.js`

**Interfaces:**
- Consumes: `config.js` 상수, `analytics.js`의 `track`
- Produces: `findInteractable(pos: {x,y}, objects: {id,x,y,...}[], radius: number): object|null`. `WorldScene`은 소각로에서 E/스페이스를 누르면 `track('game_start')` 후 `BurnGame` 씬을 시작한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/interact.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { findInteractable } from '../src/logic/interact.js';

const objects = [
  { id: 'furnace', x: 100, y: 100 },
  { id: 'comfort-0', x: 130, y: 100 },
];

test('반경 안에 아무것도 없으면 null', () => {
  assert.equal(findInteractable({ x: 500, y: 500 }, objects, 60), null);
});

test('반경 안의 오브젝트를 찾는다', () => {
  assert.equal(findInteractable({ x: 100, y: 140 }, objects, 60).id, 'furnace');
});

test('여러 개면 가장 가까운 것을 고른다', () => {
  assert.equal(findInteractable({ x: 125, y: 100 }, objects, 60).id, 'comfort-0');
});

test('반경 경계(<=)는 포함한다', () => {
  assert.equal(findInteractable({ x: 100, y: 160 }, objects, 60).id, 'furnace');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/interact.test.js`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: 로직 구현**

`src/logic/interact.js`:

```js
export function findInteractable(pos, objects, radius) {
  let best = null;
  let bestDist = Infinity;
  for (const obj of objects) {
    const d = Math.hypot(obj.x - pos.x, obj.y - pos.y);
    if (d <= radius && d < bestDist) {
      best = obj;
      bestDist = d;
    }
  }
  return best;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 월드 씬 구현**

`src/scenes/WorldScene.js` 전체 교체:

```js
import {
  GAME_WIDTH as W,
  GAME_HEIGHT as H,
  PLAYER_SPEED,
  INTERACT_RADIUS,
  COMFORT_MESSAGES,
} from '../config.js';
import { findInteractable } from '../logic/interact.js';
import { track } from '../analytics.js';

const FONT = 'Malgun Gothic, Apple SD Gothic Neo, sans-serif';
const COMFORT_SPOTS = [
  { x: 140, y: 230 },
  { x: 820, y: 300 },
  { x: 200, y: 520 },
];

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    this.add.tileSprite(0, 0, W, H, 'floor').setOrigin(0);
    this.add.rectangle(W / 2, 40, W, 80, 0x3a3a5c);
    this.add.text(W / 2, 40, 'CATCH · 번아웃 소각장', {
      fontFamily: FONT, fontSize: '28px', color: '#ffd166',
    }).setOrigin(0.5);
    this.add.text(W / 2, 104, '방향키/WASD 이동 · E 또는 스페이스: 상호작용', {
      fontFamily: FONT, fontSize: '14px', color: '#cfcfe6',
    }).setOrigin(0.5);

    this.physics.world.setBounds(0, 80, W, H - 80);
    this.furnace = this.physics.add.staticImage(W / 2, 220, 'furnace');
    this.player = this.physics.add.sprite(W / 2, H - 120, 'player').setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.furnace);

    this.interactables = [{ id: 'furnace', x: W / 2, y: 220 }];
    COMFORT_SPOTS.forEach((p, i) => {
      this.add.image(p.x, p.y, 'comfort');
      this.interactables.push({ id: `comfort-${i}`, x: p.x, y: p.y, message: COMFORT_MESSAGES[i] });
    });

    this.prompt = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '14px', color: '#ffffff',
      backgroundColor: '#000000aa', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(10).setVisible(false);

    this.dialog = this.add.text(W / 2, H - 50, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffffff', align: 'center',
      backgroundColor: '#000000cc', padding: { x: 14, y: 10 }, wordWrap: { width: W - 120 },
    }).setOrigin(0.5).setDepth(10).setVisible(false);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.keyE = this.input.keyboard.addKey('E');
    this.keySpace = this.input.keyboard.addKey('SPACE');
  }

  update() {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);
    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
    if (vx && vy) this.player.body.velocity.normalize().scale(PLAYER_SPEED);

    const near = findInteractable({ x: this.player.x, y: this.player.y }, this.interactables, INTERACT_RADIUS);
    if (near) {
      this.prompt
        .setText(near.id === 'furnace' ? 'E: 소각 시작' : 'E: 살펴보기')
        .setPosition(near.x, near.y - 50)
        .setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }

    const pressed = Phaser.Input.Keyboard.JustDown(this.keyE) || Phaser.Input.Keyboard.JustDown(this.keySpace);
    if (near && pressed) this.interact(near);
  }

  interact(obj) {
    if (obj.id === 'furnace') {
      track('game_start');
      this.scene.start('BurnGame');
      return;
    }
    this.dialog.setText(obj.message).setVisible(true);
    if (this.dialogTimer) this.dialogTimer.remove();
    this.dialogTimer = this.time.delayedCall(3000, () => this.dialog.setVisible(false));
  }
}
```

- [ ] **Step 6: 화면 확인**

Run: `npm start` → http://localhost:5173
Expected: 바닥 타일, 위쪽 "CATCH · 번아웃 소각장" 간판, 소각로가 보인다. 방향키/WASD로 파란 캐릭터가 움직이고 소각로를 뚫고 지나가지 못한다. 노란 오브젝트 근처에 가면 "E: 살펴보기"가 뜨고 E를 누르면 하단에 위로 문구가 3초간 나온다. 소각로 근처에서 E를 누르면 `BurnGame` 씬이 없다는 오류가 콘솔에 나온다(Task 7에서 해결되므로 정상).

- [ ] **Step 7: 커밋**

```bash
git add src/logic/interact.js src/scenes/WorldScene.js test/interact.test.js
git commit -m "feat: 월드 씬과 상호작용"
```

---

### Task 7: 소각장 미니게임 씬

**Files:**
- Create: `src/scenes/BurnGameScene.js`
- Modify: `src/main.js` (씬 등록)

**Interfaces:**
- Consumes: `StressMeter`, `buildQueue`, `ShredderState`, `track`, `config.js`
- Produces: 씬 키 `'BurnGame'`. 지수가 목표치 이하가 되면 `track('game_clear')` 후 `this.scene.start('Result', { stress: number })`.

- [ ] **Step 1: 씬 구현**

`src/scenes/BurnGameScene.js`:

```js
import { GAME_WIDTH as W, GAME_HEIGHT as H, STRESS, SPAWN_INTERVAL_MS } from '../config.js';
import { StressMeter } from '../logic/stress.js';
import { buildQueue } from '../logic/paperQueue.js';
import { ShredderState } from '../logic/shredder.js';
import { track } from '../analytics.js';

const FONT = 'Malgun Gothic, Apple SD Gothic Neo, sans-serif';
const FIRE = { x: 240, y: 470 };
const SHREDDER = { x: 720, y: 470 };
const DROP_RADIUS = 100;
const BAR = { x: 280, y: 30, w: 400, h: 22 };

export default class BurnGameScene extends Phaser.Scene {
  constructor() {
    super('BurnGame');
  }

  create() {
    this.stress = new StressMeter(STRESS);
    this.queue = buildQueue();
    this.shredder = new ShredderState();
    this.spawned = 0;
    this.ended = false;

    this.add.rectangle(W / 2, H / 2, W, H, 0x2a2438);
    this.fire = this.add.image(FIRE.x, FIRE.y, 'fire');
    this.add.text(FIRE.x, FIRE.y + 80, '소각로', { fontFamily: FONT, fontSize: '18px', color: '#ffd166' }).setOrigin(0.5);
    this.shredderImg = this.add.image(SHREDDER.x, SHREDDER.y, 'shredder')
      .setInteractive({ useHandCursor: true });
    this.add.text(SHREDDER.x, SHREDDER.y + 70, '파쇄기', { fontFamily: FONT, fontSize: '18px', color: '#ffd166' }).setOrigin(0.5);
    this.shredHint = this.add.text(SHREDDER.x, SHREDDER.y - 80, '', {
      fontFamily: FONT, fontSize: '20px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setVisible(false);

    this.add.text(W / 2, H - 24, '종이를 끌어다 불에 던지세요 · 자소서는 파쇄기에 넣고 파쇄기를 연타하세요!', {
      fontFamily: FONT, fontSize: '15px', color: '#cfcfe6',
    }).setOrigin(0.5);

    this.add.rectangle(BAR.x, BAR.y, BAR.w, BAR.h, 0x111111).setOrigin(0, 0.5);
    this.barFill = this.add.rectangle(BAR.x, BAR.y, BAR.w, BAR.h, 0xff6b6b).setOrigin(0, 0.5);
    this.add.rectangle(BAR.x + BAR.w * (STRESS.goal / STRESS.start), BAR.y, 3, BAR.h + 10, 0xffffff);
    this.stressText = this.add.text(W / 2, BAR.y + 26, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
    this.refreshBar();

    this.input.on('dragstart', (_p, obj) => obj.setDepth(5));
    this.input.on('drag', (_p, obj, x, y) => { obj.x = x; obj.y = y; });
    this.input.on('dragend', (_p, obj) => this.dropPaper(obj));
    this.shredderImg.on('pointerdown', () => this.tapShredder());

    this.spawnNext();
    this.spawnTimer = this.time.addEvent({ delay: SPAWN_INTERVAL_MS, loop: true, callback: () => this.spawnNext() });
  }

  spawnNext() {
    if (this.spawned >= this.queue.length) {
      if (this.spawnTimer) this.spawnTimer.remove();
      return;
    }
    const item = this.queue[this.spawned++];
    const x = Phaser.Math.Between(140, W - 140);
    const img = this.add.image(0, 0, item.type);
    const label = this.add.text(0, 0, item.label, {
      fontFamily: FONT, fontSize: '14px', color: '#222222', align: 'center', wordWrap: { width: 70 },
    }).setOrigin(0.5);
    const paper = this.add.container(x, 170, [img, label]);
    paper.setSize(80, 100);
    paper.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-40, -50, 80, 100),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
      draggable: true,
    });
    paper.item = item;
  }

  near(obj, point) {
    return Phaser.Math.Distance.Between(obj.x, obj.y, point.x, point.y) <= DROP_RADIUS;
  }

  dropPaper(paper) {
    const item = paper.item;
    if (!item || this.ended) return;
    if (item.action === 'burn' && this.near(paper, FIRE)) {
      this.tweens.add({
        targets: paper, scale: 0, alpha: 0, duration: 250,
        onComplete: () => paper.destroy(),
      });
      paper.disableInteractive();
      this.cameras.main.shake(80, 0.004);
      this.applyReduce(item.reduce);
    } else if (item.action === 'shred' && this.near(paper, SHREDDER) && this.shredder.load(item)) {
      paper.destroy();
      this.updateShredHint();
    }
  }

  tapShredder() {
    if (this.ended) return;
    const { reduced } = this.shredder.tap();
    if (reduced > 0) {
      this.tweens.add({ targets: this.shredderImg, scale: 1.08, yoyo: true, duration: 60 });
      this.applyReduce(reduced);
    }
    this.updateShredHint();
  }

  updateShredHint() {
    if (this.shredder.loaded) {
      this.shredHint.setText(`파쇄 중! 연타! (${this.shredder.remaining}번 남음)`).setVisible(true);
    } else {
      this.shredHint.setVisible(false);
    }
  }

  applyReduce(amount) {
    this.stress.reduce(amount);
    this.refreshBar();
    if (this.stress.cleared && !this.ended) {
      this.ended = true;
      track('game_clear');
      this.time.delayedCall(700, () => this.scene.start('Result', { stress: this.stress.value }));
    }
  }

  refreshBar() {
    this.barFill.width = BAR.w * (this.stress.value / STRESS.start);
    this.stressText.setText(`스트레스 지수 ${this.stress.value}`);
  }
}
```

- [ ] **Step 2: 씬 등록**

`src/main.js`에 `import BurnGameScene from './scenes/BurnGameScene.js';` 를 추가하고 `scene` 배열을 `[BootScene, WorldScene, BurnGameScene]` 으로 바꾼다.

- [ ] **Step 3: 화면 확인**

Run: `npm start` → 월드에서 소각로 옆에서 E.
Expected: 상단에 빨간 스트레스 바(지수 100), 왼쪽 불, 오른쪽 파쇄기, 위에서 종이가 3.5초 간격으로 생긴다.
- 이력서(흰색)를 끌어 불 근처에 놓으면 사라지고 화면이 살짝 흔들리며 지수가 95로 준다.
- 통지서(붉은색)는 4씩 준다.
- 자소서(푸른색)를 파쇄기 근처에 놓으면 "파쇄 중! 연타! (8번 남음)"이 뜨고, 파쇄기를 클릭할 때마다 1씩 준다. 8번 클릭하면 힌트가 사라진다.
- 지수가 20 이하가 되면 0.7초 뒤 `Result` 씬이 없다는 오류가 콘솔에 나온다(Task 8에서 해결되므로 정상).
- 이미 파쇄기에 자소서가 있을 때 두 번째 자소서를 넣으려 하면 그대로 남아 있다(정상).

- [ ] **Step 4: 커밋**

```bash
git add src/scenes/BurnGameScene.js src/main.js
git commit -m "feat: 소각장 미니게임 씬"
```

---

### Task 8: 종료 화면과 결과 공유

**Files:**
- Create: `src/share.js`, `src/scenes/ResultScene.js`
- Modify: `src/main.js` (씬 등록)
- Test: `test/share.test.js`

**Interfaces:**
- Consumes: `config.js`의 `STRESS`, `CATCH_URL`, `track`
- Produces: `buildShareFilename(date?: Date): string`, `buildShareLines(stress: number): string[]`, `renderShareCard(stress): HTMLCanvasElement`, `saveShareCard(stress): void`, `copyText(text): Promise<boolean>`. 씬 키 `'Result'`, 입력 데이터 `{ stress: number }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/share.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareFilename, buildShareLines } from '../src/share.js';

test('파일명은 날짜가 들어간 png', () => {
  assert.equal(buildShareFilename(new Date(2026, 10, 5)), 'catch-world-20261105.png');
});

test('공유 문구에 시작→최종 지수와 비공식 표기가 들어간다', () => {
  const lines = buildShareLines(19);
  assert.ok(lines.some((l) => l.includes('100') && l.includes('19')));
  assert.ok(lines.some((l) => l.includes('학사 과제용 비공식 프로젝트')));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/share.test.js`
Expected: FAIL (`Cannot find module '../src/share.js'`)

- [ ] **Step 3: 공유 모듈 구현**

`src/share.js`:

```js
import { STRESS } from './config.js';
import { track } from './analytics.js';

export function buildShareFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `catch-world-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}.png`;
}

export function buildShareLines(stress) {
  return [
    '번아웃 소각장 클리어!',
    `스트레스 지수 ${STRESS.start} → ${stress}`,
    '다음 지원서는 캐치와 함께',
    '학사 과제용 비공식 프로젝트',
  ];
}

export function renderShareCard(stress) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2438';
  ctx.fillRect(0, 0, 600, 400);
  ctx.fillStyle = '#ff7b3a';
  ctx.fillRect(0, 0, 600, 12);
  ctx.textAlign = 'center';
  const lines = buildShareLines(stress);
  const styles = [
    ['bold 40px "Malgun Gothic", sans-serif', '#ffd166', 110],
    ['bold 34px "Malgun Gothic", sans-serif', '#ffffff', 190],
    ['24px "Malgun Gothic", sans-serif', '#cfcfe6', 260],
    ['16px "Malgun Gothic", sans-serif', '#8888aa', 360],
  ];
  lines.forEach((line, i) => {
    const [font, color, y] = styles[i];
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(line, 300, y);
  });
  return canvas;
}

export function saveShareCard(stress) {
  const canvas = renderShareCard(stress);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildShareFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
  track('share_image');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    track('share_link');
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 결과 씬 구현**

`src/scenes/ResultScene.js`:

```js
import { GAME_WIDTH as W, GAME_HEIGHT as H, CATCH_URL } from '../config.js';
import { track } from '../analytics.js';
import { saveShareCard, copyText } from '../share.js';

const FONT = 'Malgun Gothic, Apple SD Gothic Neo, sans-serif';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(data) {
    this.finalStress = data.stress;
  }

  create() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x2a2438);
    this.add.text(W / 2, 110, '소각 완료!', { fontFamily: FONT, fontSize: '44px', color: '#ffd166' }).setOrigin(0.5);
    this.add.text(W / 2, 220,
      `스트레스 지수 ${this.finalStress}! 이제 새 시작할 준비 끝.\n다음 지원서는 캐치가 같이 찾아드릴게요!`,
      { fontFamily: FONT, fontSize: '26px', color: '#ffffff', align: 'center', lineSpacing: 10 }).setOrigin(0.5);

    this.button(W / 2, 340, '캐치 구경하기', 0xff7b3a, () => {
      track('banner_click');
      window.open(CATCH_URL, '_blank', 'noopener');
    }, 28);
    this.button(W / 2 - 150, 430, '결과 이미지 저장', 0x4a6fa5, () => {
      saveShareCard(this.finalStress);
      this.feedback('이미지를 저장했어요!');
    });
    this.button(W / 2 + 150, 430, '사이트 주소 복사', 0x4a6fa5, async () => {
      const ok = await copyText(window.location.href);
      this.feedback(ok ? '주소를 복사했어요!' : '복사에 실패했어요. 주소창의 주소를 직접 복사해 주세요.');
    });
    this.button(W / 2, 510, '다시 하기', 0x555566, () => this.scene.start('World'));

    this.feedbackText = this.add.text(W / 2, 570, '', { fontFamily: FONT, fontSize: '16px', color: '#cfcfe6' }).setOrigin(0.5);
  }

  feedback(msg) {
    this.feedbackText.setText(msg);
  }

  button(x, y, label, color, onClick, size = 20) {
    const btn = this.add.text(x, y, label, {
      fontFamily: FONT, fontSize: `${size}px`, color: '#ffffff',
      backgroundColor: `#${color.toString(16).padStart(6, '0')}`, padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerup', onClick);
    btn.on('pointerover', () => btn.setAlpha(0.85));
    btn.on('pointerout', () => btn.setAlpha(1));
    return btn;
  }
}
```

- [ ] **Step 6: 씬 등록**

`src/main.js`에 `import ResultScene from './scenes/ResultScene.js';` 를 추가하고 `scene` 배열을 `[BootScene, WorldScene, BurnGameScene, ResultScene]` 으로 바꾼다.

- [ ] **Step 7: 캐치 주소 확인**

브라우저에서 `src/config.js`의 `CATCH_URL`을 직접 열어 캐치 사이트가 맞는지 확인한다. 아니면 올바른 주소로 고친다.

- [ ] **Step 8: 화면 확인**

Run: `npm start` → 끝까지 플레이.
Expected: 클리어 후 "소각 완료!"와 "스트레스 지수 19! 이제 새 시작할 준비 끝. 다음 지원서는 캐치가 같이 찾아드릴게요!"가 보인다. "캐치 구경하기"를 누르면 새 탭에 캐치 사이트가 열린다. "결과 이미지 저장"을 누르면 `catch-world-YYYYMMDD.png`가 내려받아지고 이미지에 지수와 비공식 표기가 들어 있다. "사이트 주소 복사" 후 메모장에 붙여넣으면 주소가 나온다. "다시 하기"를 누르면 월드로 돌아가고 소각이 다시 가능하다.

- [ ] **Step 9: 커밋**

```bash
git add src/share.js src/scenes/ResultScene.js src/main.js test/share.test.js
git commit -m "feat: 종료 화면과 결과 공유"
```

---

### Task 9: 에셋 교체 (Kenney 팩)

**Files:**
- Create: `assets/` 하위 이미지, `assets/CREDITS.md`
- Modify: `src/config.js` (`ASSET_MANIFEST`)

**Interfaces:**
- Consumes: Task 1의 텍스처 키 `floor, player, furnace, comfort, resume, notice, coverLetter, fire, shredder`
- Produces: 같은 키의 실제 이미지. 키 이름과 코드는 바꾸지 않는다.

이 태스크의 이미지 선택은 사람이 한다(그래픽 담당). 코드 변경은 `ASSET_MANIFEST` 한 곳뿐이다.

- [ ] **Step 1: 에셋 팩 선정과 라이선스 확인 (11/13까지)**

https://kenney.nl/assets 에서 탑다운 RPG·실내 소품 계열 팩 1~2개를 고른다. 각 팩의 라이선스 페이지에서 **CC0**인지 확인한다. CC0가 아니면 `assets/CREDITS.md`에 출처 표기를 넣는다.

- [ ] **Step 2: 파일 배치**

PNG를 `assets/`에 넣는다. 예: `assets/floor.png`, `assets/player.png`. 교체할 키만 넣으면 되고, 파일이 없는 키는 임시 도형이 그대로 쓰인다. 종이·불·파쇄기처럼 팩에 없는 것은 임시 도형을 유지하거나 직접 그린다. 캐치 브랜드 요소(로고)는 그래픽 담당이 직접 제작한다.

- [ ] **Step 3: manifest 갱신**

`src/config.js`의 `ASSET_MANIFEST`를 파일이 있는 키만 채운다. 예:

```js
export const ASSET_MANIFEST = {
  floor: 'assets/floor.png',
  player: 'assets/player.png',
  furnace: 'assets/furnace.png',
};
```

(텍스처 크기가 달라도 동작하지만 월드가 어색하면 `WorldScene`의 `setScale`로 맞춘다. 타일 `floor`는 32×32가 아니면 `tileSprite` 이미지가 늘어나므로 32×32로 맞춘다.)

- [ ] **Step 4: CREDITS 작성**

`assets/CREDITS.md`:

```markdown
# 에셋 출처

| 파일 | 출처 | 라이선스 |
|---|---|---|
| (사용한 파일 이름) | Kenney – (팩 이름, 주소) | CC0 |
```

사용한 파일 전부를 표에 적는다.

- [ ] **Step 5: 화면 확인**

Run: `npm start`
Expected: 교체한 키가 실제 이미지로 보이고 나머지는 임시 도형으로 보인다. 콘솔에 404 오류가 없다. 파일 경로가 틀리면 해당 키는 임시 도형으로 대체되고 콘솔에 로드 실패가 나오므로 경로를 고친다.

- [ ] **Step 6: 커밋**

```bash
git add assets src/config.js
git commit -m "feat: 에셋 교체와 출처 기록"
```

---

### Task 10: 첫 배포와 GA4 연결 (MVP 완성, 11/16)

**Files:**
- Modify: `src/config.js` (`GA_MEASUREMENT_ID`)
- 외부 작업: GitHub 저장소, Vercel 프로젝트, GA4 속성 (팀 계정 필요)

- [ ] **Step 1: 전체 테스트와 흐름 점검**

Run: `node --test`
Expected: 모든 테스트 PASS.
그다음 `npm start`로 월드 → 소각 → 종료 → 다시 하기를 두 번 연속 플레이해 오류 없이 반복되는지 확인한다.

- [ ] **Step 2: 밸런스 점검**

한 판을 처음부터 끝까지 시간을 재며 한다.
Expected: 60~90초. 너무 길거나 지루하면 `config.js`의 `SPAWN_INTERVAL_MS`(예: 3000)나 `paperQueue.js`의 `count`·`reduce`를 조정하고 `node --test test/paperQueue.test.js`로 합계 81과 "끝까지 하면 목표치 이하" 테스트가 계속 통과하는지 확인한다. 합계를 바꾸면 테스트의 기대값 81도 함께 고친다.

- [ ] **Step 3: GA4 속성 생성**

https://analytics.google.com 에서 속성과 웹 데이터 스트림을 만들고 측정 ID(`G-`로 시작)를 복사한다.

- [ ] **Step 4: 측정 ID 입력**

`src/config.js`의 `GA_MEASUREMENT_ID`에 측정 ID를 넣는다.

- [ ] **Step 5: GitHub에 올리기**

GitHub에서 새 저장소를 만들고 로컬 프로젝트를 푸시한다.

```bash
git add src/config.js
git commit -m "chore: GA4 측정 ID 설정"
git remote add origin <저장소 주소>
git push -u origin main
```

(브랜치 이름이 `master`면 `git branch -M main`을 먼저 실행한다. 저장소 주소는 팀이 만든 저장소의 것을 쓴다.)

- [ ] **Step 6: Vercel 배포**

https://vercel.com 에 GitHub로 로그인하고 "Add New → Project"에서 저장소를 가져온다. Framework Preset은 **Other**, Build Command와 Output Directory는 비워 둔다. 배포를 누른다.

- [ ] **Step 7: 배포본 확인**

Vercel이 알려 주는 `*.vercel.app` 주소를 PC 브라우저에서 연다.
Expected: 로컬과 똑같이 플레이된다. 하단에 비공식 표기가 보인다. 클리어까지 한 뒤 GA4의 "실시간" 보고서에 방문과 `game_start`, `game_clear` 이벤트가 나타난다(광고 차단 확장 프로그램이 꺼진 브라우저에서 확인). 스마트폰에서 열면 "PC 브라우저에서 이용해 주세요" 안내가 보인다.

- [ ] **Step 8: 팀 밖 테스트**

팀원이 아닌 1~2명에게 주소를 주고 끝까지 플레이하게 한다. 막히는 지점과 오류를 기록해 11/20까지의 버그 수정 목록으로 만든다.

---

### Task 11: 연출 강화 (11/17~20)

**Files:**
- Modify: `src/textures.js`, `src/scenes/BurnGameScene.js`, `src/config.js`
- Create: `assets/audio/` (선택)

**Interfaces:**
- Consumes: Task 7의 `BurnGameScene.dropPaper`, `tapShredder`, `applyReduce`
- Produces: 텍스처 키 `spark`, 선택 오디오 키 `sfx-burn`, `sfx-shred`

- [ ] **Step 1: 불꽃 파티클 텍스처 추가**

`src/textures.js`의 `g.destroy();` 바로 위에 추가:

```js
  make('spark', 8, 8, (c) => {
    c.fillStyle(0xffd166).fillRect(0, 0, 8, 8);
  });
```

- [ ] **Step 2: 소각·파쇄 파티클**

`src/scenes/BurnGameScene.js`의 `create()` 마지막에 추가:

```js
    this.burnSpark = this.add.particles(FIRE.x, FIRE.y, 'spark', {
      speed: { min: 60, max: 200 }, angle: { min: 220, max: 320 },
      lifespan: 500, scale: { start: 1, end: 0 }, emitting: false,
    }).setDepth(6);
    this.shredSpark = this.add.particles(SHREDDER.x, SHREDDER.y, 'spark', {
      speed: { min: 40, max: 120 }, angle: { min: 60, max: 120 },
      lifespan: 350, scale: { start: 1, end: 0 }, emitting: false,
    }).setDepth(6);
```

`dropPaper`의 소각 분기(`this.cameras.main.shake(80, 0.004);` 줄 바로 아래)에 추가:

```js
      this.burnSpark.explode(16);
      this.playSfx('sfx-burn');
```

`tapShredder`의 `if (reduced > 0) {` 블록 안 첫 줄에 추가:

```js
      this.shredSpark.explode(6);
      this.playSfx('sfx-shred');
```

클래스에 메서드 추가:

```js
  playSfx(key) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume: 0.5 });
  }
```

- [ ] **Step 3: 효과음 (선택)**

Kenney의 효과음 팩(CC0 여부 확인)에서 소각·파쇄용 짧은 `.ogg`/`.mp3`를 `assets/audio/`에 넣는다. `src/config.js`에 추가:

```js
export const AUDIO_MANIFEST = {
  'sfx-burn': 'assets/audio/burn.ogg',
  'sfx-shred': 'assets/audio/shred.ogg',
};
```

`BootScene.preload()`에 추가(파일이 없는 항목은 지운다):

```js
    Object.entries(AUDIO_MANIFEST).forEach(([key, path]) => this.load.audio(key, path));
```

`BootScene.js` 맨 위 import도 `import { ASSET_MANIFEST, AUDIO_MANIFEST } from '../config.js';` 로 바꾼다. `assets/CREDITS.md`에 사운드 출처도 추가한다.

- [ ] **Step 4: 화면 확인**

Run: `npm start` → 플레이.
Expected: 이력서를 불에 던질 때 불꽃 입자가 튀고, 파쇄기를 칠 때 작은 입자가 튄다. 효과음을 넣었다면 소리가 난다. 오디오 파일을 넣지 않았어도 오류 없이 동작한다.

- [ ] **Step 5: 회귀 테스트와 커밋**

Run: `node --test`
Expected: 모든 테스트 PASS.

```bash
git add src assets
git commit -m "feat: 소각·파쇄 연출 강화"
```

---

### Task 12: 최종 점검과 배포 확정 (11/21~27)

**Files:**
- 코드 변경은 버그 수정에 한정한다.

- [ ] **Step 1: 점검 목록 실행**

`node --test`가 전부 통과하는지 확인하고, 배포된 주소에서 아래를 모두 확인한다.
- 월드 이동, 위로 문구 3개, 소각로 시작
- 이력서·통지서 소각, 자소서 파쇄·연타, 지수 감소
- 종료 화면 문구, 캐치 구경하기 링크(새 탭), 이미지 저장, 주소 복사, 다시 하기
- 하단 비공식 표기와 결과 이미지의 비공식 표기
- 모바일에서 안내 문구
- 크롬·엣지·사파리(가능하면)에서 동작
- GA4 실시간에서 `game_start`, `game_clear`, `banner_click`, `share_image`, `share_link`

- [ ] **Step 2: 에셋 라이선스 최종 확인**

`assets/CREDITS.md`에 사용한 모든 에셋이 적혀 있고 라이선스가 확인됐는지 점검한다.

- [ ] **Step 3: 배포 확정**

수정 사항을 `main`에 푸시하면 Vercel이 자동 배포한다. 최종 주소를 PPT 전략 페이지에 넣을 수 있도록 팀에 공유하고, 화면 캡처를 확보한다. **11/27 23:59 마감 전에 마지막 배포본이 정상 동작하는지 한 번 더 열어 본다.**

---

## 계획 밖 항목 (SPEC 미정)

- **추가 미니게임(11/20까지)**: SPEC에서 종류가 미정이다. 11/16 MVP 완성 후 시간을 보고 종류를 정한 뒤 별도 계획으로 추가한다. 소각장과 같은 조작 구조(클릭·드래그·연타)를 재활용한다.
- **PPT**: 이 작업 범위 밖이다.

## SPEC 대응 점검

| SPEC 요구 | 태스크 |
|---|---|
| 2D 탑다운 월드, 이동·상호작용, 소각로·위로 문구 오브젝트 | 6 |
| 스트레스 지수 100 → 목표 20, 실패 없음 | 2, 3 |
| 종이 3종 순서·장수·감소량, 연타 파쇄 | 3, 4, 7 |
| 종료 화면 메시지·배너 "캐치 구경하기" | 8 |
| 결과 이미지 저장 + 주소 복사 | 8 |
| 비공식 표기(월드·결과 이미지) | 1, 8 |
| PC 전용, 모바일 안내 | 1 |
| GA4 이벤트 5종 | 5, 7, 8, 10 |
| 무료 에셋 + 브랜드 요소 직접 제작, 라이선스 확인 | 9, 12 |
| Vercel 배포 | 10, 12 |
| 연출 강화, 11/21~27 예비 | 11, 12 |
