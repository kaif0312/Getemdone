# Quick Setup Guide

## Step-by-Step Setup

### 1. Install Dependencies

Due to disk space limitations, you may need to free up space before installing:

```bash
# Clear npm cache
npm cache clean --force

# Install dependencies
npm install
```

### 2. Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Enter project name: "task-accountability" (or your choice)
4. Disable Google Analytics (optional)
5. Click "Create project"

### 3. Enable Firestore

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Select "Start in production mode"
4. Choose a location (closest to your users)
5. Click "Enable"

### 4. Enable Authentication

1. Go to "Authentication" in Firebase Console
2. Click "Get started"
3. Click "Sign-in method" tab
4. Enable "Email/Password"
   - Toggle the switch to enable
   - Click "Save"
5. (Optional) Enable "Google" sign-in:
   - Click on Google
   - Toggle the switch
   - Enter project support email
   - Click "Save"

### 5. Get Firebase Configuration

1. Click the gear icon (⚙️) next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps"
4. Click the web icon (`</>`) to add a web app
5. Enter app nickname: "Task Accountability Web"
6. Check "Also set up Firebase Hosting" (optional)
7. Click "Register app"
8. Copy the configuration values

### 6. Update Environment Variables

Edit `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 7. Deploy Firestore Security Rules

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init

# When prompted:
# - Select: Firestore
# - Use an existing project
# - Select your project
# - Accept default file names
# - Don't overwrite existing files

# Deploy security rules
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 8. Create App Icons

You need to create two icon files for the PWA:

**Option A: Use an existing image**

If you have a logo/icon:
1. Resize it to 512x512px and save as `public/icon-512.png`
2. Resize it to 192x192px and save as `public/icon-192.png`

**Option B: Use a placeholder**

Create simple colored squares (temporary):
```bash
# On Linux with ImageMagick
convert -size 512x512 xc:#2563eb public/icon-512.png
convert -size 192x192 xc:#2563eb public/icon-192.png
```

Or download free icons from:
- https://www.flaticon.com/
- https://icons8.com/
- https://www.iconfinder.com/

### 9. Run the App

```bash
# Development mode
npm run dev

# Open in browser
# http://localhost:3000
```

### 10. Test the App

1. **Create an account**
   - Sign up with email/password or Google
   
2. **Add a task**
   - Type in the input field at the bottom
   - Press Enter to add
   
3. **Toggle privacy**
   - Click the eye icon before submitting
   - Blue = Shared, Gray = Private
   
4. **Add a friend**
   - Click the friends icon (👥) in header
   - Search by their email
   - Click + to add
   
5. **Test with multiple accounts**
   - Open an incognito window
   - Sign up with another account
   - Add each other as friends
   - Post tasks and see them sync in real-time!

## Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
- Check your `.env.local` file
- Ensure all Firebase config values are correct
- Restart the dev server: `npm run dev`

### "Missing or insufficient permissions"
- Deploy Firestore security rules: `firebase deploy --only firestore:rules`
- Check Firebase Console > Firestore > Rules tab

### Tasks not syncing
- Check browser console for errors
- Verify you're authenticated (should see user name in header)
- Ensure friends are properly added (check Firestore data)

### PWA not installing
- Must be served over HTTPS (Vercel/Netlify do this automatically)
- Check `public/manifest.json` exists
- Verify icons exist at `public/icon-192.png` and `public/icon-512.png`

### Disk space issues
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules
npm install

# Check disk space
df -h
```

## Next Steps

1. **Deploy to production**
   - Push code to GitHub
   - Deploy to Vercel or Netlify
   - Add environment variables in hosting dashboard

2. **Customize the app**
   - Update colors in `tailwind.config.js`
   - Change app name in `manifest.json`
   - Add your own icons

3. **Add features**
   - Implement task categories
   - Add task editing
   - Create task statistics/streaks
   - Add push notifications

## Support

If you encounter issues:
1. Check the README.md for detailed documentation
2. Review Firebase Console for errors
3. Check browser console for client-side errors
4. Verify all setup steps were completed

Happy task tracking! 🎉
