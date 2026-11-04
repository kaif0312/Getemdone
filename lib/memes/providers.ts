// Meme sources. Every function returns null on any failure (memes are decoration and never break a reply).
// - Imgflip: captioned memes on the top templates (caption_image). Env IMGFLIP_USERNAME / IMGFLIP_PASSWORD (free account).
// - GIPHY: GIF search (sent as MP4 video) and sticker search (converted to a WhatsApp sticker). Env GIPHY_API_KEY
//   (free beta key = 100 calls/hour; our daily meme cap keeps us far below that). Media is sent by GIPHY's own link.
// Tenor's API was shut down on 2026-07-01; KLIPY forbids server-side use without written approval: neither is used.

type FetchLike = typeof fetch;

export interface ProviderEnv {
  IMGFLIP_USERNAME?: string;
  IMGFLIP_PASSWORD?: string;
  GIPHY_API_KEY?: string;
  /** GIPHY rating ceiling: g, pg, pg-13 (default), r. */
  NUDGE_MEME_RATING?: string;
}

export interface Providers {
  caption(templateId: string, texts: string[]): Promise<string | null>;
  gif(query: string): Promise<{ mp4: string; title: string } | null>;
  sticker(query: string): Promise<Buffer | null>;
  has: { imgflip: boolean; giphy: boolean };
}

const pick = <T>(xs: T[], rnd: () => number): T | undefined => xs[Math.floor(rnd() * xs.length)];

export function makeProviders(env: ProviderEnv = process.env as ProviderEnv, fetchImpl: FetchLike = fetch, rnd: () => number = Math.random): Providers {
  const imgflip = !!(env.IMGFLIP_USERNAME && env.IMGFLIP_PASSWORD);
  const giphy = !!env.GIPHY_API_KEY;
  const rating = env.NUDGE_MEME_RATING || 'pg-13';

  async function giphySearch(kind: 'gifs' | 'stickers', q: string) {
    const u = new URL(`https://api.giphy.com/v1/${kind}/search`);
    u.searchParams.set('api_key', env.GIPHY_API_KEY!);
    u.searchParams.set('q', q);
    u.searchParams.set('limit', '20');
    u.searchParams.set('rating', rating);
    u.searchParams.set('lang', 'en');
    const res = await fetchImpl(u, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) { console.error(`[memes] giphy ${kind} HTTP ${res.status}`); return []; }
    const j = (await res.json()) as { data?: GiphyItem[] };
    return j.data ?? [];
  }

  return {
    has: { imgflip, giphy },

    async caption(templateId, texts) {
      if (!imgflip) return null;
      try {
        const body = new URLSearchParams({ template_id: templateId, username: env.IMGFLIP_USERNAME!, password: env.IMGFLIP_PASSWORD! });
        texts.forEach((t, i) => body.set(`boxes[${i}][text]`, t));
        const res = await fetchImpl('https://api.imgflip.com/caption_image', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
        const j = (await res.json()) as { success?: boolean; data?: { url?: string }; error_message?: string };
        if (!j.success || !j.data?.url) { console.error('[memes] imgflip failed:', j.error_message); return null; }
        return j.data.url;
      } catch (e) { console.error('[memes] imgflip threw', e); return null; }
    },

    async gif(query) {
      if (!giphy) return null;
      try {
        const items = (await giphySearch('gifs', query)).filter((g) => {
          const o = g.images?.original;
          return o?.mp4 && Number(o.mp4_size || 0) < 12_000_000;
        });
        const g = pick(items.slice(0, 12), rnd);
        return g ? { mp4: g.images!.original!.mp4!, title: g.title ?? '' } : null;
      } catch (e) { console.error('[memes] giphy gif threw', e); return null; }
    },

    async sticker(query) {
      if (!giphy) return null;
      try {
        const items = (await giphySearch('stickers', query)).filter((g) => g.images?.original?.webp || g.images?.original?.url);
        const g = pick(items.slice(0, 12), rnd);
        if (!g) return null;
        const src = g.images!.original!.webp || g.images!.original!.url!;
        const res = await fetchImpl(src, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        return await toWhatsAppSticker(Buffer.from(await res.arrayBuffer()));
      } catch (e) { console.error('[memes] giphy sticker threw', e); return null; }
    },
  };
}

interface GiphyItem {
  title?: string;
  images?: { original?: { url?: string; webp?: string; mp4?: string; mp4_size?: string } };
}

const ANIMATED_MAX = 500 * 1024;
const STATIC_MAX = 100 * 1024;

/** Any GIF/WebP/PNG -> 512x512 transparent WebP within WhatsApp's sticker limits (animated <= 500 KB, else one still
 *  frame <= 100 KB). null if it cannot fit. */
export async function toWhatsAppSticker(input: Buffer): Promise<Buffer | null> {
  const sharp = (await import('sharp')).default;
  const box = { width: 512, height: 512, fit: 'contain' as const, background: { r: 0, g: 0, b: 0, alpha: 0 } };
  const meta = await sharp(input, { animated: true }).metadata();
  const frames = meta.pages ?? 1;
  if (frames > 1) {
    for (const quality of [60, 40, 25]) {
      const out = await sharp(input, { animated: true }).resize(box).webp({ quality, effort: 4, loop: 0 }).toBuffer();
      if (out.length <= ANIMATED_MAX) return out;
    }
  }
  for (const quality of [80, 60, 40]) {
    const out = await sharp(input).resize(box).webp({ quality }).toBuffer();
    if (out.length <= STATIC_MAX) return out;
  }
  return null;
}
