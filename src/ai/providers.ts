// AI provider client: turns a chat-style prompt into raw draft text using either
// Anthropic (Claude) or OpenAI (ChatGPT), called directly from the browser with a
// user-supplied API key. Keys are stored in their own localStorage bucket — never
// part of a Scenario/AIDraft, so they can never leak into a JSON export.

import Anthropic from '@anthropic-ai/sdk';

export type AIProvider = 'anthropic' | 'openai';

export interface ModelOption {
  id: string;
  label: string;
}

// Stable model aliases (not dated snapshots), so these don't go stale the moment
// a point release ships. Listed cheapest/fastest-last so the default (first) is a
// reasonable capability/cost balance for structured-JSON authoring.
export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced)' },
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

/** Ask the configured AI provider to produce draft text from a system + user prompt. */
export async function generateWithAI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (settings.provider === 'anthropic') return generateWithAnthropic(settings, systemPrompt, userPrompt);
  return generateWithOpenAI(settings, systemPrompt, userPrompt);
}

async function generateWithAnthropic(settings: AISettings, systemPrompt: string, userPrompt: string): Promise<string> {
  if (!settings.anthropicApiKey) throw new Error('Add an Anthropic API key in AI Provider settings first.');
  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    // Required to call the API directly from a browser; the key the user enters
    // is theirs and is sent straight to Anthropic, never to any server of ours.
    dangerouslyAllowBrowser: true,
  });
  try {
    const response = await client.messages.create({
      model: settings.anthropicModel,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined this request. Try rephrasing the prompt.');
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) throw new Error('Claude returned no text content.');
    return text;
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

async function generateWithOpenAI(settings: AISettings, systemPrompt: string, userPrompt: string): Promise<string> {
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
        max_completion_tokens: 8192,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch {
    throw new Error('Could not reach the OpenAI API. Check your network connection.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message;
    if (res.status === 401) throw new Error('OpenAI rejected the API key. Check it and try again.');
    if (res.status === 429) throw new Error('OpenAI rate-limited this request. Wait a moment and retry.');
    throw new Error(msg ? `OpenAI API error: ${msg}` : `OpenAI API error (HTTP ${res.status}).`);
  }
  const text = (body as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned no text content.');
  return text;
}
