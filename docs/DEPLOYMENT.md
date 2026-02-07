# Deployment Guide

This guide covers deploying your Task Accountability App to production.

## Prerequisites

- Git repository (GitHub, GitLab, etc.)
- Firebase project configured
- Environment variables ready

## Option 1: Vercel (Recommended)

Vercel offers the best Next.js deployment experience with zero configuration.

### Steps

1. **Push code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/task-accountability.git
   git push -u origin main
   ```

2. **Deploy to Vercel**
   - Go to https://vercel.com
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

3. **Add environment variables**
   - In Vercel dashboard, go to Settings > Environment Variables
   - Add all variables from `.env.local`:
     ```
     NEXT_PUBLIC_FIREBASE_API_KEY
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
     NEXT_PUBLIC_FIREBASE_PROJECT_ID
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
     NEXT_PUBLIC_FIREBASE_APP_ID
     ```

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app is live! 🎉

5. **Update Firebase Auth domain**
   - Go to Firebase Console > Authentication > Settings
   - Add your Vercel domain to "Authorized domains"
   - Example: `task-accountability.vercel.app`

### Continuous Deployment

Every push to `main` branch will automatically deploy to production!

## Option 2: Netlify

### Steps

1. **Build configuration**
   
   Create `netlify.toml`:
   ```toml
   [build]
     command = "npm run build"
     publish = ".next"

   [[plugins]]
     package = "@netlify/plugin-nextjs"
   ```

2. **Deploy to Netlify**
   - Go to https://netlify.com
   - Click "Add new site" > "Import an existing project"
   - Connect your Git repository
   - Configure build settings:
     - Build command: `npm run build`
     - Publish directory: `.next`

3. **Add environment variables**
   - Go to Site settings > Environment variables
   - Add all Firebase environment variables

4. **Deploy**
   - Click "Deploy site"
   - Wait for build to complete

5. **Update Firebase Auth domain**
   - Add your Netlify domain to Firebase authorized domains

## Option 3: Firebase Hosting

Host directly on Firebase for seamless integration.

### Steps

1. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**
   ```bash
   firebase login
   ```

3. **Initialize Firebase Hosting**
   ```bash
   firebase init hosting
   ```
   
   Configuration:
   - Public directory: `out`
   - Single-page app: Yes
   - GitHub integration: Optional

4. **Update `next.config.ts`**
   ```typescript
   const nextConfig: NextConfig = {
     output: 'export',
     images: {
       unoptimized: true,
     },
   };
   ```

5. **Build and deploy**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

6. **Your app is live!**
   - URL: `https://your-project-id.web.app`

## Post-Deployment Checklist

- [ ] Test authentication (email/password and Google)
- [ ] Test task creation and real-time sync
- [ ] Test friend system
- [ ] Test PWA installation on mobile device
- [ ] Verify service worker is registered
- [ ] Test offline functionality
- [ ] Check Firestore security rules are active
- [ ] Monitor Firebase usage in console
- [ ] Set up Firebase alerts for quota limits

## Custom Domain

### Vercel
1. Go to Project Settings > Domains
2. Add your custom domain
3. Update DNS records as instructed
4. Vercel will auto-provision SSL

### Netlify
1. Go to Site settings > Domain management
2. Add custom domain
3. Update DNS records
4. SSL is automatic

### Firebase Hosting
1. Go to Firebase Console > Hosting
2. Click "Add custom domain"
3. Follow verification steps
4. Update DNS records
5. SSL provisioned automatically

## Environment-Specific Configuration

### Production vs Development

You may want different Firebase projects for dev and prod:

**Development** (`.env.local`):
```env
NEXT_PUBLIC_FIREBASE_PROJECT_ID=task-app-dev
# ... other dev credentials
```

**Production** (Vercel/Netlify environment variables):
```env
NEXT_PUBLIC_FIREBASE_PROJECT_ID=task-app-prod
# ... other prod credentials
```

## Monitoring & Analytics

### Firebase Console

Monitor your app:
- Authentication: Track user signups
- Firestore: Monitor database usage
- Performance: Check query performance

### Vercel Analytics

Enable in Vercel dashboard:
- Real-time visitor tracking
- Page performance metrics
- Core Web Vitals

### Error Tracking

Consider adding error tracking:
- Sentry: https://sentry.io
- LogRocket: https://logrocket.com

## Scaling Considerations

### Firebase Limits (Free Tier)

**Firestore:**
- 50K reads/day
- 20K writes/day
- 20K deletes/day
- 1 GB storage

**Authentication:**
- Unlimited users
- 10K phone authentications/month

### When to Upgrade

Upgrade to Blaze (pay-as-you-go) when:
- You exceed free tier limits
- You need Cloud Functions
- You need more than 1 GB storage

### Cost Optimization

1. **Reduce reads**
   - Implement pagination
   - Cache data on client
   - Use query limits

2. **Reduce writes**
   - Batch operations
   - Debounce frequent updates
   - Use client-side state

3. **Monitor usage**
   - Set up Firebase budget alerts
   - Review Firebase usage dashboard

## Security Best Practices

1. **Never commit `.env.local`**
   - Already in `.gitignore`
   - Store secrets in deployment platform

2. **Rotate API keys regularly**
   - Firebase Console > Project Settings
   - Regenerate and update in deployment

3. **Monitor authentication**
   - Check for suspicious activity
   - Set up alerts for unusual patterns

4. **Review Firestore rules**
   - Audit security rules regularly
   - Test with Firebase Rules Playground

## Troubleshooting Deployment

### Build Errors

**"Module not found"**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

**TypeScript errors**
- Fix all type errors locally first
- Run `npm run build` locally before deploying

### Runtime Errors

**Firebase initialization failed**
- Check environment variables are set
- Verify Firebase config is correct
- Check browser console for specific errors

**Authentication errors**
- Verify domain is in Firebase authorized domains
- Check Firebase Auth is enabled
- Verify API keys are correct

**Firestore permission denied**
- Deploy security rules: `npm run firebase:deploy`
- Check rules in Firebase Console
- Verify user is authenticated

## Rollback Strategy

### Vercel
- Go to Deployments
- Click on previous deployment
- Click "Promote to Production"

### Netlify
- Go to Deploys
- Click on previous deploy
- Click "Publish deploy"

### Firebase
```bash
firebase hosting:rollback
```

## Support

If you need help:
1. Check deployment platform docs
2. Review Firebase Console errors
3. Check browser console logs
4. Review this guide thoroughly

Happy deploying! 🚀
