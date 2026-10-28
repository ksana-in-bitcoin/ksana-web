const HEX_PAIRS = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Reproducible pseudo-random numbers (mulberry32). All randomness in the simulator comes from here. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in the closed interval [min, max] */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r <= 0) return item;
    }
    const last = items[items.length - 1];
    if (!last) throw new Error('weighted pick from empty list');
    return last[0];
  }

  /** Exponential distribution, used to simulate PoW block production and Poisson arrivals */
  exp(mean: number): number {
    return -Math.log(1 - this.next()) * mean;
  }

  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.floor(this.next() * 256);
    return out;
  }

  hex(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += HEX_PAIRS[Math.floor(this.next() * 256)];
    return s;
  }
}
