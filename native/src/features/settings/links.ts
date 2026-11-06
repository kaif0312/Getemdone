/** Cross-screen links in one place, so merge fixes are one-liners. */
import { Linking } from 'react-native';
import { API_BASE, NUDGE_WA_NUMBER } from '@/lib/config';

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

/**
 * Account deletion (Google Play policy). The app deletes in place via POST /api/app/account/delete (src/lib/accountApi.ts);
 * these are only the FALLBACK when that call fails: a deletion REQUEST to the same address and process as the public page
 * (`app/delete-account` on the web, 30 days).
 */
export const ACCOUNT_DELETION_EMAIL = 'ibrahim@iskaria.com';
export const DELETE_ACCOUNT_PAGE = `${API_BASE}/delete-account`;

/** mailto: link for the deletion request, carrying what we need to find the account (uid, e-mail, WhatsApp number). */
export function deletionRequestMailto(info: { uid: string; email?: string | null; waId?: string | null; name?: string | null }): string {
  const lines = [
    'Please delete my Nudge account and all its data.',
    '',
    `Account id: ${info.uid}`,
    info.email ? `E-mail: ${info.email}` : null,
    info.waId ? `WhatsApp: +${info.waId}` : null,
    info.name ? `Name: ${info.name}` : null,
    '',
    'Sent from the Nudge app.',
  ].filter((l): l is string => l !== null);
  const q = `subject=${encodeURIComponent('Delete my Nudge account')}&body=${encodeURIComponent(lines.join('\n'))}`;
  return `mailto:${ACCOUNT_DELETION_EMAIL}?${q}`;
}
