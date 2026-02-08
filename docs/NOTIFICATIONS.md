# 🔔 Smart Notification System

A sleek, non-intrusive notification system to help you and your friends stay committed to your goals.

## Features Implemented

### 1. **Deadline Reminders** ⏰
- Get notified before tasks are due
- Customizable reminder time (15 min to 1 day before)
- Both browser push notifications and in-app toasts
- Only schedules reminders within the next 24 hours for efficiency

### 2. **Noon Check-In** ☀️
- Daily reminder at 12 PM
- If no tasks completed: motivational reminder
- If tasks completed: celebration message
- Helps maintain daily momentum

### 3. **Commitment Reminders** 💪
- Morning reminder (9 AM) for committed tasks
- Evening reminder (6 PM) for committed tasks
- Lists all your committed tasks
- Keeps you accountable to your commitments

### 4. **Friend Completions** 🎊
- Real-time notifications when friends complete tasks
- Celebrates their progress
- Builds accountability and motivation through community
- Only shows for non-private tasks

### 5. **Sleek UI Components**
- **Toast Notifications**: Modern, animated, non-intrusive toasts in top-right corner
- **Progress Bar**: Visual countdown showing time remaining for each notification
- **Color-Coded Icons**: Different colors for different notification types
- **Auto-Dismiss**: Automatically disappears after duration (5-10 seconds)
- **Manual Dismiss**: Click X to close anytime

### 6. **User Preferences**
- **Master Toggle**: Enable/disable all notifications
- **Individual Controls**: Toggle each notification type separately
- **Reminder Timing**: Customize when you get deadline reminders
- **Sound & Vibration**: Optional feedback (vibration enabled by default, sound disabled for subtlety)
- **Permission Management**: Easy permission request flow

## How to Use

### Enable Notifications
1. Click the **🔔 bell icon** in the header
2. Click **"Enable Notifications"** in the yellow banner
3. Allow notifications when your browser prompts
4. Configure your preferences
5. Click **"Save Settings"**

### Notification Settings
- **Bell icon** in header shows a red dot if permissions not granted
- Access anytime by clicking the bell icon
- All settings are saved to your profile automatically
- Works across all your devices

## Technical Details

### Browser Notifications
- Uses Web Notifications API
- Requires user permission (one-time)
- Works even when app is in background
- Service Worker integration for PWA support

### In-App Toasts
- Always visible when app is open
- No permissions required
- Beautiful animations and transitions
- Color-coded by type:
  - 🟠 Orange: Deadline reminders
  - 🔵 Blue: Noon check-in
  - 🔴 Red: Commitment reminders
  - 🟢 Green: Friend completions

### Smart Scheduling
- Deadline reminders scheduled dynamically based on task due dates
- Noon check-in scheduled once per day
- Commitment reminders scheduled for 9 AM and 6 PM
- Friend notifications trigger in real-time on task completion
- All timers cleaned up properly to prevent memory leaks

## Privacy & Permissions

- **No data collection**: Notifications are sent locally, no external servers
- **User control**: All notification types can be individually disabled
- **Browser permission**: Required for push notifications only
- **Works offline**: In-app toasts work without internet
- **Secure**: All notification settings stored in your Firebase profile

## Future Enhancements (Optional)

- [ ] Custom notification sounds
- [ ] Snooze functionality
- [ ] Notification history
- [ ] Custom reminder times for specific tasks
- [ ] Weekly summary notifications
- [ ] Streak milestone notifications
- [ ] Friend streak comparisons
- [ ] Notification quiet hours

## Files Created/Modified

### New Files
- `hooks/useNotifications.ts` - Core notification logic and scheduling
- `components/NotificationSettings.tsx` - Settings modal UI
- `components/NotificationToast.tsx` - Toast notification component
- `docs/NOTIFICATIONS.md` - This file

### Modified Files
- `app/page.tsx` - Integrated notification system
- `app/globals.css` - Added progress bar animation
- `lib/types.ts` - Added NotificationSettings interface

## Testing Checklist

- [x] Browser notification permission request
- [x] Deadline reminder scheduling
- [x] Noon check-in at 12 PM
- [x] Morning commitment reminder at 9 AM
- [x] Evening commitment reminder at 6 PM
- [x] Friend completion detection
- [x] Toast animations and auto-dismiss
- [x] Settings save to Firestore
- [x] Settings persistence across sessions
- [x] Vibration feedback (mobile)
- [x] Dark mode compatibility
- [x] Responsive design

---

**Built with**: React, TypeScript, Firebase, Web Notifications API, Service Workers
**Status**: ✅ Complete and Ready for Production
