// OWNER: agent "transport". Graph API sends from the Nudge number. Env: WA_TOKEN, WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION (default v26.0).
// Every send is skipped (logged to an in-memory outbox readable by tests) when NUDGE_WA_DRY_RUN=1, so tests never hit Meta.
import type { WaButton, WaListRow } from './types';

export async function sendText(to: string, text: string, replyTo?: string): Promise<string | null> { throw new Error('TODO' + to + text + replyTo); }
export async function sendButtons(to: string, body: string, buttons: WaButton[], header?: string): Promise<string | null> { throw new Error('TODO' + to + body + buttons + header); }
export async function sendList(to: string, body: string, buttonLabel: string, rows: WaListRow[], header?: string): Promise<string | null> { throw new Error('TODO' + to + body + buttonLabel + rows + header); }
/** Template with body variables (and optional quick-reply button payloads). */
export async function sendTemplate(to: string, name: string, variables: string[], opts?: { language?: string; buttonPayloads?: string[] }): Promise<string | null> { throw new Error('TODO' + to + name + variables + opts); }
export async function sendReaction(to: string, messageId: string, emoji: string): Promise<void> { throw new Error('TODO' + to + messageId + emoji); }
/** Blue ticks (+ typing indicator if typing). */
export async function markRead(messageId: string, typing?: boolean): Promise<void> { throw new Error('TODO' + messageId + typing); }
/** Download media bytes by id. */
export async function fetchMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> { throw new Error('TODO' + mediaId); }
/** True if a free-form message is allowed now (last inbound < 24h, minus 5 min margin). */
export function windowOpen(lastInboundAt: number, now?: number): boolean { throw new Error('TODO' + lastInboundAt + now); }
/** Test helper: messages captured in dry-run mode. */
export function dryRunOutbox(): { kind: string; to: string; payload: unknown }[] { return []; }
