/** Cross-screen links in one place, so merge fixes are one-liners. */
import { Linking } from 'react-native';
import { NUDGE_WA_NUMBER } from '@/lib/config';

/** The Today agent's recycle-bin screen. Change here if they name it differently. */
export const BIN_ROUTE = '/today/bin';

export function coachChatUrl(text?: string): string {
  return `https://wa.me/${NUDGE_WA_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Open the coach's WhatsApp chat (optionally with a prefilled message). Returns false if it could not open. */
export async function openCoachChat(text?: string): Promise<boolean> {
  try {
    await Linking.openURL(coachChatUrl(text));
    return true;
  } catch {
    return false;
  }
}

/** "+965 6009 1617" style display of the coach number. */
export const COACH_NUMBER_DISPLAY = '+965 6009 1617';
