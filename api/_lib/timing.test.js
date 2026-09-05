import { describe, it, expect, beforeEach } from 'vitest';
import { withTiming, addPhase, timePhase, serverTimingHeader, _resetColdForTest } from './timing.js';

// The point of this module is to make a slow request explain itself. Two
// properties decide whether it can be trusted: it must not attribute one
// request's time to another (a serverless instance can serve overlapping
// requests), and it must never be able to break a response.

beforeEach(() => _resetColdForTest());

describe('reporting phases', () => {
  it('emits a Server-Timing value with the phases and a total', async () => {
    const header = await withTiming(async () => {
      addPhase('auth', 40);
      addPhase('db', 100);
      return serverTimingHeader();
    });
    expect(header).toMatch(/auth;dur=40/);
    expect(header).toMatch(/db;dur=100/);
    expect(header).toMatch(/total;dur=\d+/);
  });

  it('accumulates repeated phases rather than overwriting them', async () => {
    const header = await withTiming(async () => {
      addPhase('db', 10);
      addPhase('db', 15);
      return serverTimingHeader();
    });
    expect(header).toMatch(/db;dur=25/);
  });

  it('times an awaited operation, including one that throws', async () => {
    const header = await withTiming(async () => {
      await timePhase('db', () => new Promise((r) => setTimeout(r, 20)));
      await expect(timePhase('auth', async () => { throw new Error('nope'); })).rejects.toThrow('nope');
      return serverTimingHeader();
    });
    // A failed phase still cost time and must still be reported — otherwise
    // the slowest requests, the failing ones, report as the cheapest.
    expect(header).toMatch(/db;dur=[12]\d/);
    expect(header).toMatch(/auth;dur=\d+/);
  });
});

describe('cold starts', () => {
  it('marks the first request an instance serves, and only the first', async () => {
    const first = await withTiming(async () => serverTimingHeader());
    const second = await withTiming(async () => serverTimingHeader());
    expect(first).toMatch(/cold;dur=1/);
    expect(second).toMatch(/cold;dur=0/);
  });
});

describe('not mixing requests up', () => {
  it('keeps concurrent requests\' phases separate', async () => {
    // The failure this guards against is a shared accumulator billing one
    // request's database time to another — a confidently wrong number,
    // which is worse than no number.
    const [a, b] = await Promise.all([
      withTiming(async () => {
        addPhase('db', 500);
        await new Promise((r) => setTimeout(r, 10));
        return serverTimingHeader();
      }),
      withTiming(async () => {
        addPhase('db', 7);
        await new Promise((r) => setTimeout(r, 5));
        return serverTimingHeader();
      }),
    ]);
    expect(a).toMatch(/db;dur=500/);
    expect(b).toMatch(/db;dur=7/);
  });
});

describe('never breaking a response', () => {
  it('ignores a phase recorded outside any request', () => {
    expect(() => addPhase('db', 5)).not.toThrow();
  });

  it('returns null outside a request, so no misleading header is sent', () => {
    expect(serverTimingHeader()).toBeNull();
  });
});
