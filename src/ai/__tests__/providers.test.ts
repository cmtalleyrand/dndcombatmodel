import { describe, expect, it } from 'vitest';
import { currentApiKey, currentModel, DEFAULT_AI_SETTINGS, extractJson } from '../providers';

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('strips surrounding prose and a ```json fence', () => {
    const text = 'Sure, here you go:\n```json\n{"a": [1, 2, 3]}\n```\nLet me know if you need changes.';
    expect(extractJson(text)).toEqual({ a: [1, 2, 3] });
  });

  it('strips a fence with no language tag', () => {
    const text = '```\n{"ok": true}\n```';
    expect(extractJson(text)).toEqual({ ok: true });
  });

  it('throws when no JSON is present', () => {
    expect(() => extractJson('no json here')).toThrow(/No JSON object found/);
  });
});

describe('AISettings helpers', () => {
  it('selects the field for the active provider', () => {
    const anthropic = { ...DEFAULT_AI_SETTINGS, provider: 'anthropic' as const, anthropicModel: 'claude-opus-4-8', anthropicApiKey: 'k1' };
    expect(currentModel(anthropic)).toBe('claude-opus-4-8');
    expect(currentApiKey(anthropic)).toBe('k1');

    const openai = { ...DEFAULT_AI_SETTINGS, provider: 'openai' as const, openaiModel: 'gpt-5.1', openaiApiKey: 'k2' };
    expect(currentModel(openai)).toBe('gpt-5.1');
    expect(currentApiKey(openai)).toBe('k2');
  });
});
