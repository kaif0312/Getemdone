// OWNER: agent "social". Friends + social actions, writing the SAME docs as the PWA so in-app + push keep working.
export interface FriendLite { uid: string; displayName: string; waLinked: boolean; }
export interface FriendActivity { uid: string; displayName: string; doneToday: { taskId: string; text: string }[]; workoutsToday: string[]; streak: number; }

export async function listFriends(uid: string): Promise<FriendLite[]> { throw new Error('TODO' + uid); }
/** Fuzzy match a friend by name ("ali"); null if none/ambiguous. */
export async function findFriend(uid: string, name: string): Promise<FriendLite | null> { throw new Error('TODO' + uid + name); }
/** encouragement notification (respects notificationSettings) + WhatsApp message if friend linked & opted in & window/template allows. Max 1 per pair per local day (server-side). */
export async function nudgeFriend(uid: string, friendUid: string, message?: string): Promise<{ ok: boolean; reason?: string }> { throw new Error('TODO' + uid + friendUid + message); }
/** Same semantics as useTasks reactions (one per user per task, toggle). Only on tasks the user may see (utils/visibility). */
export async function reactToTask(uid: string, taskId: string, emoji: string): Promise<void> { throw new Error('TODO' + uid + taskId + emoji); }
export async function commentOnTask(uid: string, taskId: string, text: string): Promise<void> { throw new Error('TODO' + uid + taskId + text); }
/** Friends' visible completions + workouts for local today (respecting visibility + fitness goals visibility). */
export async function friendsActivity(uid: string): Promise<FriendActivity[]> { throw new Error('TODO' + uid); }
/** Friend invite with consent: creates friendInvites/{id}; accept adds both sides. */
export async function inviteFriend(uid: string, byPhoneOrCode: string): Promise<{ ok: boolean; reason?: string }> { throw new Error('TODO' + uid + byPhoneOrCode); }
export async function answerInvite(uid: string, inviteId: string, accept: boolean): Promise<void> { throw new Error('TODO' + uid + inviteId + accept); }
