# ⚡ Quick Start Guide

Get your Task Accountability App running in 5 minutes!

## Prerequisites Check

```bash
# Check Node.js (need 18+)
node --version

# Check npm
npm --version

# Should see: v18+ and npm 9+
```

## 🚀 5-Minute Setup

### Step 1: Install Dependencies (1 min)

```bash
npm install
```

If disk space issues:
```bash
npm cache clean --force
npm install
```

### Step 2: Create Firebase Project (2 min)

1. Visit: https://console.firebase.google.com/
2. Click "Add project" → Name it → Create
3. Go to "Firestore Database" → "Create database" → Production mode → Enable
4. Go to "Authentication" → "Get started" → Enable "Email/Password"

### Step 3: Get Firebase Config (1 min)

1. Click ⚙️ (Settings) → "Project settings"
2. Scroll to "Your apps" → Click `</>` (Web)
3. Register app → Copy config values
4. Update `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc123
```

### Step 4: Deploy Security Rules (1 min)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (select Firestore, use existing project)
firebase init

# Deploy rules
npm run firebase:deploy
```

### Step 5: Run the App! (30 sec)

```bash
npm run dev
```

Open http://localhost:3000 🎉

## 🧪 Test It Out

1. **Sign up** with email/password
2. **Add a task** - type and press Enter
3. **Toggle privacy** - click the eye icon
4. **Open incognito** - create another account
5. **Add as friends** - use each other's emails
6. **Watch real-time sync** - add tasks, see them appear instantly!

## 🎯 Next Steps

- [ ] Customize colors in `tailwind.config.js`
- [ ] Generate proper app icons (run `npm run icons:help`)
- [ ] Deploy to Vercel (see `DEPLOYMENT.md`)
- [ ] Invite friends to use your app!

## ⚠️ Common Issues

### "Permission denied" in Firestore
```bash
npm run firebase:rules
```

### App won't start
```bash
rm -rf .next node_modules
npm install
npm run dev
```

### Firebase config errors
- Check `.env.local` values are correct
- Restart dev server: `Ctrl+C` then `npm run dev`

## 📚 Documentation

- **Full Setup**: `SETUP.md`
- **Deployment**: `DEPLOYMENT.md`
- **Features**: `FEATURES.md`
- **Main Docs**: `README.md`

## 🆘 Need Help?

1. Check the error message in browser console
2. Review Firebase Console for issues
3. Verify all setup steps completed
4. Check documentation files above

## ✅ Verification Checklist

- [ ] Dependencies installed
- [ ] Firebase project created
- [ ] Firestore enabled
- [ ] Authentication enabled
- [ ] `.env.local` configured
- [ ] Security rules deployed
- [ ] App runs on localhost
- [ ] Can create account
- [ ] Can add tasks
- [ ] Can toggle privacy

If all checked, you're ready to go! 🚀

---

**Quick Commands Reference:**

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run start           # Start production server

# Firebase
npm run firebase:deploy # Deploy rules & indexes
npm run firebase:rules  # Deploy only rules

# Utils
npm run icons:help      # Icon generation guide
```

Enjoy building with Task Accountability! 🎉
