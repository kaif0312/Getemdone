// "delete my data" on WhatsApp: erase the bot's chat memory and disconnect the number.
// Deleting waLinks/{waId} also drops `learnId`, so learningLog rows (lib/server/learning.ts) are no longer tied to
// the person. Tasks and workouts belong to the person's Nudge app account and stay there (they can delete them in the app).
import { adminDb } from '@/lib/server/firebaseAdmin';
import { unlink } from './links';

export async function forgetMe(waId: string): Promise<void> {
  await adminDb().doc(`waSessions/${waId}`).delete();
  await unlink(waId);
}
