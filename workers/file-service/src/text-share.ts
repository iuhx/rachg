const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export function textShareResponse(title: string, text: string, id: string): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · rachg</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#fafaf9;color:#202124}header{border-bottom:1px solid #ddd;padding-bottom:16px}h1{font-size:22px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:inherit}</style></head><body><header><p>rachg · Text share</p><h1>${escapeHtml(title)}</h1><a href="/f/${encodeURIComponent(id)}">Download TXT</a></header><pre>${escapeHtml(text)}</pre></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'X-Frame-Options': 'DENY',
    },
  });
}
