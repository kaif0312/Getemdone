import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/google/callback
 *
 * Exchanges a Google OAuth authorization code for an access token + refresh token.
 * The client_secret stays server-side — never exposed to the browser.
 *
 * Body: { code: string }
 * Response: { accessToken, refreshToken, expiresIn }
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      // 'postmessage' is the special redirect_uri for GIS popup-mode code flow
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[google/callback] Token exchange failed:', err);
      // Forward the raw Google error so the client can log it for debugging
      let googleError = 'Token exchange failed';
      try {
        const parsed = JSON.parse(err);
        googleError = parsed?.error_description || parsed?.error || googleError;
      } catch { /* ignore parse failure */ }
      return NextResponse.json({ error: googleError }, { status: 400 });
    }

    const data = await res.json();
    return NextResponse.json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? 3600,
    });
  } catch (e) {
    console.error('[google/callback] Unexpected error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
