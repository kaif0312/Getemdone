# Task Accountability App

A cross-platform (iOS/Android/Web) progressive web app (PWA) for sharing daily tasks with friends. Built with Next.js, Firebase, and Tailwind CSS.

## Features

- ✅ **Ultra-Low Friction Task Entry** - Single text input, press Enter to add
- 🔒 **Privacy Controls** - Toggle tasks between shared and private
- ⚡ **Real-time Sync** - Tasks appear instantly for all connected friends
- 📱 **Mobile-First Design** - PWA capabilities, installable on all devices
- 👥 **Friend System** - Add friends by email to see their public tasks
- 🎨 **Modern UI** - Beautiful, touch-optimized interface

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase account (free tier is sufficient)

### Installation

1. **Clone the repository**
   ```bash
   cd TaskManagerConnect
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase**

   a. Go to [Firebase Console](https://console.firebase.google.com/)
   
   b. Create a new project or use an existing one
   
   c. Enable Firestore Database:
      - Go to Firestore Database
      - Click "Create database"
      - Start in production mode
      - Choose your location
   
   d. Enable Authentication:
      - Go to Authentication
      - Click "Get started"
      - Enable "Email/Password" sign-in method
      - (Optional) Enable "Google" sign-in method
   
   e. Get your Firebase config:
      - Go to Project Settings (gear icon)
      - Scroll to "Your apps" section
      - Click the web icon (</>)
      - Copy your config values

4. **Configure environment variables**

   Update the `.env.local` file with your Firebase credentials:

   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

5. **Deploy Firestore Security Rules**

   Install Firebase CLI if you haven't:
   ```bash
   npm install -g firebase-tools
   ```

   Login to Firebase:
   ```bash
   firebase login
   ```

   Initialize Firebase in your project:
   ```bash
   firebase init
   ```
   - Select Firestore
   - Use existing project
   - Accept default files (firestore.rules, firestore.indexes.json)

   Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
TaskManagerConnect/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout with AuthProvider
│   ├── page.tsx           # Main app page
│   ├── register-sw.tsx    # Service worker registration
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── AuthModal.tsx      # Authentication UI
│   ├── TaskInput.tsx      # Task input with privacy toggle
│   ├── TaskItem.tsx       # Individual task display
│   └── FriendsModal.tsx   # Friend management UI
├── contexts/              # React contexts
│   └── AuthContext.tsx    # Authentication context
├── hooks/                 # Custom React hooks
│   ├── useTasks.ts        # Task management hook
│   └── useFriends.ts      # Friend management hook
├── lib/                   # Utilities and configs
│   ├── firebase.ts        # Firebase initialization
│   └── types.ts           # TypeScript types
├── public/                # Static assets
│   ├── manifest.json      # PWA manifest
│   ├── sw.js             # Service worker
│   ├── icon-192.png      # App icon (192x192)
│   └── icon-512.png      # App icon (512x512)
├── firestore.rules        # Firestore security rules
├── firestore.indexes.json # Firestore indexes
├── firebase.json          # Firebase configuration
└── .env.local            # Environment variables
```

## Usage

### Creating Tasks

1. Type your task in the input field at the bottom
2. Click the eye icon to toggle privacy:
   - 👁️ **Shared** (blue) - Friends can see this task
   - 🙈 **Private** (gray) - Only you can see this task
3. Press Enter or click the send button

### Managing Friends

1. Click the friends icon (👥) in the header
2. Enter a friend's email address
3. Click "Search" to find them
4. Click the + button to add them as a friend
5. Both users will automatically be added to each other's friend lists

### Viewing Tasks

- **Your tasks**: All your tasks (private + shared) appear in the feed
- **Friends' tasks**: Only their shared tasks appear in the feed
- **Real-time updates**: Tasks appear instantly without refreshing

### Completing Tasks

- Click the checkbox next to your tasks to mark them complete
- Completed tasks show a checkmark and timestamp
- You can only complete your own tasks

## PWA Installation

### iOS (Safari)

1. Open the app in Safari
2. Tap the Share button
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

### Android (Chrome)

1. Open the app in Chrome
2. Tap the three-dot menu
3. Tap "Install app" or "Add to Home Screen"

### Desktop (Chrome/Edge)

1. Look for the install icon in the address bar
2. Click it and confirm installation

## Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your repository
4. Add environment variables from `.env.local`
5. Deploy!

### Deploy to Netlify

1. Push your code to GitHub
2. Go to [Netlify](https://netlify.com)
3. Import your repository
4. Build command: `npm run build`
5. Publish directory: `out`
6. Add environment variables
7. Deploy!

## Firebase Security

The app includes comprehensive Firestore security rules that ensure:

- Users can only create/update/delete their own tasks
- Users can only read their own private tasks
- Users can read public tasks from friends
- Task data is validated on the server side
- Users can manage their own friend lists

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Firebase (Firestore + Authentication)
- **Icons**: React Icons
- **PWA**: Service Worker, Web App Manifest

## Development Tips

### Testing Locally

- Open multiple browser windows with different user accounts
- Add each other as friends
- Test task visibility and real-time sync

### Debugging

- Check browser console for errors
- Use Firebase Console to view Firestore data
- Check Network tab for failed requests

### Common Issues

**"No space left on device"**
- Free up disk space
- Clear npm cache: `npm cache clean --force`

**Firebase permission errors**
- Ensure security rules are deployed
- Check that users are authenticated
- Verify friend relationships in Firestore

**PWA not installing**
- Ensure app is served over HTTPS
- Check manifest.json is accessible
- Verify service worker is registered

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
