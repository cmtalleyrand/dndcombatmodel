import { beforeEach, describe, expect, it } from 'vitest';
import { defaultScenario } from '../data/srd';
import { AI_DRAFTS_KEY, exportFullBundle, importFullBundle, type AIDraft } from './store';

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
