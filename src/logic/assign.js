// 담당 면접관제 (순수). 지원자 의자 3개와 면접관 3명을 위치로 1:1 짝지우고(의자 -> 면접관), 면접관 한 명이 한 번에 한 가지 일만 하도록 중재한다.
// 일의 종류: primary(담당 일 — 내 장면이나 담당 의자 방문자의 질문·반응·돌발행동 반응) / secondary(옆 자리 장면에 곁들이는 가벼운 반응, 동작 위주).
// 규칙: primary 는 secondary 를 끊고 시작하고, 진행 중인 primary 는 무엇에도 끊기지 않는다. 바쁜 면접관에게 온 primary 는 한 건만 기다리고(최신 것이 이긴다, 오래되면 버린다),
// secondary 는 면접관이 한가할 때만 한다(아니면 건너뛴다). 이 모듈은 시계(초)를 인자로 받을 뿐 시간을 직접 재지 않는다.

export const PENDING_MAX_AGE = 4; // 기다리는 일은 이 시간(초)이 지나면 버린다

// 의자 -> 담당 면접관: 의자와 가장 가까운(x 기준) 면접관. chairs: [{ id, x }], interviewerSeats: [{ id, x }]. { [chairId]: interviewerId }.
export function assignInterviewers(chairs, interviewerSeats) {
  const out = {};
  for (const chair of chairs ?? []) {
    let best = null;
    for (const seat of interviewerSeats ?? []) if (best === null || Math.abs(seat.x - chair.x) < Math.abs(best.x - chair.x) - 1e-9) best = seat;
    if (best) out[chair.id] = best.id;
  }
  return out;
}

// 담당 면접관 id. 의자를 모르면(대기 의자·마당 벤치 등) null.
export const interviewerFor = (assignments, chairId) => assignments?.[chairId] ?? null;

// 중재자. ids: 면접관 id 목록.
// request(id, { kind, owner, t, duration?, payload?, queue? }) -> { decision: 'start', preempted } | { decision: 'queue', dropped } | { decision: 'skip' }
//   - primary: 한가하면 시작, secondary 중이면 그것을 끊고 시작(preempted), primary 중이면 기다린다(queue: false 면 건너뜀).
//   - secondary: 한가할 때만 시작, 아니면 건너뜀.
//   duration 은 일이 스스로 끝나는 시간(생략하면 release 로 끝낼 때까지).
// release(id, owner, t) -> 끝낸다(owner 가 다르면 무시). 기다리던 일이 있으면 곧바로 시작한다. tick(t) -> 시간이 다 된 일을 끝내고 기다리던 일을 시작/폐기한다.
// 둘 다 이벤트 목록 [{ type: 'ended' | 'started' | 'dropped', id, ... }] 을 돌려준다(그리는 쪽이 정리·시작·폐기를 한다).
export function createArbiter({ ids, maxAge = PENDING_MAX_AGE }) {
  const states = new Map(ids.map((id) => [id, { kind: 'idle', owner: null, until: Infinity, pending: null }]));
  const need = (id) => {
    const s = states.get(id);
    if (!s) throw new Error(`알 수 없는 면접관: ${id}`);
    return s;
  };
  const begin = (s, kind, owner, t, duration) => { s.kind = kind; s.owner = owner; s.until = Number.isFinite(duration) ? t + duration : Infinity; };

  // 끝난 자리에 기다리던 일이 있으면 시작(오래되면 폐기).
  function promote(id, s, t, out) {
    const p = s.pending;
    if (!p) return;
    s.pending = null;
    if (t - p.t > maxAge) { out.push({ type: 'dropped', id, entry: p, reason: 'stale' }); return; }
    begin(s, 'primary', p.owner, t, p.duration);
    out.push({ type: 'started', id, entry: p });
  }

  const api = {
    ids: [...ids],
    state(id) { const s = need(id); return { kind: s.kind, owner: s.owner, pending: s.pending ? { ...s.pending } : null }; },
    isIdle: (id) => need(id).kind === 'idle',
    isPrimary: (id) => need(id).kind === 'primary',

    request(id, { kind, owner, t, duration = Infinity, payload = null, queue = true }) {
      const s = need(id);
      if (kind === 'secondary') {
        if (s.kind !== 'idle') return { decision: 'skip' };
        begin(s, 'secondary', owner, t, duration);
        return { decision: 'start', preempted: null };
      }
      if (kind !== 'primary') throw new Error(`알 수 없는 일 종류: ${kind}`);
      if (s.kind === 'primary') {
        if (!queue) return { decision: 'skip' };
        const dropped = s.pending ? { ...s.pending, reason: 'replaced' } : null; // 최신 것이 이긴다
        s.pending = { owner, t, duration, payload };
        return { decision: 'queue', dropped };
      }
      const preempted = s.kind === 'secondary' ? { kind: 'secondary', owner: s.owner } : null;
      begin(s, 'primary', owner, t, duration);
      return { decision: 'start', preempted };
    },

    release(id, owner, t) {
      const s = need(id);
      const out = [];
      if (s.kind === 'idle' || (owner !== undefined && s.owner !== owner)) return out;
      out.push({ type: 'ended', id, owner: s.owner, kind: s.kind });
      s.kind = 'idle';
      s.owner = null;
      s.until = Infinity;
      promote(id, s, t, out);
      return out;
    },

    tick(t) {
      const out = [];
      for (const [id, s] of states) {
        if (s.pending && t - s.pending.t > maxAge) { out.push({ type: 'dropped', id, entry: s.pending, reason: 'stale' }); s.pending = null; }
        if (s.kind !== 'idle' && s.until <= t + 1e-9) out.push(...api.release(id, undefined, t));
      }
      return out;
    },

    // 마지막 문항 완주(최종 합격!) 때 일어나 박수 칠 면접관: 담당 말고 둘 다 남의 primary 가 아니면 셋 모두, 아니면 담당만.
    finaleIds(assigned) {
      const others = ids.filter((id) => id !== assigned);
      return others.every((id) => need(id).kind !== 'primary') ? [assigned, ...others] : [assigned];
    },

    // 모든 일을 즉시 지운다(공간을 나갔을 때). 기다리던 일도 버린다.
    reset() {
      const dropped = [];
      for (const [id, s] of states) {
        if (s.pending) dropped.push({ type: 'dropped', id, entry: s.pending, reason: 'reset' });
        Object.assign(s, { kind: 'idle', owner: null, until: Infinity, pending: null });
      }
      return dropped;
    },
  };
  return api;
}
