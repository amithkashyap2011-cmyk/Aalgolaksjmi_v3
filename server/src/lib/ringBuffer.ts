/*
 * ─── RingBuffer ────────────────────────────────────────
 *
 * Fixed‑capacity circular buffer for rolling windows.
 * Push is O(1), iteration is O(n), no array re‑allocation.
 */

export class RingBuffer<T> {
  private buf: (T | undefined)[];
  private head = 0;   // next write index
  private _size = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Array(capacity);
  }

  get size(): number { return this._size; }
  get isFull(): boolean { return this._size === this.capacity; }

  /** Push a value; oldest value is overwritten when full. */
  push(value: T): void {
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  /** Get item by logical index (0 = oldest). */
  at(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    const realIdx = (this.head - this._size + index + this.capacity) % this.capacity;
    return this.buf[realIdx];
  }

  /** Most recent value. */
  last(): T | undefined {
    if (this._size === 0) return undefined;
    return this.buf[(this.head - 1 + this.capacity) % this.capacity];
  }

  /** Convert to array (oldest → newest). */
  toArray(): T[] {
    const arr: T[] = [];
    for (let i = 0; i < this._size; i++) {
      arr.push(this.at(i) as T);
    }
    return arr;
  }

  /** Sum of numeric values (when T extends number). */
  sum(): number {
    let s = 0;
    for (let i = 0; i < this._size; i++) s += this.at(i) as number;
    return s;
  }

  clear(): void {
    this.head = 0;
    this._size = 0;
  }
}
