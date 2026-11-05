// Tiny standalone HTML page for the OAuth round trip (Google redirects the browser here, there is no app UI to show).
export function calPage(title: string, html: string, status = 200, button?: { href: string; label: string }): Response {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FFF8EC;color:#1E1433;font:16px/1.5 system-ui,sans-serif}
main{max-width:420px;padding:32px 24px;text-align:center}h1{font-size:24px;margin:0 0 8px}a.b{display:inline-block;margin-top:20px;padding:12px 22px;border-radius:14px;background:#7B4FD6;color:#fff;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>${title}</h1><p>${html}</p>${button ? `<a class="b" href="${button.href}">${button.label}</a>` : ''}</main></body></html>`;
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
