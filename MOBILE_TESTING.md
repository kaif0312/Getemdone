# Testing on Mobile Phone

## 🎯 Quick Solution: Use Production Firebase

For mobile testing, temporarily disable emulators and use production Firebase. Mobile testing uses minimal quota.

### Steps:

1. **Disable emulator in `.env.local`:**
   ```env
   # NEXT_PUBLIC_USE_EMULATOR=true
   ```

2. **Restart dev server:**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

3. **Find your computer's IP:**
   ```bash
   hostname -I
   # Or check: http://172.30.1.56:3000
   ```

4. **Access from phone:**
   - Make sure phone and computer are on **same WiFi network**
   - Open browser on phone: `http://172.30.1.56:3000`
   - Or use the IP shown in terminal: `Network: http://YOUR_IP:3000`

5. **After testing, re-enable emulator:**
   ```env
   NEXT_PUBLIC_USE_EMULATOR=true
   ```

## 🔧 Option 2: Use Tunnel (Keep Emulators)

If you want to test with emulators from mobile:

### Using ngrok (Recommended)

1. **Install ngrok:**
   ```bash
   # Linux
   wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
   tar xvzf ngrok-v3-stable-linux-amd64.tgz
   sudo mv ngrok /usr/local/bin
   
   # Or use snap
   sudo snap install ngrok
   ```

2. **Start tunnel:**
   ```bash
   ngrok http 3000
   ```

3. **Use the HTTPS URL shown:**
   ```
   Forwarding: https://abc123.ngrok.io -> http://localhost:3000
   ```
   Open this URL on your phone!

### Using localtunnel (Free, no signup)

1. **Install:**
   ```bash
   npm install -g localtunnel
   ```

2. **Start tunnel:**
   ```bash
   lt --port 3000
   ```

3. **Use the URL shown on your phone**

## ⚠️ Important Notes

- **Emulators won't work over network** - They're bound to localhost
- **For mobile testing with emulators**: Use tunnel (Option 2)
- **For quick mobile testing**: Use production Firebase (Option 1)
- **Same WiFi required** for local IP access
- **Tunnel URLs change** each time you restart

## 🎯 Recommended Workflow

1. **Development on laptop**: Use emulators (unlimited, free)
2. **Mobile testing**: Use production Firebase (minimal quota)
3. **Production deployment**: Use Vercel/Netlify (always production)
