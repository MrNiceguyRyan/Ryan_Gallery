// ── The site's one bit of server: a page's own error report ──
// The site is static: every request is the build's own file (the assets
// binding), except /api/* — wrangler.jsonc `run_worker_first` sends only
// those here, so the pages are served exactly as before, without this code.
//
// /api/client-error takes what a page's head script (src/lib/errorReport.ts)
// sends when something throws in a reader's browser — the owner, 2026-10-06:
// 手机浏览开场动画的时候有时候会卡顿或者报错, on a phone we cannot hold — and
// writes it to the worker's log (Workers Logs: the dashboard, or `wrangler
// tail`). Only what the report itself names, each field clipped: the error's
// message, where it was thrown, its first stack lines, the page's path, the
// browser's user agent, the window's size and the language. No address, no
// cookie, no query string; invocation logs are off (wrangler.jsonc), so
// nothing about the request is kept but this line.

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/** The most of a report that is read. */
export const MAX_REPORT_BYTES = 4096;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : undefined);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined);

/** The line written to the log for a report (or null: not a report). */
export function reportLine(raw: string): string | null {
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw.slice(0, MAX_REPORT_BYTES));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    body = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const msg = text(body.msg, 300);
  if (!msg) return null;
  return JSON.stringify({
    kind: 'client-error',
    msg,
    at: text(body.at, 200),
    stack: text(body.stack, 1200),
    page: text(body.page, 120),
    lang: text(body.lang, 8),
    ua: text(body.ua, 220),
    vw: num(body.vw),
    vh: num(body.vh),
    dpr: num(body.dpr),
    t: num(body.t),
    build: text(body.build, 24),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/client-error') {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      const line = reportLine(await request.text());
      if (line) console.log(line);
      return new Response(null, { status: 204 });
    }
    if (url.pathname.startsWith('/api/')) return new Response(null, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
