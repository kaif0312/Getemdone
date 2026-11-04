// Google Drive for the file vault. Server-only.
//
// Why OAuth as the owner and not a service account: a service account has no storage quota of its own, so every upload
// into a personal Drive fails with `storageQuotaExceeded`. Files uploaded here are owned by the owner and count against
// the owner's storage.
//
// Scope is `drive.file`: the app can only see and touch files and folders it created itself.
// Env: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN (a token from a PUBLISHED OAuth app: in "Testing"
// mode Google expires refresh tokens after 7 days).

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

let cached: { token: string; exp: number } | null = null;
const folderCache = new Map<string, string>();

export function driveConfigured(): boolean {
  return !!(process.env.GDRIVE_CLIENT_ID && process.env.GDRIVE_CLIENT_SECRET && process.env.GDRIVE_REFRESH_TOKEN);
}

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GDRIVE_CLIENT_ID ?? '',
      client_secret: process.env.GDRIVE_CLIENT_SECRET ?? '',
      refresh_token: process.env.GDRIVE_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`drive token refresh failed (${res.status} ${j.error ?? ''})`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(path, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Find (or create) a folder called `name` directly under `parentId` (My Drive root when null). */
export async function ensureFolder(name: string, parentId: string | null): Promise<string> {
  const key = `${parentId ?? 'root'}/${name}`;
  const hit = folderCache.get(key);
  if (hit) return hit;
  const query = `name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false and '${parentId ?? 'root'}' in parents`;
  const found = await api(`${API}/files?${new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1' })}`);
  if (!found.ok) throw new Error(`drive folder lookup failed (${found.status})`);
  const existing = ((await found.json()) as { files?: { id: string }[] }).files?.[0]?.id;
  if (existing) { folderCache.set(key, existing); return existing; }
  const made = await api(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  if (!made.ok) throw new Error(`drive folder create failed (${made.status})`);
  const id = ((await made.json()) as { id: string }).id;
  folderCache.set(key, id);
  return id;
}

/** Create the nested folders in `path` and return the id of the last one. */
export async function ensurePath(path: string[]): Promise<string> {
  let parent: string | null = null;
  for (const name of path) parent = await ensureFolder(name, parent);
  if (!parent) throw new Error('empty folder path');
  return parent;
}

/** Upload one file into a folder (resumable session, one PUT: WhatsApp caps documents at 100 MB). */
export async function uploadFile(
  folderId: string,
  name: string,
  mimeType: string,
  data: Buffer,
): Promise<{ id: string; link: string | null }> {
  const start = await api(`${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': mimeType,
      'x-upload-content-length': String(data.length),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const loc = start.headers.get('location');
  if (!start.ok || !loc) throw new Error(`drive upload start failed (${start.status})`);
  const put = await fetch(loc, { method: 'PUT', headers: { 'content-type': mimeType, 'content-length': String(data.length) }, body: new Uint8Array(data) });
  if (!put.ok) throw new Error(`drive upload failed (${put.status})`);
  const j = (await put.json()) as { id: string; webViewLink?: string };
  return { id: j.id, link: j.webViewLink ?? null };
}
