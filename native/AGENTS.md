# Nudge native app (`native/`): agent notes

Expo SDK 57 / React Native 0.86 / expo-router 57 / React 19.2, TypeScript strict. Scope + spec: `../docs/NATIVE_APP_PLAN.md`.
Foundation (wave 1) is done: theme, UI kit, data hooks, crypto, auth, shell. Wave 2 builds the feature screens on top.

## Commands (run in `native/`)
- `npm install` (`.npmrc` has `legacy-peer-deps=true`) · `npx expo start` · `npx expo start --web` (browser check, 390x844).
- `npx tsc --noEmit` (must be clean) · `npm run test:crypto` (web/native crypto parity, 138 checks, must pass) ·
  `npx expo export --platform ios|android` (bundle check; `dist/` is git-ignored).
- UI showcase: **`/dev/kit`** (dev only; `?scheme=light|dark`). Screenshots in `docs/screens/`.
- Do NOT run `eas init`/builds here yet (wave 3). EAS owner `kaifuten`, bundle/package `com.iskaria.nudge`, scheme `nudge`.
- Env: `native/.env` + `eas.json` hold the PUBLIC Firebase config and `EXPO_PUBLIC_API_BASE` (https://getemdone.vercel.app).
  No server secret ever goes in this app.

## Folder map
```
app/                      expo-router screens (routes only; keep thin, logic in src/features)
  _layout.tsx             providers + Stack.Protected (signed in -> tabs/sheets, signed out -> (auth))
  (auth)/                 welcome, email, whatsapp                      [done]
  (tabs)/                 today, friends, progress, me + custom TabBar  [PLACEHOLDERS: wave 2 replaces wholesale]
  add.tsx                 Add sheet (formSheet)                         [placeholder, minimally wired]
  task/[id].tsx friend/[uid].tsx inbox.tsx                              [placeholders]
  dev/kit.tsx             UI showcase
src/ui/                   the kit (import from '@/ui')
src/hooks/                data hooks (below)
src/lib/                  firebase, crypto, keyring, dates, copied PWA helpers, push, loginApi
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
`ConfettiProvider/useConfetti().fire()`, `ToastProvider/useToast().show(msg,{kind})`, `Header` (title + bell badge), `TextField`, `Icon` (stroke set; add icons in `Icon.tsx`),
`Screen` (page container with tab-bar/safe-area padding, pull to refresh), `TabBar`, `haptic.*`, `springs`, `useReduceMotion()`.
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
- `useStreak()` -> `{ streakData, current, longest, focusCurrent, focusLongest, fitnessStreak, doneToday, atRisk, loading }` (the single writer of `users.streakData`)
- `useFitness()` -> `{ days, dayMap, goals, week, workoutDates, loading, logWorkout, logMetric, undoLastWorkout, setGoals }`; `useFriendFitness(friendId)`
- `useToday()` -> `{ today, zone }` (rolls over at midnight / on foreground; zone = `users.timezone` else device)
- `usePush()` -> `{ status, askAfterFirstAction(), enable() }`: call `askAfterFirstAction()` right after the user's first meaningful action (Add does), never on launch.
  `usePushSetup()` (root) refreshes the token and routes notification taps: `data.type` task|friend|inbox -> `/task/<taskId>` | `/friend/<uid>` | `/inbox`.
- `useWhatsAppLogin()` powers `(auth)/whatsapp.tsx` (contract in `src/lib/loginApi.ts`).

## Crypto rule
`src/lib/crypto.ts` must stay byte-for-byte compatible with `utils/crypto.ts` (key = base64 of 32 raw bytes, `e1:` + base64(iv12 || ct || tag16)).
Any edit -> `npm run test:crypto`. `E2EE_ENABLED` (src/lib/config.ts) mirrors the PWA (currently **false**: plaintext writes, `e1:` reads still work). Flip only with the PWA.
Pure helpers copied from the PWA carry a header naming their source (`types.ts recurrence.ts taskFilter.ts visibility.ts streak.ts`); when the source changes, change both.
Never invent Firestore fields the PWA lacks. Timestamps are ms numbers. `expoPushTokens` is the one agreed addition (plan section 4).

## Stubbed / decisions for the owner
- `app/(tabs)/*`, `add`, `task/[id]`, `friend/[uid]`, `inbox` are placeholders for wave 2.
- WhatsApp login depends on the server agent's `/api/app/login/start|poll`; untested end to end until it ships.
- Friend invites: `friendInvites` are server-written only (rules). `useFriends` can read them and `acceptInvite` does the mutual add, but the invite doc stays `pending`; needs a server endpoint to answer/send (consent flow).
- Push: `getExpoPushTokenAsync` needs the EAS projectId (`eas init` adds `extra.eas.projectId`); until then status is `unavailable` and nothing is written. Server senders for `expoPushTokens` are the server agent's.
- Reminders: `setRemindAt` writes `remindAt/remindFor`; the 15-min cron fires them (exact-time QStash scheduling is bot-side only).
- Nudge throttle is per device (AsyncStorage), like the PWA's localStorage; the server `nudgeLimits` path is not reachable from the client.
- Friends' tasks: last 30 days only (`FRIEND_TASK_WINDOW_DAYS`) but all friends; the PWA loads all history for 10 friends.
- Whitelist: auto-add for new email users is mirrored; `isWhitelisted` is exposed but the app does NOT gate on it (WhatsApp-only accounts have no email).
- `users.timezone` is not auto-written; `useToday()` falls back to the device zone.
- Web (`expo start --web`) is for screenshots only; Firebase persistence and push differ there.

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
- Privacy: Face ID toggle verifies with expo-local-authentication before writing `biometricEnabled`; default visibility (everyone/private); password reset email; "Delete my data" only sends "Delete my data" to the coach on WhatsApp (the in-bot command is on the unmerged `privacy` branch). Coach personality (`coaches` branch) is not shown: it lives on `waLinks.coach`, server-only.
- Recycle bin link: `BIN_ROUTE` in `features/settings/links.ts` (`/today/bin`; change there if Today names it differently). Bug report = PWA `bugReports` doc shape (+ optional screenshot, admin notifications).
- List kit: `features/settings/ui.tsx` (`Group`, `Row`, `SwitchRow`, `OptionRow`, animated `Switch`, `SettingsPage`, local icons `SIcon`).
