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
