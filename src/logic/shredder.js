// 파쇄기 상태 (순수). 자소서 한 장을 넣고 탭(연타)으로 파쇄한다.
export class ShredderState {
  constructor() {
    this.reset();
  }

  get loaded() {
    return this._item !== null;
  }

  get remaining() {
    return this._remaining;
  }

  // 이미 들어 있으면 false.
  load(item) {
    if (this._item) return false;
    this._item = item;
    this._remaining = item.taps;
    return true;
  }

  // 한 번 탭. 비어 있으면 { reduced: 0, done: false }. 마지막 탭이면 done=true 로 비운다.
  tap() {
    if (!this._item) return { reduced: 0, done: false };
    const reduced = this._item.reducePerTap;
    this._remaining -= 1;
    const done = this._remaining <= 0;
    if (done) this.reset();
    return { reduced, done };
  }

  reset() {
    this._item = null;
    this._remaining = 0;
  }
}
