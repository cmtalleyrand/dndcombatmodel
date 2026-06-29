// Scenario persistence (localStorage) and small immutable update helpers.

import type { Action, Combatant, Scenario } from '../engine/types';
import { defaultScenario } from '../data/srd';

const STORAGE_KEY = 'dnd-combat-sim:scenario:v1';

export function loadScenario(): Scenario {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Scenario;
  } catch {
    // ignore corrupt storage
  }
  return defaultScenario();
}

export function saveScenario(scenario: Scenario): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
  } catch {
    // storage full / unavailable — non-fatal
  }
}

export function resetScenario(): Scenario {
  const s = defaultScenario();
  saveScenario(s);
  return s;
}

// ---- immutable helpers ----

export function upsertCombatant(scenario: Scenario, c: Combatant): Scenario {
  const idx = scenario.combatants.findIndex((x) => x.id === c.id);
  const combatants =
    idx >= 0
      ? scenario.combatants.map((x) => (x.id === c.id ? c : x))
      : [...scenario.combatants, c];
  return { ...scenario, combatants };
}

export function removeCombatant(scenario: Scenario, id: string): Scenario {
  return {
    ...scenario,
    combatants: scenario.combatants.filter((c) => c.id !== id),
    fixedOrder: scenario.fixedOrder?.filter((x) => x !== id),
  };
}

export function upsertAction(scenario: Scenario, a: Action): Scenario {
  const idx = scenario.actions.findIndex((x) => x.id === a.id);
  const actions =
    idx >= 0 ? scenario.actions.map((x) => (x.id === a.id ? a : x)) : [...scenario.actions, a];
  return { ...scenario, actions };
}

export function removeAction(scenario: Scenario, id: string): Scenario {
  return { ...scenario, actions: scenario.actions.filter((a) => a.id !== id) };
}

export function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- JSON import/export ----

export function exportScenario(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function importScenario(json: string): Scenario {
  const parsed = JSON.parse(json) as Scenario;
  if (!parsed.combatants || !parsed.actions) {
    throw new Error('Invalid scenario JSON: missing combatants or actions.');
  }
  return parsed;
}
