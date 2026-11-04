/**
 * Seed the LOCAL Firebase emulators with a believable demo world for screenshots and manual checks.
 * Never touches the live project: it refuses to run unless both emulators answer on 127.0.0.1.
 *
 *   firebase emulators:start --only auth,firestore --project getemdone-87679      (repo root)
 *   cd native && npm run seed:emulator
 *   EXPO_PUBLIC_EMULATOR=1 npx expo start --web --clear   -> sign in as kaif@nudge.test / nudge-test-1
 *
 * Everything is written THROUGH the repo's firestore.rules as the matching signed-in user (not with an admin bypass), so a
 * rejected write here means the app's write would be rejected in production too. Only `friendInvites` (server-only in the
 * rules) is written with the emulator's `Bearer owner` bypass.
 * Re-running is safe: it deletes the demo users first (the emulator clear endpoints), then seeds again.
 */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  addDoc, arrayUnion, collection, connectFirestoreEmulator, doc, getFirestore, setDoc, updateDoc,
} from 'firebase/firestore';
import { addDays, localDate, deviceZone } from '../src/lib/dates.ts';

const PROJECT = 'getemdone-87679';
const PASSWORD = 'nudge-test-1';
const DAY = 86400000;

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

if (!(await up('http://127.0.0.1:8080')) || !(await up('http://127.0.0.1:9099'))) {
  console.error('Emulators are not running on 127.0.0.1:8080 / :9099. Start them first (see the header of this file).');
  process.exit(1);
}
// Start from a clean slate.
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator.googleapis.com/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

interface Person { key: string; name: string; email: string; code: string; uid: string; db: ReturnType<typeof getFirestore> }

async function makePerson(key: string, name: string, code: string): Promise<Person> {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: 'localhost' }, key);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const email = `${key}@nudge.test`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  return { key, name, email, code, uid: cred.user.uid, db };
}

const now = Date.now();
const zone = deviceZone();
const today = localDate(zone);
const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date(now + dayOffset * DAY);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

const me = await makePerson('kaif', 'Ibrahim', 'KAIF22');
const aisha = await makePerson('aisha', 'Aisha', 'AISH77');
const rahul = await makePerson('rahul', 'Rahul', 'RAHU55');
const dev = await makePerson('dev', 'Dev', 'DEVX99');
const meera = await makePerson('meera', 'Meera', 'MEER33');
const people = [me, aisha, rahul, dev, meera];

const notif = (n: Partial<Record<string, unknown>>) => ({ enabled: true, deadlineReminders: true, deadlineMinutesBefore: 30, noonCheckIn: true, commitmentReminders: true, friendCompletions: true, friendComments: true, friendEncouragement: true, sound: true, vibrate: true, ...n });

for (const p of people) {
  await setDoc(doc(p.db, 'users', p.uid), {
    id: p.uid, displayName: p.name, email: p.email, friendCode: p.code, friends: [], createdAt: now - 40 * DAY,
    streakData: { currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} },
    notificationSettings: notif({}),
    ...(p.key === 'kaif' ? {} : { timezone: 'Asia/Dubai' }),
  });
}

// Friendships: me with aisha, rahul, dev (mutual); aisha with rahul. Meera is only a pending request.
async function befriend(a: Person, b: Person) {
  await updateDoc(doc(a.db, 'users', a.uid), { friends: arrayUnion(b.uid) });
  await updateDoc(doc(a.db, 'users', b.uid), { friends: arrayUnion(a.uid) });
}
await befriend(me, aisha);
await befriend(me, rahul);
await befriend(me, dev);
await befriend(aisha, rahul);

await updateDoc(doc(me.db, 'users', me.uid), {
  friendGroups: [{ id: 'g_1', name: 'Gym crew', memberIds: [aisha.uid, dev.uid] }],
  lastFocusSessionDate: addDays(today, -1),
});
await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/friendInvites`, {
  method: 'POST',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: {
    fromUid: { stringValue: meera.uid }, toUid: { stringValue: me.uid }, status: { stringValue: 'pending' }, createdAt: { integerValue: String(now - 3600000) },
  } }),
});

interface T { text: string; [k: string]: unknown }
let order = 1;
async function task(p: Person, t: T): Promise<string> {
  const base = {
    userId: p.uid, isPrivate: false, visibility: 'everyone', visibilityList: [], completed: false, createdAt: now - 3600000 * (20 - order),
    completedAt: null, order: order++, deleted: false,
  };
  const merged = { ...base, ...t } as Record<string, unknown>;
  if (merged.visibility === 'private') merged.isPrivate = true;
  const ref = await addDoc(collection(p.db, 'tasks'), merged);
  return ref.id;
}

// ---- me: today ----
const focusA = await task(me, { text: 'Send the invoice to Rahul', focusDate: today, committed: true, tags: ['briefcase'] });
const focusB = await task(me, { text: 'Book dentist for Friday', focusDate: today });
await task(me, { text: 'Call mum', deferredTo: `${today}T18:45`, remindAt: at(0, 18, 15), remindFor: at(0, 18, 45), tags: ['phone'] });
await task(me, { text: 'Renew the car insurance', dueDate: at(0, 1, 0), tags: ['car'] }); // deadline already passed: overdue
await task(me, { text: 'Reply to the landlord', createdAt: now - 2 * DAY });
await task(me, { text: 'Buy a birthday gift for Dev', createdAt: now - 3 * DAY, visibility: 'private' });
await task(me, { text: 'Plan the weekend trip', deferredTo: addDays(today, 2) });
await task(me, { text: 'Water the plants', recurrence: { frequency: 'daily', startDate: addDays(today, -10), completedDates: [addDays(today, -1), addDays(today, -2)], skippedDates: [] } });
await task(me, {
  text: 'Gym: legs', recurrence: { frequency: 'weekly', days: [1, 3, 5], startDate: addDays(today, -20), completedDates: [], skippedDates: [] },
});
await task(me, {
  text: 'Prepare the Q4 deck', notes: 'Numbers from the finance sheet. Keep it to 8 slides.', tags: ['briefcase', 'star'],
  subtasks: [{ id: 's1', title: 'Outline', completed: true }, { id: 's2', title: 'Charts', completed: false }, { id: 's3', title: 'Rehearse', completed: false }],
  comments: [{ id: `${aisha.uid}_1`, userId: aisha.uid, userName: 'Aisha', text: 'You got this. Finish the charts first.', timestamp: now - 2 * 3600000 }],
  reactions: [{ userId: rahul.uid, emoji: '🔥', userName: 'Rahul', timestamp: now - 3600000 }],
});
await task(me, { text: 'Morning walk', completed: true, completedAt: at(0, 1, 30) });
await task(me, { text: 'Pay the electricity bill', completed: true, completedAt: at(0, 1, 40), createdAt: now - 5 * DAY });
// ---- me: history for the heatmap (completions on earlier days, mostly a streak, a couple of gaps) ----
const gaps = new Set([4, 9, 15]);
for (let back = 1; back <= 24; back++) {
  if (gaps.has(back)) continue;
  const n = 1 + (back % 4);
  for (let i = 0; i < n; i++) {
    await task(me, { text: `Past task ${back}.${i}`, createdAt: at(-back, 8), completed: true, completedAt: at(-back, 12 + i), ...(i === 0 && back === 5 ? { committed: true } : {}) });
  }
}
await task(me, { text: 'Missed commitment', createdAt: at(-4, 8), committed: true });
// bin
await task(me, { text: 'Old idea: learn the oud', deleted: true, deletedAt: now - 2 * DAY });
await task(me, { text: 'Cancel the gym trial', deleted: true, deletedAt: now - 5 * DAY });

// focus session yesterday (the recap reads it)
await setDoc(doc(me.db, 'focusSessions', me.uid, 'sessions', addDays(today, -1)), {
  date: addDays(today, -1), taskIds: ['x1', 'x2'], completedTaskIds: [], createdAt: at(-1, 8), skipped: false,
});
void focusA; void focusB;

// ---- friends' tasks ----
await task(aisha, { text: 'Finish the lab report', completed: true, completedAt: at(0, 0, 40), comments: [] });
await task(aisha, { text: 'Gym: back and biceps', completed: true, completedAt: at(0, 1, 15), reactions: [{ userId: dev.uid, emoji: '💪', userName: 'Dev', timestamp: now - 600000 }] });
await task(aisha, { text: 'Read 20 pages', completed: true, completedAt: at(0, 1, 50) });
await task(aisha, { text: 'Submit the visa form' });
await task(aisha, { text: 'Secret surprise party plan', visibility: 'private' });
await task(rahul, { text: 'Fix the login bug', createdAt: now - 4 * 3600000 });
await task(rahul, { text: 'Call the bank', createdAt: now - 5 * 3600000 });
await task(rahul, { text: 'Cook dinner for 6', createdAt: now - 6 * 3600000 });
await task(dev, { text: 'Run 5k', completed: true, completedAt: at(0, 0, 55) });
await task(dev, { text: 'Study for the exam', committed: true });
for (const p of [aisha, rahul, dev]) {
  for (let back = 1; back <= 6; back++) await task(p, { text: `Done ${back}`, createdAt: at(-back, 8), completed: true, completedAt: at(-back, 14) });
}

// ---- fitness + presence ----
let wi = 0;
for (const back of [0, 1, 3, 4, 6, 8, 11, 13, 16, 20]) {
  const date = addDays(today, -back);
  await setDoc(doc(me.db, 'fitness', me.uid, 'days', date), {
    date, workouts: [{ type: ['Run', 'Strength', 'Cycling', 'Yoga'][wi++ % 4], minutes: 25 + (back % 5) * 8, distanceKm: back % 2 ? 4.2 : undefined, source: wi % 2 ? 'wa' : 'app', at: at(-back, 7) }].map((w) => JSON.parse(JSON.stringify(w))),
    steps: 4000 + ((back * 997) % 7000), weightKg: 78.4 - back * 0.07, sleepH: 6 + (back % 4) * 0.5, waterL: 1.5 + (back % 3) * 0.5, updatedAt: at(-back, 7),
  });
}
await setDoc(doc(me.db, 'fitnessGoals', me.uid), { workoutsPerWeek: 4, stepsPerDay: 8000, targetWeightKg: 75, visibility: 'friends' });
await setDoc(doc(aisha.db, 'fitness', aisha.uid, 'days', today), { date: today, workouts: [{ type: 'Strength', minutes: 55, source: 'wa', at: at(0, 1, 5) }], updatedAt: now });
await setDoc(doc(aisha.db, 'presence', aisha.uid), { isActive: true, startedAt: now - 25 * 60000, focusTaskCount: 2, updatedAt: now });

// ---- notifications for me ----
const mk = (n: Record<string, unknown>) => addDoc(collection(aisha.db, 'notifications'), { userId: me.uid, read: false, createdAt: now, ...n });
await mk({ type: 'comment', title: '💬 Aisha commented', message: 'Aisha commented on your task', taskText: 'Prepare the Q4 deck', commentText: 'You got this. Finish the charts first.', fromUserId: aisha.uid, fromUserName: 'Aisha', createdAt: now - 2 * 3600000 });
await addDoc(collection(rahul.db, 'notifications'), { userId: me.uid, type: 'encouragement', title: '💪 Rahul nudged you to get things done today!', message: 'Rahul nudged you to get things done today!', fromUserId: rahul.uid, fromUserName: 'Rahul', read: false, createdAt: now - 5 * 3600000 });
await addDoc(collection(dev.db, 'notifications'), { userId: me.uid, type: 'completion', title: 'Dev finished a task', message: 'Dev finished "Run 5k"', fromUserId: dev.uid, fromUserName: 'Dev', read: true, createdAt: now - 26 * 3600000 });
void mk;

console.log('Seeded. Sign in as kaif@nudge.test / nudge-test-1 (friends: aisha, rahul, dev; pending request from meera).');
process.exit(0);
