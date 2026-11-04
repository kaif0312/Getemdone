// OWNER: agent "transport". Normalises a forwarded WhatsApp webhook `value` and verifies the forwarder's HMAC.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ForwardedEvent, InboundMessage } from './types';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function parseForwarded(body: ForwardedEvent): { messages: InboundMessage[]; statuses: unknown[] } {
  const value = obj(body?.value);
  const names = new Map<string, string>();
  for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
    const co = obj(c);
    const n = str(obj(co.profile).name);
    const id = str(co.wa_id);
    if (id && n) names.set(id, n);
  }

  const messages: InboundMessage[] = [];
  for (const m of Array.isArray(value.messages) ? value.messages : []) {
    const r = obj(m);
    const id = str(r.id);
    const from = str(r.from);
    if (!id || !from) continue;
    const ts = Number(r.timestamp);
    const msg: InboundMessage = {
      id,
      from,
      timestamp: Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.now(),
      type: 'other',
    };
    const pn = names.get(from);
    if (pn) msg.profileName = pn;

    switch (r.type) {
      case 'text':
        msg.type = 'text';
        msg.text = str(obj(r.text).body) ?? '';
        break;
      case 'audio': {
        const a = obj(r.audio);
        const mid = str(a.id);
        msg.type = 'audio';
        if (mid) msg.media = { id: mid, mimeType: str(a.mime_type) ?? 'audio/ogg' };
        break;
      }
      case 'image': {
        const im = obj(r.image);
        const mid = str(im.id);
        msg.type = 'image';
        if (mid) msg.media = { id: mid, mimeType: str(im.mime_type) ?? 'image/jpeg' };
        const cap = str(im.caption);
        if (cap) msg.text = cap;
        break;
      }
      case 'document': {
        const dc = obj(r.document);
        const mid = str(dc.id);
        msg.type = 'document';
        if (mid) {
          msg.media = { id: mid, mimeType: str(dc.mime_type) ?? 'application/octet-stream' };
          const fn = str(dc.filename);
          if (fn) msg.media.filename = fn;
        }
        const cap = str(dc.caption);
        if (cap) msg.text = cap;
        break;
      }
      case 'video': {
        const vd = obj(r.video);
        const mid = str(vd.id);
        msg.type = 'video';
        if (mid) msg.media = { id: mid, mimeType: str(vd.mime_type) ?? 'video/mp4' };
        const cap = str(vd.caption);
        if (cap) msg.text = cap;
        break;
      }
      case 'interactive': {
        const it = obj(r.interactive);
        const rep = obj(it.type === 'list_reply' ? it.list_reply : it.button_reply);
        const rid = str(rep.id);
        if (rid) {
          msg.type = 'interactive';
          msg.reply = { id: rid, title: str(rep.title) ?? '' };
        }
        break;
      }
      case 'button': {
        // Legacy quick-reply button on a template.
        const b = obj(r.button);
        const payload = str(b.payload) ?? str(b.text);
        if (payload) {
          msg.type = 'button';
          msg.reply = { id: payload, title: str(b.text) ?? '' };
        }
        break;
      }
      case 'reaction': {
        const re = obj(r.reaction);
        const mid = str(re.message_id);
        if (mid) {
          msg.type = 'reaction';
          msg.reaction = { emoji: str(re.emoji) ?? '', messageId: mid };
        }
        break;
      }
      default:
        break;
    }
    messages.push(msg);
  }

  return { messages, statuses: Array.isArray(value.statuses) ? value.statuses : [] };
}

/** Timing-safe HMAC-SHA256 hex check of the raw body. Accepts an optional "sha256=" prefix. */
export function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.NUDGE_FORWARD_SECRET;
  if (!secret || !header) return false;
  const given = header.trim().replace(/^sha256=/i, '').toLowerCase();
  const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
