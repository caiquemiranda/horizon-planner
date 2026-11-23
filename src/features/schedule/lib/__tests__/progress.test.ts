import { describe, expect, it } from 'vitest';

import { type LeafProgress, summarizeProgress } from '../progress';

let next = 0;
const task = (progress: number): LeafProgress => ({
  id: `t${String((next += 1))}`,
  progress,
  isMilestone: false,
});
const milestone = (progress: number): LeafProgress => ({
  id: `m${String((next += 1))}`,
  progress,
  isMilestone: true,
});

describe('summarizeProgress', () => {
  it('counts tasks: 4 tasks with 1 done is 25%, with 2 done is 50%', () => {
    expect(summarizeProgress([task(100), task(0), task(0), task(0)])).toEqual({
      progress: 25,
      total: 4,
      done: 1,
    });
    expect(summarizeProgress([task(100), task(100), task(0), task(0)]).progress).toBe(50);
  });

  it('goes back down when a done task is reopened', () => {
    expect(summarizeProgress([task(100), task(100), task(0), task(0)]).progress).toBe(50);
    expect(summarizeProgress([task(100), task(60), task(0), task(0)]).progress).toBe(40);
  });

  it('weighs every task the same, whatever its duration', () => {
    // Before, a 10-day task at 100% and a 1-day task at 0% gave 91%.
    expect(summarizeProgress([task(100), task(0)]).progress).toBe(50);
  });

  it('keeps partial work of a task that is under way', () => {
    expect(summarizeProgress([task(50), task(0)])).toEqual({ progress: 25, total: 2, done: 0 });
  });

  it('leaves milestones out when there is other work', () => {
    expect(summarizeProgress([task(100), task(0), milestone(0)])).toEqual({
      progress: 50,
      total: 2,
      done: 1,
    });
  });

  it('counts milestones when they are all there is', () => {
    expect(summarizeProgress([milestone(100), milestone(0)])).toEqual({
      progress: 50,
      total: 2,
      done: 1,
    });
  });

  it('gives 0% without eligible tasks, never NaN', () => {
    expect(summarizeProgress([])).toEqual({ progress: 0, total: 0, done: 0 });
  });

  it('shows 100% only when everything is done, and never hides started work', () => {
    const almost = [...Array.from({ length: 199 }, () => task(100)), task(0)];
    expect(summarizeProgress(almost).progress).toBe(99);
    expect(summarizeProgress([task(100), task(100)]).progress).toBe(100);
    const barely = [task(1), ...Array.from({ length: 199 }, () => task(0))];
    expect(summarizeProgress(barely).progress).toBe(1);
  });

  it('does not depend on the order of the tasks', () => {
    const leaves = [task(100), task(30), task(0), task(70)];
    expect(summarizeProgress([...leaves].reverse())).toEqual(summarizeProgress(leaves));
  });
});
