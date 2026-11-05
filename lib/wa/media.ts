// Media sends for memes: an image or video by link, and a sticker from bytes we converted (uploaded to WhatsApp first).
// Same env and dry-run rule as send.ts (kept apart so the two can change independently). NUDGE_WA_DRY_RUN=1 records
// everything in mediaOutbox() and never calls Meta.

const graphVersion = () => process.env.WA_GRAPH_VERSION || 'v26.0';
const dryRun = () => process.env.NUDGE_WA_DRY_RUN === '1';
const graphBase = () => `https://graph.facebook.com/${graphVersion()}`;

const outbox: { kind: string; to: string; payload: unknown }[] = [];
let fakeCounter = 0;
export function mediaOutbox() { return outbox; }

function creds(): { token: string; phoneId: string } | null {
  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  if (!token || !phoneId) { console.error('[wa/media] WA_TOKEN or WA_PHONE_NUMBER_ID is not set'); return null; }
  return { token, phoneId };
}

async function post(kind: string, to: string, body: Record<string, unknown>): Promise<string | null> {
  if (dryRun()) { outbox.push({ kind, to, payload: body }); return `wamid.DRYM${++fakeCounter}`; }
  const c = creds();
  if (!c) return null;
  try {
    const res = await fetch(`${graphBase()}/${c.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; message?: string } };
    if (!res.ok || json.error) {
      console.error(`[wa/media] ${kind} failed (${res.status}) code=${json.error?.code}: ${json.error?.message ?? ''}`);
      return null;
    }
    return json.messages?.[0]?.id ?? null;
  } catch (e) {
    console.error(`[wa/media] ${kind} threw`, e);
    return null;
  }
}

const cap = (s: string | undefined) => (s ? Array.from(s).slice(0, 1000).join('') : undefined);

/** Image by public link (JPEG/PNG, <= 5 MB). */
export function sendImage(to: string, link: string, caption?: string): Promise<string | null> {
  return post('image', to, { type: 'image', image: { link, ...(caption ? { caption: cap(caption) } : {}) } });
}

/** Video by public link (MP4 H.264, <= 16 MB). GIFs go out this way: WhatsApp has no GIF type in the Cloud API. */
export function sendVideo(to: string, link: string, caption?: string): Promise<string | null> {
  return post('video', to, { type: 'video', video: { link, ...(caption ? { caption: cap(caption) } : {}) } });
}

/** Upload bytes to WhatsApp media storage; returns the media id (valid ~30 days) or null. */
export async function uploadMedia(data: Buffer, mimeType: string, filename = 'media'): Promise<string | null> {
  if (dryRun()) { outbox.push({ kind: 'upload', to: '', payload: { mimeType, bytes: data.length } }); return `media.DRY${++fakeCounter}`; }
  const c = creds();
  if (!c) return null;
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }), filename);
    const res = await fetch(`${graphBase()}/${c.phoneId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${c.token}` }, body: form });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) { console.error(`[wa/media] upload failed (${res.status}): ${json.error?.message ?? ''}`); return null; }
    return json.id;
  } catch (e) {
    console.error('[wa/media] upload threw', e);
    return null;
  }
}

/** Image by uploaded media id (PNG/JPEG <= 5 MB), with an optional caption. */
export function sendImageId(to: string, mediaId: string, caption?: string): Promise<string | null> {
  return post('image', to, { type: 'image', image: { id: mediaId, ...(caption ? { caption: cap(caption) } : {}) } });
}

/** One message: an uploaded image on top, the body text and up to 3 reply buttons below (interactive header image). */
export function sendImageButtons(to: string, mediaId: string, body: string, buttons: { id: string; title: string }[]): Promise<string | null> {
  const t = (s: string) => Array.from(s).slice(0, 20).join('');
  return post('image_buttons', to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'image', image: { id: mediaId } },
      body: { text: body.slice(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: t(b.title) } })) },
    },
  });
}

/** Sticker from an uploaded media id (512x512 WebP; animated <= 500 KB, static <= 100 KB). */
export function sendStickerId(to: string, mediaId: string): Promise<string | null> {
  return post('sticker', to, { type: 'sticker', sticker: { id: mediaId } });
}
