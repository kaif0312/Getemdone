// Memes, GIFs and stickers from the coach. A turn can raise a "moment" (task pushed, workout logged, list cleared, an
// excuse...). After the reply, maybeMeme() may answer it with a captioned meme (Imgflip), a GIF (GIPHY, sent as video)
// or a GIPHY sticker, picked to fit the user's coach. If nothing is sent, core falls back to the mascot sticker.
// Rules: only ever in reply to the user (never proactive, never a template); auto memes are capped per local day
// (NUDGE_MEMES_PER_DAY, default 3) and rolled with a per-moment chance; asked-for memes ("send a meme") have their own
// cap (NUDGE_MEMES_ASKED_PER_DAY, default 15). *memes off* opts out (WaLink.memes = false). NUDGE_MEMES=off kills it all.
import type { Providers } from '@/lib/memes/providers';
import type * as Media from '@/lib/wa/media';
import { clip } from './format';
import type { CoachId } from './coaches';
import { isCoachId } from './coaches';

export type Moment = 'deferred' | 'excuse' | 'tired' | 'workout' | 'done' | 'all_done' | 'brag' | 'quit' | 'random';
export const MOMENTS: Moment[] = ['deferred', 'excuse', 'tired', 'workout', 'done', 'all_done', 'brag', 'quit', 'random'];
export type MemeFormat = 'meme' | 'gif' | 'sticker';

/** c = Imgflip template id + one text per box ({task} / {name} filled in); g = GIPHY GIF query; s = GIPHY sticker query. */
export type Recipe = { c: string; x: string[] } | { g: string } | { s: string };

export interface MemeRequest {
  moment: Moment;
  /** Task text or what the user talked about; fills {task} and steers asked-for searches. */
  topic?: string;
  format?: MemeFormat;
  /** The user asked for it: skip the dice, use the asked cap. */
  asked?: boolean;
  /** Raised by the model (an excuse, a brag): higher odds than a routine action. */
  byModel?: boolean;
}

export interface MemeDeps {
  providers: Providers;
  sendImage: typeof Media.sendImage;
  sendVideo: typeof Media.sendVideo;
  uploadMedia: typeof Media.uploadMedia;
  sendStickerId: typeof Media.sendStickerId;
  /** Dice for odds and picks (tests pass a fixed one). */
  random?: () => number;
}

// Imgflip template ids (api.imgflip.com/get_memes, checked 2026-11-04) with their box counts.
const T = {
  drake: '181913649', // 2: rejected (top), approved (bottom)
  twoButtons: '87743020', // 3: left button, right button, sweating guy
  uno: '217743513', // 2: card text, the guy who drew 25
  exit12: '124822590', // 3: straight on, exit, the car
  skeleton: '4087833', // 2
  spongebob: '102156234', // 2
  fine: '55311130', // 2
  simply: '61579', // 2
  rollSafe: '89370399', // 2
  harold: '27813981', // 2
  pooh: '178591752', // 2: plain, fancy
  handshake: '135256802', // 3: left arm, right arm, the handshake
  alwaysHasBeen: '252600902', // 2: "wait, it's all...?", "always has been"
  bernie: '222403160', // 2
  fry: '61520', // 2
  rock: '21735', // 2: what she says, the Rock's reply
  gus: '342785297', // 3: you..., I..., we are not the same
  batman: '438680', // 2: Robin, Batman's slap line
  yoda: '14371066', // 2
} as const;

const c = (id: string, ...x: string[]): Recipe => ({ c: id, x });
const g = (q: string): Recipe => ({ g: q });
const s = (q: string): Recipe => ({ s: q });

type Book = Partial<Record<Moment, Recipe[]>>;

/** What each coach sends. '*' is the fallback for any moment a coach does not cover. */
export const BOOKS: Record<CoachId | '*', Book> = {
  drill: {
    deferred: [
      c(T.drake, 'Doing {task} today', 'Telling myself tomorrow-me will handle it'),
      c(T.uno, 'Do {task} today or draw 25', 'You'),
      c(T.exit12, 'Doing {task} today', 'Tomorrow', 'You. Again.'),
      c(T.spongebob, "I'll do it tomorrow", "i'Ll dO iT tOmOrRoW"),
      c(T.batman, "I'll just push {task} to-", 'NO. TODAY.'),
      g('no excuses'), g('david goggins'), g('get back to work'), s('disappointed'), s('no'),
    ],
    excuse: [
      c(T.twoButtons, 'Do the thing', "Explain why I can't do the thing", 'You'),
      c(T.rollSafe, "Can't fail at {task}", 'if you never start'),
      c(T.gus, 'You make excuses', 'I make progress', 'We are not the same'),
      c(T.batman, "I'm too tired to-", 'TIRED IS A FEELING. MOVE.'),
      g('david goggins'), g('no excuses'), g('stay hard'), g('excuses'), s('angry'),
    ],
    tired: [
      c(T.batman, "I'm so tired", "YOU'RE AT 40%. THERE'S 60% LEFT."),
      c(T.fine, 'Mind: we are done', 'Body: barely started'),
      g('david goggins'), g('keep going'), g('get up'),
    ],
    workout: [
      c(T.rock, 'I worked out, can I rest now?', 'THAT WAS THE WARM-UP'),
      c(T.gus, 'You stop when you are tired', 'I stop when I am done', 'We are not the same'),
      g('david goggins'), g('beast mode'), g('workout motivation'), s('muscle'),
    ],
    done: [g('one down'), g('respect'), s('salute')],
    all_done: [
      c(T.pooh, 'Finished my list', 'Completed the mission. Zero excuses.'),
      c(T.simply, 'One does not simply', 'clear the whole list. You just did.'),
      g('salute'), g('respect'), g('david goggins'),
    ],
    brag: [
      c(T.gus, 'You feel proud', "I'm already on the next one", 'We are not the same'),
      g('not impressed'), g('david goggins'),
    ],
    quit: [g('disappointed'), g('quitter'), s('sad')],
  },
  hype: {
    deferred: [c(T.fine, '{task}: moved to tomorrow', 'This is fine 🔥'), g('procrastination'), g('tomorrow')],
    excuse: [c(T.bernie, 'I am once again asking you', 'to get up and GO 🔥'), g('you can do it'), g('lets go')],
    tired: [g('you got this'), g('coffee'), s('energy')],
    workout: [c(T.handshake, 'You', 'The gym', 'ABSOLUTE DOMINATION'), g('beast mode'), g('flex'), g('lets go'), s('flex')],
    done: [g('yes'), g('nice'), s('fire')],
    all_done: [g('celebration'), g('party'), g('you did it'), s('party'), s('celebrate')],
    brag: [g('legend'), g('goat'), g('hype'), s('crown')],
    quit: [g('sad goodbye'), g('come back')],
  },
  buddy: {
    deferred: [
      c(T.fine, '{task}: moved to tomorrow again', 'This is fine'),
      c(T.skeleton, '{task} waiting for you like', 'Any day now'),
      c(T.fry, 'Not sure if moving {task} to tomorrow', 'or moving it to never'),
      g('procrastination'), g('later'),
    ],
    excuse: [c(T.harold, 'Me making excuses', "Me knowing I'll feel better if I just do it"), g('excuses')],
    tired: [g('coffee'), g('nap'), s('sleepy')],
    workout: [c(T.drake, 'Skipping the workout', 'Logging the workout 💪'), g('workout'), s('strong')],
    done: [g('nice'), g('good job'), s('thumbs up')],
    all_done: [g('celebrate'), g('high five'), s('yay')],
    brag: [g('proud of you'), s('proud')],
    quit: [g('see you soon'), s('bye')],
  },
  zen: {
    deferred: [c(T.pooh, 'Moving {task}', 'Mindfully rescheduling {task}'), g('relax'), g('its okay')],
    excuse: [g('be kind to yourself'), g('breathe')],
    tired: [g('rest'), g('sleepy cat'), s('sleepy')],
    workout: [g('yoga'), g('namaste'), s('yoga')],
    done: [g('peaceful'), s('lotus')],
    all_done: [g('peaceful'), g('sunset'), s('zen')],
    brag: [g('proud'), s('heart')],
    quit: [g('namaste'), s('bye')],
  },
  stoic: {
    deferred: [c(T.simply, 'One does not simply', 'postpone virtue to tomorrow'), g('patience'), g('philosophy')],
    excuse: [c(T.yoda, 'Do or do not', 'There is no excuse'), g('wisdom')],
    tired: [g('rest'), g('marcus aurelius')],
    workout: [c(T.alwaysHasBeen, 'Wait, the body is trained by the mind?', 'Always has been'), g('gladiator'), g('spartan')],
    done: [g('nod'), s('thumbs up')],
    all_done: [c(T.alwaysHasBeen, 'Wait, discipline was freedom?', 'Always has been'), g('satisfied'), g('gladiator')],
    brag: [g('humble'), g('nod')],
    quit: [g('farewell')],
  },
  analyst: {
    deferred: [c(T.twoButtons, 'Finish {task}', 'Reschedule {task} again', 'Me, a data-driven person'), g('calculating'), g('math')],
    excuse: [c(T.fry, 'Not sure if too tired', 'or 4 hours of screen time'), g('statistics')],
    tired: [g('low battery'), s('battery')],
    workout: [c(T.drake, 'Feeling like you worked out', 'Having the numbers to prove it'), g('data'), s('chart')],
    done: [g('progress'), s('check')],
    all_done: [g('100 percent'), g('perfect score'), s('100')],
    brag: [g('impressive'), g('graph going up')],
    quit: [g('error'), g('shutting down')],
  },
  '*': {
    random: [g('motivation'), g('funny workout'), g('procrastination'), s('motivation')],
  },
};

/** Chance an automatic moment turns into a meme (asked = always). */
const ODDS: Record<Moment, number> = {
  deferred: 0.6, excuse: 0.85, tired: 0.6, workout: 0.6, done: 0.25, all_done: 0.8, brag: 0.7, quit: 0.5, random: 1,
};
const MODEL_ODDS = 0.9;

const kindOf = (r: Recipe): MemeFormat => ('c' in r ? 'meme' : 'g' in r ? 'gif' : 'sticker');

/** Pick a recipe the configured providers can serve. Pure (rnd injected). */
export function chooseRecipe(coachId: string | undefined, req: MemeRequest, has: Providers['has'], rnd: () => number = Math.random): Recipe | null {
  const coach: CoachId = isCoachId(coachId) ? coachId : 'buddy';
  const book = BOOKS[coach];
  let pool: Recipe[];
  if (req.asked && req.topic && req.format !== 'meme') {
    // "send me a goggins gif": search what they asked for.
    pool = [req.format === 'sticker' ? s(req.topic) : g(req.topic)];
  } else if (req.moment === 'random') {
    pool = [...Object.values(book).flat(), ...(BOOKS['*'].random ?? [])];
  } else {
    pool = book[req.moment] ?? BOOKS['*'][req.moment] ?? [];
  }
  pool = pool.filter((r) => ('c' in r ? has.imgflip : has.giphy));
  if (req.format) {
    const only = pool.filter((r) => kindOf(r) === req.format);
    if (only.length) pool = only;
  }
  if (!pool.length) return null;
  return pool[Math.floor(rnd() * pool.length)] ?? null;
}

export function fillText(t: string, vars: { task?: string; name?: string }): string {
  return t.replace(/\{task\}/g, clip(vars.task || 'it', 28)).replace(/\{name\}/g, vars.name || 'you');
}

/** Reads NUDGE_MEMES (off = kill switch), NUDGE_MEMES_PER_DAY, NUDGE_MEMES_ASKED_PER_DAY. */
export type MemeEnv = Record<string, string | undefined>;

/** Budget check. Returns the counter patch to save, or null when this meme is not allowed. */
export function allowMeme(
  link: { memes?: boolean; memeDay?: string; memeCount?: number; memeAskedCount?: number },
  req: MemeRequest,
  today: string,
  env: MemeEnv,
  rnd: () => number,
): { memeDay: string; memeCount: number; memeAskedCount: number } | null {
  if ((env.NUDGE_MEMES || '').toLowerCase() === 'off') return null;
  if (link.memes === false && !req.asked) return null;
  const sameDay = link.memeDay === today;
  const count = sameDay ? link.memeCount ?? 0 : 0;
  const asked = sameDay ? link.memeAskedCount ?? 0 : 0;
  if (req.asked) {
    if (asked >= Number(env.NUDGE_MEMES_ASKED_PER_DAY || 15)) return null;
    return { memeDay: today, memeCount: count, memeAskedCount: asked + 1 };
  }
  if (count >= Number(env.NUDGE_MEMES_PER_DAY || 3)) return null;
  if (rnd() >= (req.byModel ? MODEL_ODDS : ODDS[req.moment])) return null;
  return { memeDay: today, memeCount: count + 1, memeAskedCount: asked };
}

/** Send the recipe. Returns the text we sent (for the transcript) or null if nothing went out. */
export async function sendRecipe(m: MemeDeps, to: string, r: Recipe, vars: { task?: string; name?: string }): Promise<string | null> {
  if ('c' in r) {
    const url = await m.providers.caption(r.c, r.x.map((t) => fillText(t, vars)));
    if (!url) return null;
    return (await m.sendImage(to, url)) ? `[meme: ${r.x.map((t) => fillText(t, vars)).join(' / ')}]` : null;
  }
  if ('g' in r) {
    const gif = await m.providers.gif(r.g);
    if (!gif) return null;
    return (await m.sendVideo(to, gif.mp4, 'via GIPHY')) ? `[gif: ${r.g}]` : null;
  }
  const webp = await m.providers.sticker(r.s);
  if (!webp) return null;
  const id = await m.uploadMedia(webp, 'image/webp', 'sticker.webp');
  if (!id) return null;
  return (await m.sendStickerId(to, id)) ? `[sticker: ${r.s}]` : null;
}

/** Raise a moment for this turn. Stronger requests win: asked > model > automatic; later automatic ones do not replace. */
export function raise(cur: MemeRequest | undefined, next: MemeRequest): MemeRequest {
  const rank = (r?: MemeRequest) => (!r ? 0 : r.asked ? 3 : r.byModel ? 2 : 1);
  return rank(next) > rank(cur) ? next : cur!;
}
