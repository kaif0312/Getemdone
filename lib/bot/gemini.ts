// Gemini REST client (generateContent + function calling). One retry on the fallback model.
import type { GeminiRequest, GeminiResult } from './types';

const TIMEOUT_MS = 25_000;

interface Opts {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

function buildBody(req: GeminiRequest) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: req.user }],
    tools: [{ functionDeclarations: req.tools }],
    toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    generationConfig: { temperature: 0.2 },
  };
}

async function callModel(model: string, req: GeminiRequest, key: string, f: typeof fetch): Promise<GeminiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildBody(req)),
      signal: ctrl.signal,
    });
    // Never put the URL (it carries the key) in an error message.
    if (!res.ok) throw new Error(`gemini ${model} HTTP ${res.status}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] } }[];
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const calls = parts
      .filter((p) => p.functionCall?.name)
      .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
    const text = parts.map((p) => p.text ?? '').join('').trim();
    const known = new Set(req.tools.map((t) => t.name));
    const valid = calls.filter((c) => known.has(c.name));
    if (!valid.length && !text) throw new Error(`gemini ${model} returned no usable output`);
    return { calls: valid, text, model };
  } finally {
    clearTimeout(timer);
  }
}

export async function callGemini(req: GeminiRequest, opts: Opts = {}): Promise<GeminiResult> {
  const env = opts.env ?? process.env;
  const f = opts.fetchImpl ?? fetch;
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const primary = env.NUDGE_BOT_MODEL || 'gemini-3.1-flash-lite';
  const fallback = env.NUDGE_BOT_FALLBACK_MODEL || 'gemini-3.8-flash';
  const t0 = Date.now();
  try {
    const r = await callModel(primary, req, key, f);
    console.log(`[bot] gemini ${primary} ok ${Date.now() - t0}ms calls=${r.calls.length}`);
    return r;
  } catch (e) {
    console.warn(`[bot] gemini ${primary} failed (${(e as Error).message}); retrying on ${fallback}`);
    const r = await callModel(fallback, req, key, f);
    console.log(`[bot] gemini ${fallback} ok ${Date.now() - t0}ms calls=${r.calls.length}`);
    return r;
  }
}
