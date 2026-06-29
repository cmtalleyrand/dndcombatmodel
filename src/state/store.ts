// Scenario persistence (localStorage) and small immutable update helpers.

import type { Action, Combatant, Rule, Scenario, ScriptPreset, Weapon } from '../engine/types';
import { defaultScenario } from '../data/srd';
import { SRD_WEAPONS } from '../data/weapons';

const STORAGE_KEY = 'dnd-combat-sim:scenario:v1';
const PRESETS_KEY = 'dnd-combat-sim:presets:v1';

export function loadScenario(): Scenario {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Scenario;
      if (!s.weapons) s.weapons = SRD_WEAPONS; // back-compat for v1 scenarios
      return s;
    }
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

/** Clone an action with a new id and "(copy)" suffix, appended to the library. */
export function duplicateAction(scenario: Scenario, id: string): { scenario: Scenario; newId: string } {
  const src = scenario.actions.find((a) => a.id === id);
  if (!src) return { scenario, newId: id };
  const copy: Action = { ...src, id: genId('act'), name: `${src.name} (copy)` };
  return { scenario: { ...scenario, actions: [...scenario.actions, copy] }, newId: copy.id };
}

// ---- weapons ----

export function upsertWeapon(scenario: Scenario, w: Weapon): Scenario {
  const idx = scenario.weapons.findIndex((x) => x.id === w.id);
  const weapons =
    idx >= 0 ? scenario.weapons.map((x) => (x.id === w.id ? w : x)) : [...scenario.weapons, w];
  return { ...scenario, weapons };
}

export function removeWeapon(scenario: Scenario, id: string): Scenario {
  return { ...scenario, weapons: scenario.weapons.filter((w) => w.id !== id) };
}

// ---- script reuse ----

/** Copy one combatant's whole script onto another (renumbering priorities). */
export function copyScript(scenario: Scenario, fromId: string, toId: string): Scenario {
  const from = scenario.combatants.find((c) => c.id === fromId);
  const to = scenario.combatants.find((c) => c.id === toId);
  if (!from || !to) return scenario;
  const script = from.script.map((r, i) => ({ ...r, priority: i + 1 }));
  return upsertCombatant(scenario, { ...to, script });
}

// ---- script presets (stored separately from the scenario) ----

export function loadPresets(): ScriptPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) return JSON.parse(raw) as ScriptPreset[];
  } catch {
    // ignore
  }
  return [];
}

export function savePreset(name: string, rules: Rule[]): ScriptPreset[] {
  const presets = loadPresets();
  const preset: ScriptPreset = { id: genId('preset'), name, rules };
  const next = [...presets, preset];
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function deletePreset(id: string): ScriptPreset[] {
  const next = loadPresets().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
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
  // back-compat: older exports (and v1 scenarios) have no weapons library.
  if (!parsed.weapons) parsed.weapons = SRD_WEAPONS;
  return parsed;
}
