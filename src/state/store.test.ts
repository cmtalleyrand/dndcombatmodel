import { beforeEach, describe, expect, it } from 'vitest';
import { defaultScenario, DEFAULT_CONDITION_LIBRARY, DEFAULT_RULE_LIBRARY } from '../data/srd';
import {
  AI_DRAFTS_KEY,
  deleteCombatantTemplate,
  duplicateConditionPreset,
  duplicateRuleTemplate,
  exportFullBundle,
  importFullBundle,
  importScenario,
  loadCombatantTemplates,
  mergeTemplateLibrary,
  removeConditionPreset,
  removeRuleTemplate,
  saveCombatantTemplate,
  upsertConditionPreset,
  upsertRuleTemplate,
  type AIDraft,
} from './store';

function installLocalStorage() {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
}

describe('full bundle persistence', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('exports and imports scenario content and saved AI drafts', () => {
    const scenario = { ...defaultScenario(), name: 'Bundle Round Trip' };
    const drafts: AIDraft[] = [
      {
        id: 'draft-1',
        name: 'Goblin revision',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-02T00:00:00.000Z',
        approvalTemplate: 'Approve adding one goblin.',
        draftData: { operations: [{ op: 'add', path: '/combatants' }] },
      },
    ];
    localStorage.setItem(AI_DRAFTS_KEY, JSON.stringify(drafts));

    const exported = exportFullBundle(scenario);
    localStorage.clear();
    const imported = importFullBundle(exported);

    expect(imported.currentScenario.name).toBe('Bundle Round Trip');
    expect(imported.currentScenario.combatants).toHaveLength(scenario.combatants.length);
    expect(imported.savedAIDrafts).toEqual(drafts);
    expect(JSON.parse(localStorage.getItem(AI_DRAFTS_KEY) ?? '[]')).toEqual(drafts);
  });

  it('excludes API-key fields from exported bundle data', () => {
    const scenario = { ...defaultScenario(), apiKey: 'secret-scenario-key' } as ReturnType<typeof defaultScenario> & { apiKey: string };
    const drafts = [
      {
        id: 'draft-1',
        name: 'Unsafe draft',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-02T00:00:00.000Z',
        approvalTemplate: 'Approve safely.',
        draftData: { api_key: 'secret-draft-key', nested: { openAiToken: 'secret-token', keep: true } },
      },
    ];
    localStorage.setItem(AI_DRAFTS_KEY, JSON.stringify(drafts));

    const exported = exportFullBundle(scenario);

    expect(exported).not.toContain('secret-scenario-key');
    expect(exported).not.toContain('secret-draft-key');
    expect(exported).not.toContain('secret-token');
    expect(exported).not.toContain('apiKey');
    expect(exported).not.toContain('api_key');
    expect(exported).toContain('"keep": true');
  });
});

describe('rules library CRUD', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('upserts, duplicates, and removes rule templates', () => {
    let scenario = defaultScenario();
    const startCount = scenario.ruleLibrary.length;

    const template = { id: 'ruletpl-test', name: 'Test rule', condition: { type: 'always' as const }, actionId: scenario.actions[0].id, target: { strategy: 'lowestHpEnemy' as const } };
    scenario = upsertRuleTemplate(scenario, template);
    expect(scenario.ruleLibrary).toHaveLength(startCount + 1);
    expect(scenario.ruleLibrary.find((t) => t.id === 'ruletpl-test')).toEqual(template);

    // upsert again with the same id updates in place, not appends
    scenario = upsertRuleTemplate(scenario, { ...template, name: 'Renamed' });
    expect(scenario.ruleLibrary).toHaveLength(startCount + 1);
    expect(scenario.ruleLibrary.find((t) => t.id === 'ruletpl-test')?.name).toBe('Renamed');

    const { scenario: withCopy, newId } = duplicateRuleTemplate(scenario, 'ruletpl-test');
    expect(withCopy.ruleLibrary).toHaveLength(startCount + 2);
    expect(withCopy.ruleLibrary.find((t) => t.id === newId)?.name).toBe('Renamed (copy)');

    const afterRemove = removeRuleTemplate(withCopy, 'ruletpl-test');
    expect(afterRemove.ruleLibrary.some((t) => t.id === 'ruletpl-test')).toBe(false);
    expect(afterRemove.ruleLibrary).toHaveLength(startCount + 1);
  });
});

describe('conditions library CRUD', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('upserts, duplicates, and removes condition presets', () => {
    let scenario = defaultScenario();
    const startCount = scenario.conditionLibrary.length;

    const preset = { id: 'condpre-test', name: 'Test preset', kind: 'prone' as const, duration: { type: 'rounds' as const, rounds: 2 } };
    scenario = upsertConditionPreset(scenario, preset);
    expect(scenario.conditionLibrary).toHaveLength(startCount + 1);
    expect(scenario.conditionLibrary.find((p) => p.id === 'condpre-test')).toEqual(preset);

    const { scenario: withCopy, newId } = duplicateConditionPreset(scenario, 'condpre-test');
    expect(withCopy.conditionLibrary).toHaveLength(startCount + 2);
    expect(withCopy.conditionLibrary.find((p) => p.id === newId)?.name).toBe('Test preset (copy)');

    const afterRemove = removeConditionPreset(withCopy, 'condpre-test');
    expect(afterRemove.conditionLibrary.some((p) => p.id === 'condpre-test')).toBe(false);
    expect(afterRemove.conditionLibrary).toHaveLength(startCount + 1);
  });
});

describe('persistent combatant template library', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('saves a combatant with its actions/weapons and applies it into an empty scenario', () => {
    const scenario = defaultScenario();
    const source = scenario.combatants.find((c) => c.side === 'pc' && c.actionIds.length > 0)!;

    const saved = saveCombatantTemplate(scenario, source, 'My Hero');
    expect(saved).toHaveLength(1);
    expect(loadCombatantTemplates()).toHaveLength(1);
    const tpl = saved[0];
    expect(tpl.name).toBe('My Hero');
    expect(tpl.actions.map((a) => a.id).sort()).toEqual([...source.actionIds].sort());

    // Applying into an empty scenario brings the referenced actions along.
    const empty = { ...defaultScenario(), combatants: [], actions: [], weapons: [] };
    const merged = mergeTemplateLibrary(empty, tpl);
    for (const id of source.actionIds) {
      expect(merged.actions.some((a) => a.id === id)).toBe(true);
    }

    const remaining = deleteCombatantTemplate(tpl.id);
    expect(remaining).toHaveLength(0);
    expect(loadCombatantTemplates()).toHaveLength(0);
  });

  it('saves a combatant with its features and brings them along when re-applied', () => {
    const base = defaultScenario();
    const feature = { id: 'feat-rage', name: 'Rage', timing: 'onHit' as const, extraDamage: [{ flat: 2, type: 'slashing' as const, label: 'Rage' }] };
    const source = { ...base.combatants.find((c) => c.side === 'pc')!, featureIds: [feature.id] };
    const scenario = { ...base, features: [...(base.features ?? []), feature], combatants: base.combatants.map((c) => (c.id === source.id ? source : c)) };

    const [tpl] = saveCombatantTemplate(scenario, source, 'Barbarian');
    expect(tpl.features.map((f) => f.id)).toEqual(['feat-rage']);

    // Applying into a scenario that lacks the feature merges it in (not just the actions).
    const empty = { ...defaultScenario(), combatants: [], actions: [], weapons: [], features: [] };
    const merged = mergeTemplateLibrary(empty, tpl);
    expect(merged.features?.some((f) => f.id === 'feat-rage')).toBe(true);
  });

  it('defaults features to [] for templates saved before the field existed', () => {
    const legacy = [{ id: 'ctmpl-old', name: 'Old', side: 'pc', combatant: defaultScenario().combatants[0], actions: [], weapons: [] }];
    localStorage.setItem('dnd-combat-sim:combatant-templates:v1', JSON.stringify(legacy));
    const loaded = loadCombatantTemplates();
    expect(loaded[0].features).toEqual([]);
    // And merging such a template must not throw on the missing field.
    expect(() => mergeTemplateLibrary(defaultScenario(), loaded[0])).not.toThrow();
  });
});

describe('back-compat: importing an old scenario without library fields', () => {
  it('prestocks both libraries with the defaults', () => {
    const s = defaultScenario();
    const { ruleLibrary, conditionLibrary, ...withoutLibraries } = s;
    void ruleLibrary;
    void conditionLibrary;

    const imported = importScenario(JSON.stringify(withoutLibraries));
    expect(imported.ruleLibrary).toEqual(DEFAULT_RULE_LIBRARY);
    expect(imported.conditionLibrary).toEqual(DEFAULT_CONDITION_LIBRARY);
  });
});
