// Builds a compact "here's what already exists" catalog for the AI authoring prompt,
// so the model can reuse real actions/features/combatants by exact name instead of
// reinventing near-duplicates. Lives in the UI layer because it leans on the human-
// readable describe.ts helpers and the curated SRD data.

import type { Action, Combatant, Feature, Scenario } from '../engine/types';
import { abilityMod } from '../engine/state';
import {
  LEVEL_1_CLASS_PCS,
  LEVEL_3_CLASS_PCS,
  SAMPLE_MONSTERS,
  SRD_ACTIONS,
  SRD_FEATURES,
} from '../data/srd';
import { SRD_WEAPONS } from '../data/weapons';
import { describeActionGeneric, describeFeature } from './describe';

function uniqueByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Two strongest ability modifiers, e.g. "INT +4, DEX +2" — enough to signal a stat block's shape. */
function topAbilities(c: Combatant): string {
  return (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const)
    .map((ab) => ({ ab, mod: abilityMod(c.abilityScores[ab]) }))
    .sort((a, b) => b.mod - a.mod)
    .slice(0, 2)
    .map(({ ab, mod }) => `${ab.toUpperCase()} ${mod >= 0 ? '+' : ''}${mod}`)
    .join(', ');
}

export function buildLibraryReference(scenario: Scenario): string {
  const weaponsById: Record<string, (typeof SRD_WEAPONS)[number]> = {};
  for (const w of [...SRD_WEAPONS, ...scenario.weapons]) weaponsById[w.id] = w;

  const actions: Action[] = uniqueByName([...SRD_ACTIONS, ...scenario.actions]).filter(
    (a) => a.kind !== 'dodge' && a.kind !== 'move',
  );
  const features: Feature[] = uniqueByName([...SRD_FEATURES, ...(scenario.features ?? [])]);
  const combatants: Combatant[] = uniqueByName([
    ...scenario.combatants,
    ...LEVEL_1_CLASS_PCS,
    ...LEVEL_3_CLASS_PCS,
    ...SAMPLE_MONSTERS,
  ]);

  const actionLines = actions.map((a) => `- ${a.name} [${a.kind}]: ${describeActionGeneric(a, weaponsById)}`);
  const featureLines = features.map((f) => `- ${f.name}: ${describeFeature(f)}`);
  const combatantLines = combatants.map(
    (c) => `- ${c.name} (${c.side === 'pc' ? 'PC' : 'monster'}): ${c.maxHp} HP, AC ${c.ac}, ${topAbilities(c)}`,
  );

  return [
    `Actions:\n${actionLines.join('\n')}`,
    `Features / feats / traits:\n${featureLines.join('\n')}`,
    `Sample combatants (reuse their stats by name if they match the request):\n${combatantLines.join('\n')}`,
  ].join('\n\n');
}
