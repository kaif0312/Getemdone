// OWNER: agent "transport". Graph API sends from the Nudge number. Env: WA_TOKEN, WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION (default v26.0).
// Every send is skipped (logged to an in-memory outbox readable by tests) when NUDGE_WA_DRY_RUN=1, so tests never hit Meta.
import type { WaButton, WaListRow } from './types';

const graphVersion = () => process.env.WA_GRAPH_VERSION || 'v26.0';
const dryRun = () => process.env.NUDGE_WA_DRY_RUN === '1';
const graphBase = () => `https://graph.facebook.com/${graphVersion()}`;

const outbox: { kind: string; to: string; payload: unknown }[] = [];
let fakeCounter = 0;

/** Truncate to n chars (by code point), ending with an ellipsis when cut. */
function clip(s: string, n: number): string {
  const chars = Array.from(String(s ?? '').trim());
  if (chars.length <= n) return chars.join('');
  return chars.slice(0, n - 1).join('').trimEnd() + '…';
}

/** POST a message payload to /{phone-id}/messages. Returns the wamid, or null on any failure. */
async function post(kind: string, to: string, body: Record<string, unknown>): Promise<string | null> {
  if (dryRun()) {
    outbox.push({ kind, to, payload: body });
    return `wamid.DRY${++fakeCounter}`;
  }
  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error('[wa/send] WA_TOKEN or WA_PHONE_NUMBER_ID is not set');
    return null;
  }
  try {
    const res = await fetch(`${graphBase()}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { code?: number; message?: string };
    };
    if (!res.ok || json.error) {
      const code = json.error?.code;
      console.error(
        `[wa/send] ${kind} failed (${res.status}) code=${code}${code === 131047 ? ' (outside 24h window)' : ''}: ${json.error?.message ?? ''}`,
      );
      return null;
    }
    return json.messages?.[0]?.id ?? null;
  } catch (e) {
    console.error(`[wa/send] ${kind} threw`, e);
    return null;
  }
}

export async function sendText(to: string, text: string, replyTo?: string): Promise<string | null> {
  return post('text', to, {
    to,
    type: 'text',
    text: { body: String(text).slice(0, 4096), preview_url: true },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  });
}

export async function sendButtons(to: string, body: string, buttons: WaButton[], header?: string): Promise<string | null> {
  const bs = buttons.slice(0, 3);
  if (bs.length === 0) return sendText(to, body);
  return post('buttons', to, {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(header ? { header: { type: 'text', text: clip(header, 60) } } : {}),
      body: { text: String(body).slice(0, 1024) },
      action: {
        buttons: bs.map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: clip(b.title, 20) } })),
      },
    },
  });
}

export async function sendList(to: string, body: string, buttonLabel: string, rows: WaListRow[], header?: string): Promise<string | null> {
  const rs = rows.slice(0, 10);
  if (rs.length === 0) return sendText(to, body);
  return post('list', to, {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(header ? { header: { type: 'text', text: clip(header, 60) } } : {}),
      body: { text: String(body).slice(0, 1024) },
      action: {
        button: clip(buttonLabel, 20),
        sections: [
          {
            title: clip(header || 'Options', 24),
            rows: rs.map((r) => ({
              id: r.id.slice(0, 200),
              title: clip(r.title, 24),
              ...(r.description ? { description: clip(r.description, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/** One URL button under a message (Cloud API `cta_url`: no template, only inside the 24h window). Falls back to a plain
 *  text with the link when Meta refuses the interactive message, so the person always gets a link. */
export async function sendUrlButton(to: string, body: string, label: string, url: string): Promise<string | null> {
  const id = await post('url_button', to, {
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: String(body).slice(0, 1024) },
      action: { name: 'cta_url', parameters: { display_text: clip(label, 20), url } },
    },
  });
  return id ?? sendText(to, `${body}\n${url}`);
}

/** Template with body variables (and optional quick-reply button payloads). */
export async function sendTemplate(to: string, name: string, variables: string[], opts?: { language?: string; buttonPayloads?: string[] }): Promise<string | null> {
  const components: Record<string, unknown>[] = [];
  if (variables.length) {
    components.push({ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: String(v) })) });
  }
  (opts?.buttonPayloads ?? []).forEach((payload, index) => {
    components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] });
  });
  return post('template', to, {
    to,
    type: 'template',
    template: { name, language: { code: opts?.language || 'en' }, ...(components.length ? { components } : {}) },
  });
}

/** The coach mascot's sticker poses, served from public/stickers/<name>.webp (512x512 WebP, transparent, < 100 KB). */
export const STICKERS = ['blowing', 'cheer', 'clipboard', 'disappointed', 'flex', 'proud', 'sleepy', 'waiting'] as const;
export type StickerName = (typeof STICKERS)[number];

/** Public origin the sticker files are fetched from by Meta. */
const publicOrigin = () => (process.env.NUDGE_PUBLIC_URL || 'https://getemdone.vercel.app').replace(/\/$/, '');

/** Send one of the coach stickers (by link: Meta fetches the WebP from our public folder). */
export async function sendSticker(to: string, name: StickerName): Promise<string | null> {
  return post('sticker', to, { to, type: 'sticker', sticker: { link: `${publicOrigin()}/stickers/${name}.webp` } });
}

export async function sendReaction(to: string, messageId: string, emoji: string): Promise<void> {
  await post('reaction', to, { to, type: 'reaction', reaction: { message_id: messageId, emoji } });
}

/** Blue ticks (+ typing indicator if typing). */
export async function markRead(messageId: string, typing?: boolean): Promise<void> {
  await post('read', '', {
    status: 'read',
    message_id: messageId,
    ...(typing ? { typing_indicator: { type: 'text' } } : {}),
  });
}

/** Download media bytes by id. Throws on failure (callers decide how to reply). */
export async function fetchMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
  if (dryRun()) {
    outbox.push({ kind: 'fetchMedia', to: '', payload: { mediaId } });
    return { data: Buffer.from('dry-run-media'), mimeType: 'audio/ogg' };
  }
  const token = process.env.WA_TOKEN;
  if (!token) throw new Error('WA_TOKEN is not set');
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`${graphBase()}/${encodeURIComponent(mediaId)}`, { headers: auth });
  if (!meta.ok) throw new Error(`media lookup failed (${meta.status})`);
  const info = (await meta.json()) as { url?: string; mime_type?: string };
  if (!info.url) throw new Error('media url missing');
  const bin = await fetch(info.url, { headers: auth });
  if (!bin.ok) throw new Error(`media download failed (${bin.status})`);
  return { data: Buffer.from(await bin.arrayBuffer()), mimeType: info.mime_type || bin.headers.get('content-type') || 'application/octet-stream' };
}

/** True if a free-form message is allowed now (last inbound < 24h, minus 5 min margin). */
export function windowOpen(lastInboundAt: number, now: number = Date.now()): boolean {
  if (!lastInboundAt) return false;
  return now - lastInboundAt < (24 * 60 - 5) * 60_000;
}

/** Test helper: messages captured in dry-run mode. */
export function dryRunOutbox(): { kind: string; to: string; payload: unknown }[] {
  return outbox;
}
