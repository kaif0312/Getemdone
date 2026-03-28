import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/google/refresh
 *
 * Uses a stored refresh token to silently obtain a new access token.
 * The client_secret stays server-side — never exposed to the browser.
 *
 * Body: { refreshToken: string }
 * Response: { accessToken, expiresIn }
 * Error 401: refresh token revoked — client should prompt reconnect
 */
export async function POST(req: NextRequest) {
  try {
    const { refreshToken } = await req.json();
    if (!refreshToken || typeof refreshToken !== 'string') {
      return NextResponse.json({ error: 'Missing refreshToken' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[google/refresh] Refresh failed:', err);
      // 401 signals to the client that the refresh token is revoked
      return NextResponse.json({ error: 'Refresh token revoked or invalid' }, { status: 401 });
    }

    const data = await res.json();
    return NextResponse.json({
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 3600,
    });
  } catch (e) {
    console.error('[google/refresh] Unexpected error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
