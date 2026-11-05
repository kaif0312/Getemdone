// Learning log: a copy of each bot turn, kept to improve Nudge, with the person's name and phone numbers removed
// (lib/bot/scrub.ts, applied in lib/bot/core.ts). Doc `learningLog/{auto}` = { lid, at, path, user, bot }. `lid` is a
// random id stored only on the person's waLinks doc, so "delete my data" (lib/wa/privacy.ts) deletes the link and the
// rows are no longer tied to them. Server-only (firestore.rules denies clients). People are told (`privacy`, one-time notice).
import { adminDb } from '@/lib/server/firebaseAdmin';

export interface LearningTurn {
  lid: string;
  at: number;
  /** 'fast:<kind>' or 'ai'. */
  path: string;
  user: string;
  bot: string;
}

export async function logLearning(turn: LearningTurn): Promise<void> {
  await adminDb().collection('learningLog').add(turn);
}
