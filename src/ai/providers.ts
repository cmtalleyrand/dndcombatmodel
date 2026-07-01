// AI provider client: turns a chat-style prompt into a parsed AIScenarioDraft using
// either Anthropic (Claude) or OpenAI (ChatGPT), called directly from the browser
// with a user-supplied API key. Keys are stored in their own localStorage bucket —
// never part of a Scenario/AIDraft, so they can never leak into a JSON export.

import Anthropic from '@anthropic-ai/sdk';
import { buildRepairUserPrompt } from './schemaPrompt';

export type AIProvider = 'anthropic' | 'openai';

export interface ModelOption {
  id: string;
  label: string;
}

// Stable model aliases (not dated snapshots), so these don't go stale the moment
// a point release ships. Sonnet 5 first/default: near-Opus quality for this kind of
// structured-JSON authoring at a fraction of the latency and cost.
export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (default — balanced)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest)' },
];

export const OPENAI_MODELS: ModelOption[] = [
  { id: 'gpt-5.1', label: 'GPT-5.1 (most capable)' },
  { id: 'gpt-5.1-mini', label: 'GPT-5.1 Mini (balanced)' },
  { id: 'gpt-5.1-nano', label: 'GPT-5.1 Nano (fastest)' },
];

export interface AISettings {
  provider: AIProvider;
  anthropicModel: string;
  openaiModel: string;
  anthropicApiKey: string;
  openaiApiKey: string;
}

const AI_SETTINGS_KEY = 'dnd-combat-sim:ai-settings:v1';

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'anthropic',
  anthropicModel: ANTHROPIC_MODELS[0].id,
  openaiModel: OPENAI_MODELS[0].id,
  anthropicApiKey: '',
  openaiApiKey: '',
};

// Generous enough for a multi-combatant encounter draft; requests stream so this
// doesn't risk an HTTP timeout the way a non-streaming call would.
const MAX_OUTPUT_TOKENS = 16000;

/** Settings (including API keys) live in their own storage bucket, deliberately
 * separate from scenario/draft persistence, so they can never be swept into a
 * scenario or full-bundle JSON export. */
export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AISettings>) };
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_AI_SETTINGS;
}

export function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage full / unavailable — non-fatal
  }
}

export function currentModel(settings: AISettings): string {
  return settings.provider === 'anthropic' ? settings.anthropicModel : settings.openaiModel;
}

export function currentApiKey(settings: AISettings): string {
  return settings.provider === 'anthropic' ? settings.anthropicApiKey : settings.openaiApiKey;
}

/** Pull the first JSON object/array out of model text, tolerating ```json fences
 * or stray prose around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in the model response.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

interface RawGeneration {
  text: string;
  /** true if the response was cut off by the output token limit before finishing. */
  truncated: boolean;
}

/** Ask the configured AI provider to produce draft text from a system + user prompt,
 * streaming incremental text to `onChunk` (called with the full text-so-far) so the
 * caller can show live progress. */
async function generateWithAI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (textSoFar: string) => void,
): Promise<RawGeneration> {
  if (settings.provider === 'anthropic') return generateWithAnthropic(settings, systemPrompt, userPrompt, onChunk);
  return generateWithOpenAI(settings, systemPrompt, userPrompt, onChunk);
}

async function generateWithAnthropic(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (textSoFar: string) => void,
): Promise<RawGeneration> {
  if (!settings.anthropicApiKey) throw new Error('Add an Anthropic API key in AI Provider settings first.');
  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    // Required to call the API directly from a browser; the key the user enters
    // is theirs and is sent straight to Anthropic, never to any server of ours.
    dangerouslyAllowBrowser: true,
  });
  try {
    const stream = client.messages.stream({
      model: settings.anthropicModel,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    let acc = '';
    stream.on('text', (delta) => {
      acc += delta;
      onChunk?.(acc);
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new Error('Claude declined this request. Try rephrasing the prompt.');
    }
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) throw new Error('Claude returned no text content.');
    return { text, truncated: final.stop_reason === 'max_tokens' };
  } catch (err) {
    throw new Error(describeAnthropicError(err));
  }
}

function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key. Check it and try again.';
  if (err instanceof Anthropic.PermissionDeniedError) return "This Anthropic API key doesn't have access to that model.";
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic rate-limited this request. Wait a moment and retry.';
  if (err instanceof Anthropic.APIError) return `Anthropic API error: ${err.message}`;
  return err instanceof Error ? err.message : 'Unknown error calling Anthropic.';
}

async function generateWithOpenAI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (textSoFar: string) => void,
): Promise<RawGeneration> {
  if (!settings.openaiApiKey) throw new Error('Add an OpenAI API key in AI Provider settings first.');
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.openaiModel,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch {
    throw new Error('Could not reach the OpenAI API. Check your network connection.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = (body as { error?: { message?: string } } | null)?.error?.message;
    if (res.status === 401) throw new Error('OpenAI rejected the API key. Check it and try again.');
    if (res.status === 429) throw new Error('OpenAI rate-limited this request. Wait a moment and retry.');
    throw new Error(msg ? `OpenAI API error: ${msg}` : `OpenAI API error (HTTP ${res.status}).`);
  }
  if (!res.body) throw new Error('OpenAI returned an empty response stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let acc = '';
  let finishReason: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
        };
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) {
          acc += choice.delta.content;
          onChunk?.(acc);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      } catch {
        // ignore a malformed/partial SSE fragment; the buffer will complete it next read
      }
    }
  }
  if (!acc) throw new Error('OpenAI returned no text content.');
  return { text: acc, truncated: finishReason === 'length' };
}

export interface DraftGenerationCallbacks {
  /** called with the full accumulated text as it streams in. */
  onChunk?: (textSoFar: string) => void;
  /** called when generation moves from the initial attempt to an automatic JSON repair retry. */
  onPhase?: (phase: 'generating' | 'repairing') => void;
}

export interface DraftGenerationResult {
  draft: unknown;
  /** true if the first response was invalid JSON and a repair retry was needed. */
  repaired: boolean;
}

/**
 * Generate a draft and parse it as JSON, tolerating one class of failure: if the
 * model's response isn't valid JSON (but wasn't cut off by the token limit), send
 * one automatic follow-up asking it to return the same draft as valid JSON before
 * giving up. Truncated responses fail fast with a clear message instead, since a
 * repair prompt can't recover text the model never finished writing.
 */
export async function generateDraftJson(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  callbacks: DraftGenerationCallbacks = {},
): Promise<DraftGenerationResult> {
  callbacks.onPhase?.('generating');
  const first = await generateWithAI(settings, systemPrompt, userPrompt, callbacks.onChunk);
  try {
    return { draft: extractJson(first.text), repaired: false };
  } catch (err) {
    if (first.truncated) {
      throw new Error(
        "The response was cut off before finishing (it hit the model's output limit). Try a smaller or simpler encounter.",
      );
    }
    callbacks.onPhase?.('repairing');
    const repairPrompt = buildRepairUserPrompt(first.text, err instanceof Error ? err.message : String(err));
    const second = await generateWithAI(settings, systemPrompt, repairPrompt, callbacks.onChunk);
    try {
      return { draft: extractJson(second.text), repaired: true };
    } catch (err2) {
      if (second.truncated) {
        throw new Error('The repaired response was cut off before finishing. Try a smaller or simpler encounter.');
      }
      throw new Error(
        `The model's response still wasn't valid JSON after one automatic repair attempt (${err2 instanceof Error ? err2.message : 'parse error'}). Try again or simplify the prompt.`,
      );
    }
  }
}
