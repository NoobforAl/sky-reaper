/**
 * Fixed-capacity object pool with a dense active list.
 * Iterate `items` BACKWARDS when removing with releaseAt() (swap-remove).
 */
export class Pool<T> {
  readonly items: T[] = [];
  private free: T[] = [];
  constructor(
    readonly capacity: number,
    factory: () => T,
  ) {
    for (let i = 0; i < capacity; i++) this.free.push(factory());
  }
  get size(): number {
    return this.items.length;
  }
  /** returns a recycled object (caller must fully re-initialise it) or null when exhausted */
  acquire(): T | null {
    const o = this.free.pop();
    if (o === undefined) return null;
    this.items.push(o);
    return o;
  }
  /** swap-remove by index (changes order) */
  releaseAt(i: number): void {
    const items = this.items;
    // a stale / out-of-range index must never pop a live object or push `undefined` onto the free list
    if (i < 0 || i >= items.length) return;
    const o = items[i]!;
    const last = items.pop()!;
    if (i < items.length) items[i] = last;
    this.free.push(o);
  }
  /** order-preserving remove by index; object is NOT returned to the free list (caller decides) */
  spliceAt(i: number): T {
    return this.items.splice(i, 1)[0]!;
  }
  /** return an object that was spliced out */
  recycle(o: T): void {
    this.free.push(o);
  }
  clear(): void {
    while (this.items.length) this.free.push(this.items.pop()!);
  }
}

/** mulberry32 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
