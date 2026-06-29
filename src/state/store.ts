// Scenario persistence (localStorage) and small immutable update helpers.

import type { Action, Combatant, Rule, Scenario, ScriptPreset, TargetList, Weapon } from '../engine/types';
import { defaultScenario } from '../data/srd';
import { SRD_WEAPONS } from '../data/weapons';

const STORAGE_KEY = 'dnd-combat-sim:scenario:v1';
const PRESETS_KEY = 'dnd-combat-sim:presets:v1';
export const AI_DRAFTS_KEY = 'dnd-combat-sim:ai-drafts:v1';
export const BUNDLE_VERSION = 1;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface AIDraft {
  id: string;
  name: string;
  created: string;
  updated: string;
  approvalTemplate: string;
  draftData: JsonValue;
}

export interface FullBundle {
  version: number;
  currentScenario: Scenario;
  scriptPresets?: ScriptPreset[];
  savedAIDrafts?: AIDraft[];
}

export function loadScenario(): Scenario {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Scenario;
      if (!s.weapons) s.weapons = SRD_WEAPONS; // back-compat for v1 scenarios
      if (!s.targetLists) s.targetLists = []; // back-compat for Phase 1/2 scenarios
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

// ---- target lists ----

export function upsertTargetList(scenario: Scenario, t: TargetList): Scenario {
  const idx = scenario.targetLists.findIndex((x) => x.id === t.id);
  const targetLists =
    idx >= 0 ? scenario.targetLists.map((x) => (x.id === t.id ? t : x)) : [...scenario.targetLists, t];
  return { ...scenario, targetLists };
}

export function removeTargetList(scenario: Scenario, id: string): Scenario {
  return { ...scenario, targetLists: scenario.targetLists.filter((t) => t.id !== id) };
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

// ---- AI drafts (stored separately from the scenario) ----

export function loadAIDrafts(): AIDraft[] {
  try {
    const raw = localStorage.getItem(AI_DRAFTS_KEY);
    if (raw) return JSON.parse(raw) as AIDraft[];
  } catch {
    // ignore
  }
  return [];
}

export function saveAIDrafts(drafts: AIDraft[]): AIDraft[] {
  const next = sanitizeForExport(drafts) as AIDraft[];
  try {
    localStorage.setItem(AI_DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function upsertAIDraft(draft: AIDraft): AIDraft[] {
  const safeDraft = sanitizeForExport(draft) as AIDraft;
  const drafts = loadAIDrafts();
  const idx = drafts.findIndex((d) => d.id === safeDraft.id);
  const next = idx >= 0 ? drafts.map((d) => (d.id === safeDraft.id ? safeDraft : d)) : [...drafts, safeDraft];
  return saveAIDrafts(next);
}

export function duplicateAIDraft(id: string): AIDraft[] {
  const drafts = loadAIDrafts();
  const src = drafts.find((d) => d.id === id);
  if (!src) return drafts;
  const now = new Date().toISOString();
  return saveAIDrafts([...drafts, { ...src, id: genId('draft'), name: `${src.name} (copy)`, created: now, updated: now }]);
}

export function deleteAIDraft(id: string): AIDraft[] {
  return saveAIDrafts(loadAIDrafts().filter((d) => d.id !== id));
}

export function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- JSON import/export ----

export function exportScenario(scenario: Scenario): string {
  return JSON.stringify(sanitizeForExport(scenario), null, 2);
}

export function importScenario(json: string): Scenario {
  const parsed = JSON.parse(json) as Scenario;
  return normalizeScenario(parsed);
}

export function exportFullBundle(scenario: Scenario, options: { includePresets?: boolean; includeAIDrafts?: boolean } = {}): string {
  const bundle: FullBundle = {
    version: BUNDLE_VERSION,
    currentScenario: scenario,
  };
  if (options.includePresets ?? true) bundle.scriptPresets = loadPresets();
  if (options.includeAIDrafts ?? true) bundle.savedAIDrafts = loadAIDrafts();
  return JSON.stringify(sanitizeForExport(bundle), null, 2);
}

export function importFullBundle(json: string): FullBundle {
  const parsed = JSON.parse(json) as FullBundle;
  if (!parsed.version || !parsed.currentScenario) {
    throw new Error('Invalid bundle JSON: missing version or currentScenario.');
  }
  const bundle: FullBundle = {
    version: parsed.version,
    currentScenario: normalizeScenario(parsed.currentScenario),
  };
  if (parsed.scriptPresets) bundle.scriptPresets = sanitizeForExport(parsed.scriptPresets) as ScriptPreset[];
  if (parsed.savedAIDrafts) bundle.savedAIDrafts = sanitizeForExport(parsed.savedAIDrafts) as AIDraft[];
  if (bundle.scriptPresets) {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(bundle.scriptPresets));
    } catch {
      // ignore
    }
  }
  if (bundle.savedAIDrafts) saveAIDrafts(bundle.savedAIDrafts);
  return bundle;
}

function normalizeScenario(parsed: Scenario): Scenario {
  if (!parsed.combatants || !parsed.actions) {
    throw new Error('Invalid scenario JSON: missing combatants or actions.');
  }
  if (!parsed.weapons) parsed.weapons = SRD_WEAPONS;
  if (!parsed.targetLists) parsed.targetLists = [];
  return sanitizeForExport(parsed) as Scenario;
}

function sanitizeForExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeForExport(item));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([key]) => !isApiKeyField(key));
    return Object.fromEntries(entries.map(([key, item]) => [key, sanitizeForExport(item)]));
  }
  return value;
}

function isApiKeyField(key: string): boolean {
  const normalized = key.replace(/[-_\s]/g, '').toLowerCase();
  return normalized.includes('apikey') || normalized === 'authorization' || normalized === 'openaitoken';
}
