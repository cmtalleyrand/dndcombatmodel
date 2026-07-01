import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentApiKey, currentModel, DEFAULT_AI_SETTINGS, extractJson, generateDraftJson } from '../providers';

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

  it('defaults to Claude Sonnet 5', () => {
    expect(DEFAULT_AI_SETTINGS.provider).toBe('anthropic');
    expect(DEFAULT_AI_SETTINGS.anthropicModel).toBe('claude-sonnet-5');
  });
});

/** Build a fake `fetch` Response streaming OpenAI-style SSE chat-completion chunks. */
function sseResponse(contentChunks: string[], finishReason: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of contentChunks) {
        const event = { choices: [{ delta: { content: chunk } }] };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      const done = { choices: [{ delta: {}, finish_reason: finishReason }] };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const openaiSettings = { ...DEFAULT_AI_SETTINGS, provider: 'openai' as const, openaiApiKey: 'test-key' };

describe('generateDraftJson (OpenAI streaming)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a valid streamed response on the first try', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(sseResponse(['{"a": 1}'], 'stop'));
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    const result = await generateDraftJson(openaiSettings, 'system', 'user', { onChunk: (t) => chunks.push(t) });

    expect(result).toEqual({ draft: { a: 1 }, repaired: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chunks[chunks.length - 1]).toBe('{"a": 1}');
  });

  it('automatically repairs one round of invalid JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(['{"a": 1, invalid'], 'stop'))
      .mockResolvedValueOnce(sseResponse(['{"a": 1}'], 'stop'));
    vi.stubGlobal('fetch', fetchMock);

    const phases: string[] = [];
    const result = await generateDraftJson(openaiSettings, 'system', 'user', { onPhase: (p) => phases.push(p) });

    expect(result).toEqual({ draft: { a: 1 }, repaired: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(phases).toEqual(['generating', 'repairing']);
  });

  it('fails fast without a repair attempt when the response was truncated', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(sseResponse(['{"a": 1,'], 'length'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateDraftJson(openaiSettings, 'system', 'user')).rejects.toThrow(/cut off/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
