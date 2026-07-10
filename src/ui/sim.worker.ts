// Web Worker that runs the Monte-Carlo simulation off the main thread, reporting
// progress so the UI stays responsive and the run can be cancelled (via terminate()).

import { deriveSeed } from '../engine/dice';
import { runSimulation, type RunResult } from '../engine/simulator';
import { aggregate } from '../engine/statistics';
import type { Scenario } from '../engine/types';

export interface SimRequest {
  scenario: Scenario;
  simulations: number;
  baseSeed: number;
}

export type SimResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; stats: ReturnType<typeof aggregate> };

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { scenario, simulations, baseSeed } = e.data;
  const runs: RunResult[] = [];
  const batch = Math.max(1, Math.floor(simulations / 100));
  for (let i = 0; i < simulations; i++) {
    // Only the first (representative) run records replay frames; the rest stay light.
    runs.push(runSimulation(scenario, deriveSeed(baseSeed, i), i === 0));
    if (i % batch === 0) {
      (self as unknown as Worker).postMessage({ type: 'progress', done: i, total: simulations } satisfies SimResponse);
    }
  }
  const stats = aggregate(scenario, runs);
  (self as unknown as Worker).postMessage({ type: 'done', stats } satisfies SimResponse);
};
