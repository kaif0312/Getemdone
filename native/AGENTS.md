# Nudge native app (`native/`): agent notes

Expo SDK 57 / React Native 0.86 / expo-router 57 / React 19.2, TypeScript strict. Scope + spec: `../docs/NATIVE_APP_PLAN.md`.
Waves 1-3 are done: theme, UI kit, data hooks, crypto, auth, shell, the Today / Friends / Progress / Me features, and a polish + review pass (2026-11-05). See "Status / known gaps" at the end.

## Commands (run in `native/`)
- `npm install` (`.npmrc` has `legacy-peer-deps=true`) · `npx expo start` · `npx expo start --web` (browser check, 390x844).
- `npx tsc --noEmit` (must be clean) · `npm run test:crypto` (web/native crypto parity, 138 checks, must pass) ·
  `npx expo export --platform ios|android` (bundle check; `dist/` is git-ignored).
- UI showcase: **`/dev/kit`** (dev only; `?scheme=light|dark`). Final screenshots: `docs/screens/final-<screen>-<light|dark>.png` (390x844, emulator seed data).
- `npm run seed:emulator` (`scripts/seed_emulator.mts`): fills the LOCAL emulators with 5 accounts (sign in `kaif@nudge.test` / `nudge-test-1`; friends aisha, rahul, dev; pending request from meera), tasks of every kind, history, workouts, presence, notifications. Writes go through `firestore.rules` as each user, so a rejected seed write is a rejected production write. Refuses to run unless both emulators answer; wipes and reseeds on every run.
- Web check recipe: `firebase emulators:start --only auth,firestore --project getemdone-87679` (repo root; `npx firebase-tools@13`), seed, then `EXPO_PUBLIC_EMULATOR=1 EXPO_PUBLIC_API_BASE=http://127.0.0.1:9 npx expo start --web --clear` with a private `TEMP`/`TMP`. **Do not set `CI=1`: it turns the Metro file watcher off and the browser keeps serving the first bundle** (cost an hour of looking at stale screens). Playwright: `page.emulateMedia({ colorScheme })` for dark, click tabs by role `tab`.
- Do NOT run `eas init`/builds here yet (wave 3). EAS owner `kaifuten`, bundle/package `com.iskaria.nudge`, scheme `nudge`.
- Env: `native/.env` + `eas.json` hold the PUBLIC Firebase config and `EXPO_PUBLIC_API_BASE` (https://getemdone.vercel.app).
  No server secret ever goes in this app.

## Folder map
```
app/                      expo-router screens (routes only; keep thin, logic in src/features)
  _layout.tsx             providers + Stack.Protected (signed in -> tabs/sheets, signed out -> (auth)); renders nothing while auth loads so cold-start deep links survive the guard
  (auth)/                 welcome, email, whatsapp                      [done]
  (tabs)/                 today, friends, progress, me + custom TabBar
  add.tsx task/[id].tsx friend/[uid].tsx inbox.tsx friends/* progress/* me/* today/*   sheets and pages (all done)
  dev/kit.tsx             UI showcase
src/ui/                   the kit (import from '@/ui')
src/hooks/                data hooks (below)
src/lib/                  firebase, crypto, keyring, dates, copied PWA helpers, push, loginApi
src/features/calendar/     Calendar (route app/calendar.tsx, opened from the calendar button in the Today header): month grid + tapped-day list, week agenda. `events.ts` is a COPY of the server's lib/calendar/events.ts (WhatsApp /calendar images): change both together.
src/features/{tasks,friends,progress,fitness,settings,inbox}/   empty: your feature components go here
src/components/AppLock.tsx  Face ID gate (honours users.biometricEnabled)
scripts/test_crypto_parity.mts
```
Alias: `@/` = `src/`.

## UI kit (`@/ui`)
Theme: `useTheme()` -> `{ colors, isDark, scheme }`; **never hard-code hex**, use tokens (`bg surface surfaceAlt border text textMuted textFaint
primary/accent/sun/success/danger (+ Edge, Soft) onFill bar`). `ThemeProvider scheme=...` forces a theme for a subtree. Also `brand`, `radius`, `space`, `HIT`(44), `fonts` (Nunito 600/700/800/900).
Components: `Text` (variants display/title/heading/subheading/body/bodyStrong/caption/label/number; `tone`), `Button` (primary/accent/success/secondary/ghost/danger,
sm/md/lg, `icon`, `loading`, 3D press + haptic), `Card` (raised/tone/onPress), `Chip`, `Avatar` (photo or initials, `ring='focus'|'done'`, `streak`),
`ProgressRing`, `StreakFlame`, `StreakBadge` (count-up), `useCountUp`, `AnimatedCheckbox` + `StrikeText`, `SwipeRow` (right=done, left=`actions`),
`Skeleton/SkeletonRow/SkeletonList`, `EmptyState`, `ErrorState`, `CoachSticker` (poses: blowing cheer clipboard disappointed flex proud sleepy waiting),
`ConfettiProvider/useConfetti().fire()`, `ToastProvider/useToast().show(msg,{kind})`, `Header` (title + bell badge), `TextField`, `Icon` (the ONE stroke set, 24px grid; add icons in `Icon.tsx`, never a feature-local icon file),
`Screen` (page container with tab-bar/safe-area padding, pull to refresh; every tab Header has a title + subtitle so titles sit at the same height), `TabBar`, `haptic.*`, `springs`, `useReduceMotion()`.
Rules: 44pt targets; every screen has loading (Skeleton), empty (EmptyState with coach), error (ErrorState + retry), dark mode; respect Reduce Motion;
check-off = `AnimatedCheckbox` + haptic; list cleared = `confetti.fire()` + coach `cheer`. Tell the coach's story with poses, not stock icons.
Copy voice: short, direct, a little strict ("3 left. Move."). Never cutesy, never long. Every screen nudges back to WhatsApp for capture where it fits.

### Sheets
Convention (full text in `src/ui/Sheet.tsx`): a route registered in `app/_layout.tsx` with `options={sheetOptions({ detents: [0.5, 1] }, colors)}`,
body wrapped in `<SheetScaffold title footer>`, opened with `router.push`, closed with `router.back()`. No hand-made bottom sheets.

## Data hooks (`@/hooks/*`), all context-shared (one listener), mounted in `app/_layout.tsx`
- `useAuth()` -> `{ user, uid, profile (live users/{uid}), loading, isWhitelisted, signIn, signUp, signInWithToken, resetPassword, signOut, updateProfile(patch) }`
- `useEncryption()` -> `{ isInitialized, encryptForSelf, decryptForSelf, encryptForFriend, decryptFromFriend, decryptComment, reloadKeys }` (hooks below already use it)
- `useTasks()` -> `{ tasks (own, not deleted, decrypted, newest first), loading, error, retry, addTask(NewTaskInput)->id, addTasks, toggleComplete(task,bool,dateStr?), completeTask, uncompleteTask,
  deferTask(task, 'YYYY-MM-DD'|null), updateText, setDueDate, setRemindAt, setVisibility, setCommitted, setFocusDate, commitFocus(ids), skipFocus, setTags, setRecurrence, setNotes,
  setSubtasks, setSkipRollover, reorder, deleteTask (soft), restoreTask, permanentlyDeleteTask, fetchDeleted, emptyBin, addAttachment, removeAttachment }`
  Local writes show instantly (Firestore latency compensation), no extra optimistic state needed. "Today" = `shouldShowInTodayView(task, today)` from `@/lib/taskFilter`.
- `useFriends()` -> `{ friends (live profiles), loading, friendTasks (FriendTask[], decrypted, `hidden` = private), tasksLoading, incomingInvites, searchByFriendCode, searchByEmail, addFriend, removeFriend, acceptInvite, updateFriendGroups, updateDefaultVisibility }`
- `useTaskSocial()` -> `{ addReaction, addComment, editComment, deleteComment, addCommentReaction, sendEncouragement, sendNudge(friendId)->false if already nudged today }` (own or friends' tasks)
- `useNotificationsInbox()` -> `{ notifications, unread, loading, markRead, markAllRead, remove }`
- `usePresence(friendIds)` -> `{[id]: FocusPresenceData|null}`; `useMyFocus()` -> `{ isActive, startedAt, elapsedSeconds, focusTaskCount, startFocus(n), endFocus }`; `formatElapsed`
- `useStreak()` -> `{ streakData, current, longest, focusCurrent, focusLongest, fitnessStreak, doneToday, atRisk, loading, error, retry, hasStored }` (the single writer of `users.streakData`; never writes while any source errored). `useFitness()` also exposes `error` + `retry`; Progress shows `ErrorState` for the page (no stored data) and for the fitness block
- `useFitness()` -> `{ days, dayMap, goals, week, workoutDates, loading, logWorkout, logMetric, undoLastWorkout, setGoals }`; `useFriendFitness(friendId)`
- `useToday()` -> `{ today, zone }` (rolls over at midnight / on foreground; zone = `users.timezone` else device). `AuthProvider` also calls `setActiveZone(profile.timezone)` (`lib/dates.ts`), so `getTodayString()` / `getDateString()` (taskFilter) and every write that stamps a date follow the same zone. Wall-clock times typed into a task (`deferredTo` `YYYY-MM-DDTHH:mm`, `remindAt`) are still the DEVICE clock, like the PWA.
- `usePush()` -> `{ status, askAfterFirstAction(), enable() }`: call `askAfterFirstAction()` right after the user's first meaningful action (Add does), never on launch.
  `usePushSetup()` (root) refreshes the token and routes notification taps: `data.type` task|friend|inbox -> `/task/<taskId>` | `/friend/<uid>` | `/inbox`.
- `useWhatsAppLogin()` powers `(auth)/whatsapp.tsx` (contract in `src/lib/loginApi.ts`).

## Crypto rule
`src/lib/crypto.ts` must stay byte-for-byte compatible with `utils/crypto.ts` (key = base64 of 32 raw bytes, `e1:` + base64(iv12 || ct || tag16)).
Any edit -> `npm run test:crypto`. `E2EE_ENABLED` (src/lib/config.ts) mirrors the PWA (currently **false**: plaintext writes, `e1:` reads still work). Flip only with the PWA.
Pure helpers copied from the PWA carry a header naming their source (`types.ts recurrence.ts taskFilter.ts visibility.ts streak.ts`); when the source changes, change both.
Never invent Firestore fields the PWA lacks. Timestamps are ms numbers. `expoPushTokens` is the one agreed addition (plan section 4).

## Stubbed / decisions for the owner
- WhatsApp login depends on the server agent's `/api/app/login/start|poll`; untested end to end until it ships.
- Friend invites: `friendInvites` are server-written only (rules). `useFriends` can read them and `acceptInvite` does the mutual add, but the invite doc stays `pending`; needs a server endpoint to answer/send (consent flow).
- Push: `getExpoPushTokenAsync` needs the EAS projectId (`eas init` adds `extra.eas.projectId`); until then status is `unavailable` and nothing is written. Server senders for `expoPushTokens` are the server agent's.
- Reminders: `setRemindAt` writes `remindAt/remindFor`; the 15-min cron fires them (exact-time QStash scheduling is bot-side only).
- Nudge throttle is per device (AsyncStorage), like the PWA's localStorage; the server `nudgeLimits` path is not reachable from the client.
- Friends' tasks: last 30 days only (`FRIEND_TASK_WINDOW_DAYS`) but all friends; the PWA loads all history for 10 friends.
- Whitelist: auto-add for new email users is mirrored; `isWhitelisted` is exposed but the app does NOT gate on it (WhatsApp-only accounts have no email).
- `users.timezone` is not auto-written; `useToday()` falls back to the device zone.
- Web (`expo start --web`) is for screenshots only; Firebase persistence and push differ there.

## Today / tasks (wave 2, `src/features/tasks/`, `src/features/inbox/`)
- Routes (thin): `(tabs)/today`, `add`, `task/[id]`, `inbox`, `today/{more,focus,recap,bin}` (sheets, registered in `_layout.tsx`). Me tab can link the bin with `router.push('/today/bin')`.
- `useTodayTasks()` = tasks through `shouldShowInTodayView` + `buildSections` (helpers.ts). A task is in ONE section: Focus > Committed > Overdue (deadline passed) > Rolled over (created earlier) > Today > Coming up (scheduled later) > Done. "Left" ignores Coming up.
- Time on a task = `deferredTo` `YYYY-MM-DDTHH:mm` (PWA format) + `remindAt` (cron/bot fires it). Add with a time sets both; detail "Scheduled" save does the same via `deferTask` + `setRemindAt`. `deferTask` clears reminders (server rule), so set the reminder after.
- Tags: PWA stores icon ids (`briefcase`, `home`, ... or `id:tint`, legacy raw emoji). Native shows them as emoji (`tagDisplay`) and writes icon ids (`TAG_CHOICES`).
- Focus ritual: card before 14:00 when `profile.lastFocusSessionDate !== today`; `commitFocus` (max 3 in the UI). If the session write is denied (rules not deployed for `focusSessions`) it falls back to `setFocusDate` and remembers the skip in AsyncStorage (`nudge.focusSkipped`). Evening recap: banner after 18:00, always in the header menu (`/today/more`).
- Pickers (calendar, time, tags, visibility, recurrence) are inline panels, not nested modals.
- `/task/<id>` opens your task (editable) or a friend's (`useFriends().friendTasks`, read-only + react/comment). Attachments: expo-image-picker -> `attachments/<taskId>/<id>` in Storage (no thumbnail, no compression beyond picker quality 0.7).
- Not done: drag-reorder (up/down arrows on subtasks instead), document attachments, Google Calendar events strip.
## Friends (`app/(tabs)/friends.tsx`, `app/friend/[uid].tsx`, `app/friends/*`, `src/features/friends/`)
- **Tab**: requests banner, avatar strip (orange pulsing ring = `presence` active < 4 h, green ring = cleared today, flame = streak), ranked "Today" board (you
  included; done/total from `dayStats` in `logic.ts`: only tasks you may read, tasks scheduled for a later day excluded), per-friend "Wins" cards (visible
  completions in the last 36 h + workouts, newest first; react / comment / Nudge), "Quiet so far" rows (the Nudge slot). Data: `useBoard()` (one presence + one
  fitness listener per friend). Empty state: coach `blowing` + "Bring a friend. Accountability needs witnesses."
- **Nudge** = `useTaskSocial().sendNudge` (one per friend per day, per device, AsyncStorage `nudge_sent_<id>`); `useNudges` reads that key so the button shows
  "22 h" (time to local midnight) when used. The server's `nudgeLimits` is not reachable from the client.
- **Routes** (all registered in `app/_layout.tsx`): sheets `friends/add` (my code + QR + Copy/Share/WhatsApp + add by code with preview; `?code=` prefills),
  `friends/requests`, `friends/group?id=<id|new>`, `friends/comments?taskId=`, `friends/encourage?uid=`, `friends/remove?uid=`; card `friends/groups`.
- **Consent**: `src/features/friends/api.ts` calls the server's `POST /api/app/friends/invite {code|uid}` and `/answer {inviteId, accept}` (Bearer = Firebase ID
  token; shapes in the server repo AGENTS.md). Requests screen is optimistic (card leaves at once, returns on error). `useFriends().addFriend/acceptInvite`
  (direct mutual write, no consent) are NOT used by the UI. Needs those endpoints deployed at `EXPO_PUBLIC_API_BASE`.
- **Groups**: `users.friendGroups` via `updateFriendGroups`, ids `g_<ms>` like the PWA.
- **QR**: `src/features/friends/qr.ts`, pure TS encoder (byte mode, level L, versions 1-5, <= 106 bytes), verified by decoding with OpenCV. Encodes
  `nudge://friends/add?code=<CODE>` (the app opens the add screen with the code filled via the `nudge` scheme). In-app scanning is not built (no expo-camera).
- **Firestore rules**: the rules DEPLOYED in project getemdone-87679 are from 2026-02-18 and lack `presence`, `fitness`, `fitnessGoals` and `friendInvites`, so
  the focus ring, workouts and the requests banner stay empty against production until `firestore.rules` is deployed (checked with the Rules API).
- **Local test with real rules**: `firebase emulators:start --only auth,firestore --project getemdone-87679` (ports 9099/8080) and
  `EXPO_PUBLIC_EMULATOR=1 EXPO_PUBLIC_API_BASE=<harness> npx expo start --web` (`src/lib/firebase.web.ts` connects to the emulators). Web only.
- Metro shares a cache across worktrees through the `node_modules` junction: run `expo start --clear` if another worktree's screens show up.
## Progress tab (`app/(tabs)/progress.tsx` -> `src/features/progress/`, `src/features/fitness/`)
- `ProgressScreen`: `StreakHero` (coach pose by state: done=proud/flex, at risk=sleepy, broken=disappointed, none=sleepy), `HeatmapCalendar` (month grid, swipe via PanResponder or arrows, intensity from `completionHistory`, purple dot = focus day, red dot = missed commitment, tap day = tasks done + workouts), `WeekCompare` (this vs last week bars), `FitnessSection` (week ring vs goal, recent workouts, 4 metric cards with 30-day sparklines, WhatsApp nudge).
- Charts are hand-drawn (`fitness/charts.tsx`: `Sparkline`, `GroupedBars`; react-native-svg + Reanimated). No chart dependency.
- Sheets (registered in `app/_layout.tsx`): `/progress/log-workout`, `/progress/log-metric?metric=`, `/progress/goals`. All write through `useFitness()` (`source:'app'`).
- **Firestore rules gap (2026-11-05):** the LIVE project rejects `fitness/*` and `fitnessGoals/*` writes (403 over REST) although `firestore.rules` on main allows them: deploy the rules before the Log workout / metric / goals sheets can work.
- Dev check on web: Metro shares its cache across worktrees (junctioned node_modules) and can serve another worktree's `app/`; run with a private `TEMP`/`TMP` dir and `--clear`. Deep-linking straight to a sheet URL redirects to Today; navigate by clicking.

## Me / settings (`app/(tabs)/me.tsx` -> `src/features/settings/`, sub-pages in `app/me/`)
- `MeScreen`: profile card (photo via `/me/photo` -> Storage `profilePictures/{uid}`, name sheet `/me/name`, friend code copy), WhatsApp card, Settings group (Reminders, Notifications, Privacy and security), More (Recycle bin, Help, Report a bug, Version), Sign out (confirm sheet).
- WhatsApp: linked = `users.whatsapp.waId`; linking calls the PWA's `POST {API_BASE}/api/wa/link-code` (Bearer ID token; `waLinkCodes` is server-only) then opens `wa.me/...?text=LINK <code>`; the live profile flips the card. Disconnect = `DELETE` on the same route (`useWhatsAppLink`).
- Reminders: `users.reminderChannel` (auto/app/whatsapp/both) + `notificationSettings.deadlineMinutesBefore`. Notifications: all `notificationSettings` toggles + push state from `usePush`.
- Privacy: Face ID toggle verifies with expo-local-authentication before writing `biometricEnabled`; default visibility (everyone/private); password reset email; "Erase WhatsApp chat" (`/me/delete-data`) opens the coach with "delete my data" (the bot's `forgetMe` on main: deletes `waSessions` + unlinks; tasks/workouts/account stay); "Delete account" (`/me/delete-account`, also a row under Sign out on Me) is a two-step confirm that sends a deletion REQUEST e-mail (uid, e-mail, WhatsApp number) to `ACCOUNT_DELETION_EMAIL`, same 30-day process as the web `/delete-account` page; no mail app -> address + id with Copy. **Gap (2026-11-06):** no self-service delete backend: the `deleteUserAccount` callable is admin-only and returns 403 "Cannot delete your own account" (checked live with a throwaway account), and `firestore.rules` allow `users/{uid}` delete only for admins. It also only covers users, tasks (+ attachments), notifications, bugReports, friends arrays, betaWhitelist, profile photo: it skips `userKeys`, `fitness`, `fitnessGoals`, `presence`, `focusSessions`, `calendarEvents`/`calendarEventVisibility`/`calendarLinks`/`calendarFeeds`, `friendInvites`, `waLinks`/`waSessions`/`waSeen`/`waSchedule`, `medPlans`/`medDoses`, `vaultUploads`, `appLogins`. When a self-delete endpoint exists, call it from `delete-account.tsx` and sign out. Coach personality (`coaches` branch) is not shown: it lives on `waLinks.coach`, server-only.
- Recycle bin link: `BIN_ROUTE` in `features/settings/links.ts` (`/today/bin`; change there if Today names it differently). Bug report = PWA `bugReports` doc shape (+ optional screenshot, admin notifications).
- List kit: `features/settings/ui.tsx` (`Group`, `Row`, `SwitchRow`, `OptionRow`, animated `Switch`, `SettingsPage`; icons come from `@/ui` Icon).

## Someday (parked tasks, 2026-11-05) - mirrors the WhatsApp bot
- `task.parkedAt` (set = parked; written by `useTasks().parkTask/unparkTask` and by the bot): out of Today (`shouldShowInTodayView` copy), no reminder/focus, never nagged, hidden from friends (`useFriends` filters it out). Repeating tasks cannot be parked. Picking one up puts it on today and sets `staleNudgedAt` so the bot's stale nudge rests for a week.
- UI: Today's `⋯` menu -> **Someday** (`app/today/someday.tsx` -> `src/features/tasks/SomedaySheet.tsx`; list, *Do it today*, *Surprise me* = three small ones, same rule as the bot's `pickSomeday`); swipe-left **Someday** on a Today row; **Move to Someday / Do it today** in the task detail.
- The bot asks once a year about each parked task (Sundays, WhatsApp only); parked tasks never expire. Stale-task nudges and the Sunday review are WhatsApp-only so far: nothing to port until the owner wants an in-app version.
- Not visually checked in the simulator yet (tsc + `expo export` only): run the web recipe above and add `docs/screens/final-someday-*.png`.

## Status / known gaps (2026-11-05, after the polish + review pass)
Verified: `tsc` clean, `npm run test:crypto` 138/138, `expo export` ios + android, the whole app on web against the emulators with the repo rules (seed script above): sign-in, Today (ritual writes `focusSessions/{date}` + `lastFocusSessionDate` exactly like the PWA, with `completedTaskIds: []`), Friends, Progress, Me, deep link `/friends/add?code=` prefills and looks up.
- **Needs a device / build** (cannot be seen on web): push (permission, token write, tap routing; needs `eas init` projectId), Face ID lock, haptics, sheet detents and swipe gestures, Reduce Motion, camera/photo pickers, status bar, keyboard avoidance, OTA. Test these on the first TestFlight / Play internal build.
- **Live Firebase rules are stale** (2026-02): until `firestore.rules` is deployed, `focusSessions` writes fall back to `setFocusDate` (Today still works, no session doc), `fitness`/`fitnessGoals`/`presence`/`friendInvites` are empty or denied (Progress shows the Fitness error card, the friends ring and requests stay empty).
- Server endpoints the app calls must be deployed at `EXPO_PUBLIC_API_BASE`: `/api/app/login/*`, `/api/app/friends/invite|answer`, `/api/wa/link-code`.
- No eslint config in `native/`: `eslint-config-expo` is not a dependency here (adding it is a new devDependency, the owner's call). A one-off run with another checkout's config showed no real bugs beyond the React-Compiler style rules (set-state-in-effect, refs, immutability on Reanimated shared values: noise); the real ones were fixed.
- Turning Face ID on in Privacy locks the app at once (AppLock sees the flag flip). Acceptable, verify on device.
- Focus presence (`nudge_focus_presence_started_at`) and the Nudge throttle are per device, not per account: signing in as someone else on the same phone inherits them.
- Friends' wall-clock tasks and the "today" of a friend in another zone are shown in YOUR zone.
- Not built: drag-reorder, document attachments, Google Calendar strip, in-app QR scanning, circles, widgets, share extension.

## Calendar (Me -> Calendar, 2026-11-05)
`app/me/calendar.tsx` (container) + `src/features/settings/CalendarView.tsx` (layout, state in / callbacks out) + `useCalendar.ts` + `src/lib/calendarApi.ts`.
Talks to the web app's `POST/GET /api/app/calendar` (design and owner steps: web repo `docs/CALENDAR.md`). Google consent opens in the browser via
`Linking`, then returns on `nudge://me/calendar?connected=1`; the screen also refreshes when the app comes to the foreground. No new native module: OTA-able.
Same thing on WhatsApp: `/sync`. Added the `refresh` icon to `src/ui/Icon.tsx`.
