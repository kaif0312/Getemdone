# Firebase Read Optimization Guide

## Understanding Firebase Reads

### When Reads Are Consumed

**Reads are ONLY consumed when:**
- ✅ App is open and active (tab is visible)
- ✅ Real-time listeners (`onSnapshot`) are active
- ✅ You perform queries (`getDoc`, `getDocs`)
- ✅ Data changes trigger listener callbacks

**Reads are NOT consumed when:**
- ❌ App is closed
- ❌ Tab is in background (if using Page Visibility API)
- ❌ Device is locked/sleeping
- ❌ App is not running

### Current Read Usage

Your app uses real-time listeners which consume reads:
1. **User data listener** - 1 read per user data change
2. **Own tasks listener** - 1 read per task change (your tasks)
3. **Friends tasks listener** - 1 read per friend task change
4. **Friend name prefetch** - 1 read per friend (one-time on load)

**Example:** If you have 10 tasks and 5 friends, initial load = ~16 reads. Each task update = 1 read.

---

## 🧪 Testing Without Consuming Quota

### Option 1: Use Firebase Emulators (RECOMMENDED)

**Emulators are FREE and don't count toward quota!**

1. **Enable Emulators:**
   ```bash
   # In .env.local
   NEXT_PUBLIC_USE_EMULATOR=true
   ```

2. **Start Emulators:**
   ```bash
   firebase emulators:start
   ```

3. **Test freely** - All reads/writes are local, no quota usage!

4. **Switch back to production:**
   ```bash
   # In .env.local
   NEXT_PUBLIC_USE_EMULATOR=false
   ```

### Option 2: Use a Separate Test Project

Create a separate Firebase project for testing:
1. Go to Firebase Console
2. Add Project → Name it "TaskManagerConnect-Test"
3. Copy config to `.env.local.test`
4. Use test project for development

---

## 🚀 Optimizations to Reduce Reads

### 1. Page Visibility API (Pause Listeners When Hidden)

Already implemented! The app pauses listeners when tab is in background.

### 2. Limit Friend Queries

Currently limited to 10 friends max:
```typescript
const maxFriends = Math.min(userData.friends.length, 10);
```

### 3. Use Incremental Updates

The app uses `docChanges()` instead of re-reading all documents:
```typescript
snapshot.docChanges().forEach((change) => {
  // Only process changed documents
});
```

### 4. Debounce State Updates

State updates are debounced to reduce re-renders and unnecessary operations.

---

## 📊 Monitoring Read Usage

### Check Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Usage and Billing** → **Usage**
4. View **Firestore Reads** chart

### Daily Limits (Free Tier)

- **50,000 reads/day**
- **20,000 writes/day**
- **20,000 deletes/day**

### Blaze Plan (Pay-as-you-go)

- **$0.06 per 100,000 reads**
- **$0.18 per 100,000 writes**
- **$0.02 per 100,000 deletes**

---

## 🛠️ Best Practices for Testing

### During Development

1. **Always use emulators:**
   ```bash
   NEXT_PUBLIC_USE_EMULATOR=true
   firebase emulators:start
   ```

2. **Close unused tabs** - Each tab has its own listeners

3. **Use incognito mode** - Prevents cached data issues

4. **Limit test data** - Don't create hundreds of test tasks

### Before Production

1. **Test with emulators first**
2. **Switch to production only for final testing**
3. **Monitor usage in Firebase Console**
4. **Set up billing alerts** (if on Blaze plan)

---

## 🔧 Quick Commands

### Switch to Emulator
```bash
# Edit .env.local
NEXT_PUBLIC_USE_EMULATOR=true

# Start emulators
firebase emulators:start

# Restart your Next.js app
npm run dev
```

### Switch to Production
```bash
# Edit .env.local
NEXT_PUBLIC_USE_EMULATOR=false

# Restart your Next.js app
npm run dev
```

### Check Current Mode
```bash
# Check .env.local
cat .env.local | grep USE_EMULATOR
```

---

## ⚠️ Common Issues

### "Quota Exceeded" Error

**Causes:**
- Too many tabs open
- Hot reload creating new listeners
- Testing with real data instead of emulators

**Solutions:**
- Use emulators for testing
- Close unused tabs
- Wait for daily reset (midnight UTC)
- Upgrade to Blaze plan

### High Read Usage

**Check:**
- How many tabs are open?
- Are you using emulators?
- How many friends/tasks do you have?
- Is the app running in background?

**Reduce:**
- Use emulators for testing
- Close unused tabs
- Limit number of friends (max 10)
- Use Page Visibility API (already implemented)

---

## 📝 Summary

**For Testing:**
- ✅ Use Firebase Emulators (`NEXT_PUBLIC_USE_EMULATOR=true`)
- ✅ Close unused tabs
- ✅ Use incognito mode

**For Production:**
- ✅ Monitor usage in Firebase Console
- ✅ Set up billing alerts
- ✅ Optimize queries (already done)
- ✅ Use incremental updates (already done)

**Reads are only consumed when app is active!** If you close the app, no reads are consumed.
