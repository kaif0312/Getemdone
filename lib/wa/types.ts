// Shared WhatsApp-bot types. CONTRACT between lib/wa (transport), lib/bot (brain) and lib/server (domain).
// Change only with all three in mind.

/** One inbound WhatsApp message, normalised from the Cloud API webhook `messages[]` entry. */
export interface InboundMessage {
  /** WhatsApp message id (wamid...), used for dedupe and replyTo. */
  id: string;
  /** Sender wa_id, digits only with country code, e.g. "916238952660". */
  from: string;
  /** Profile name WhatsApp gave us, if any. */
  profileName?: string;
  /** Unix ms. */
  timestamp: number;
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'interactive' | 'button' | 'reaction' | 'other';
  /** Text body, or the caption of an image. */
  text?: string;
  /** Button / list tap: the id we set when sending, and its visible title. */
  reply?: { id: string; title: string };
  /** Media id for audio (voice note), image, document or video; fetch with lib/wa/send.ts fetchMedia(). `filename` is the
   *  original name of a document (WhatsApp only sends it for documents). */
  media?: { id: string; mimeType: string; filename?: string };
  /** Error code Meta attached to the message (e.g. 131052 = the user's media file is over the 100 MB Cloud API limit). */
  errorCode?: number;
  /** Emoji reaction to one of our messages. */
  reaction?: { emoji: string; messageId: string };
}

/** Body that the Iskaria console forwards to POST /api/wa/inbound (HMAC-SHA256 hex of the raw body in
 *  header `x-nudge-signature`, key NUDGE_FORWARD_SECRET). `value` is the raw `entry[].changes[].value`
 *  object of a WhatsApp webhook (contains `messages`, `statuses`, `contacts`, `metadata`). */
export interface ForwardedEvent {
  tenant: 'nudge';
  receivedAt: number;
  value: Record<string, unknown>;
}

/** A button for sendButtons (max 3, title <= 20 chars). Ids use the prefixes in BUTTON_IDS. */
export interface WaButton {
  id: string;
  title: string;
}

/** A row for sendList (max 10, title <= 24 chars, description <= 72). */
export interface WaListRow {
  id: string;
  title: string;
  description?: string;
}

/** Reply/button id grammar, so taps can be handled without the model. `<x>` = a Firestore doc id. */
export const BUTTON_IDS = {
  done: (taskId: string) => `done:${taskId}`,
  tomorrow: (taskId: string) => `tmrw:${taskId}`,
  del: (taskId: string) => `del:${taskId}`,
  undo: (actionId: string) => `undo:${actionId}`,
  task: (taskId: string) => `task:${taskId}`, // list row: open task actions
  focus: (taskId: string) => `focus:${taskId}`, // morning ritual pick
  react: (taskId: string, emoji: string) => `react:${taskId}:${emoji}`,
  nudge: (friendUid: string) => `nudge:${friendUid}`,
  checkinStart: 'checkin:start',
  checkinSkip: 'checkin:skip',
} as const;

/** A linked WhatsApp user: doc `waLinks/{waId}`. */
export interface WaLink {
  waId: string;
  uid: string;
  linkedAt: number;
  /** Unix ms of the user's last inbound message (24h customer-service window). */
  lastInboundAt: number;
  /** IANA zone, copied to users/{uid}.timezone too. */
  timezone: string;
  /** Local "HH:mm" for the morning check-in, null = off. */
  checkinTime: string | null;
  /** Local "HH:mm" for the evening recap, null = off. */
  recapTime: string | null;
  /** Receive the friends digest / friend nudges on WhatsApp. */
  friendAlerts: boolean;
  /** User sent STOP: send nothing proactive. */
  muted: boolean;
  /** Random id for the learning log (lib/server/learning.ts); deleted with this doc on "delete my data". */
  learnId?: string;
  /** Unix ms when the one-time privacy notice was sent. */
  privacyNoticeAt?: number;
}

/** Short-lived bot memory: doc `waSessions/{waId}`. */
export interface WaSession {
  /** Last turns, oldest first, max 12. */
  turns: { role: 'user' | 'bot'; text: string; at: number }[];
  /** Task ids shown in the last numbered list, so "done 2" resolves. Index 0 = item 1. */
  lastList: string[];
  /** Last undoable action. */
  lastAction?: { id: string; kind: string; payload: Record<string, unknown>; at: number };
  updatedAt: number;
}
