# Development Guide: Avoiding Quota Issues

## 🚨 Problem
Firebase free tier: **50,000 reads/day**
Real-time listeners can exhaust this quickly during development.

## ✅ Solutions

### 1. Use Firebase Emulator (RECOMMENDED)
Run a local Firebase instance - **UNLIMITED & FREE**

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize emulators
firebase init emulators
# Select: Firestore, Authentication

# Start emulators
firebase emulators:start
```

Then update `.env.local`:
```env
# When using emulators, add:
NEXT_PUBLIC_USE_EMULATOR=true
```

### 2. Limit Hot Reload Impact
```bash
# Instead of npm run dev, use:
npm run dev -- --turbo=false

# Or disable fast refresh temporarily
# in next.config.js:
reactStrictMode: false
```

### 3. Close Unused Browser Tabs
Each tab = separate listeners = more reads

### 4. Use Production Build Locally
```bash
npm run build
npm start
# Less frequent reloads = fewer listener recreations
```

### 5. Limit Friend Queries During Dev
In `useTasks.ts`, temporarily comment out friend queries:
```typescript
// Comment this during heavy development:
// const friendTasksQuery = query(...)
```

### 6. Check Your Usage
https://console.firebase.google.com/project/getemdone-87679/usage

### 7. Upgrade to Blaze Plan
- First 50K reads still FREE
- Then $0.06 per 100K reads
- Typical app usage: ~$1-3/month

## 📊 Expected Production Usage (per user/day)

- Login: 1 read
- Load tasks: 10-50 reads
- Real-time updates: 5-20 reads/hour
- Friend tasks: 20-100 reads

**Total: ~200-500 reads/user/day**

With 10 active users = 5,000 reads/day (well within free tier)

## 🎯 The Issue Is Development, Not Production
In production, users don't hot reload or test constantly.
