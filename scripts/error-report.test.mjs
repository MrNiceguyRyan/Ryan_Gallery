// A page's own error report (src/lib/errorReport.ts, worker/index.ts): the
// head script sends at most five reports a page load, each error once, only
// on the site's own hosts, nothing that names the reader; the worker writes
// one clipped line to its log and serves every other request from the build.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { errorReportScript, ERROR_REPORT_MAX, ERROR_REPORT_PATH } from '../src/lib/errorReport.ts';
import worker, { reportLine, MAX_REPORT_BYTES } from '../worker/index.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function page(hostname) {
  const listeners = {};
  const beacons = [];
  const window = {
    location: { hostname, pathname: '/works/miami/', search: '?secret=1' },
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    navigator: { userAgent: 'Mozilla/5.0 (iPhone)', sendBeacon: (url, body) => (beacons.push([url, JSON.parse(body)]), true) },
    document: { documentElement: { getAttribute: () => 'zh' } },
    addEventListener: (type, fn) => ((listeners[type] ||= []).push(fn)),
    fetch: () => Promise.resolve(),
    Date,
    JSON,
    String,
  };
  window.window = window;
  vm.createContext(window);
  vm.runInContext(errorReportScript('2026-10-09 10:00'), window);
  const fire = (type, event) => (listeners[type] || []).forEach((fn) => fn(event));
  return { window, beacons, fire, listeners };
}

test('the head script: only the site\'s hosts, each error once, at most five, no query', () => {
  const local = page('127.0.0.1');
  assert.equal(local.listeners.error, undefined, 'a local build sends nothing');
  const live = page('ryanxugallery.com');
  live.fire('error', { message: 'boom', filename: 'https://ryanxugallery.com/_astro/a.js', lineno: 3, colno: 9, error: { stack: 'Error: boom\n at x' } });
  live.fire('error', { message: 'boom', filename: 'https://ryanxugallery.com/_astro/a.js', lineno: 3, colno: 9 });
  assert.equal(live.beacons.length, 1, 'the same error once');
  const [url, body] = live.beacons[0];
  assert.equal(url, ERROR_REPORT_PATH);
  assert.equal(body.msg, 'boom');
  assert.equal(body.at, 'a.js:3:9');
  assert.equal(body.page, '/works/miami/', 'the path only, never the query');
  assert.equal(body.lang, 'zh');
  assert.equal(body.build, '2026-10-09 10:00');
  assert.deepEqual(Object.keys(body).sort(), ['at', 'build', 'dpr', 'lang', 'msg', 'page', 'stack', 't', 'ua', 'vh', 'vw']);
  live.fire('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 });
  live.fire('error', { target: {}, message: '' });
  assert.equal(live.beacons.length, 1, 'a foreign script\'s or a resource\'s error is not sent');
  for (let i = 0; i < 10; i += 1) live.fire('unhandledrejection', { reason: { message: `r${i}` } });
  assert.equal(live.beacons.length, ERROR_REPORT_MAX, 'at most five a page load');
  const preview = page('preview.ryanxugallery.com');
  preview.fire('error', { message: 'p', filename: '', lineno: 1, colno: 1 });
  assert.equal(preview.beacons.length, 1, 'the preview host too');
  assert.equal(page('ryanxugallery.com.evil.example').listeners.error, undefined);
});

test('the worker: one clipped line per report; everything else is the build\'s own file', async () => {
  assert.equal(reportLine('not json'), null);
  assert.equal(reportLine('[1]'), null);
  assert.equal(reportLine('{"at":"x"}'), null, 'no message, no line');
  const line = JSON.parse(reportLine(JSON.stringify({ msg: 'x'.repeat(900), page: '/', ua: 'u', vw: 390, ip: '1.2.3.4', cookie: 'c' })));
  assert.equal(line.kind, 'client-error');
  assert.equal(line.msg.length, 300);
  assert.equal(line.ip, undefined, 'only the fields it names');
  assert.equal(line.cookie, undefined);
  assert.ok(MAX_REPORT_BYTES <= 8192);
  const logged = [];
  const log = console.log;
  console.log = (s) => logged.push(s);
  const assets = { fetch: async (req) => new Response(`asset ${new URL(req.url).pathname}`) };
  try {
    const ok = await worker.fetch(new Request('https://ryanxugallery.com/api/client-error', { method: 'POST', body: JSON.stringify({ msg: 'boom' }) }), { ASSETS: assets });
    assert.equal(ok.status, 204);
    assert.equal(logged.length, 1);
    assert.equal((await worker.fetch(new Request('https://ryanxugallery.com/api/client-error'), { ASSETS: assets })).status, 405);
    assert.equal((await worker.fetch(new Request('https://ryanxugallery.com/api/other'), { ASSETS: assets })).status, 404);
    assert.equal(await (await worker.fetch(new Request('https://ryanxugallery.com/about/'), { ASSETS: assets })).text(), 'asset /about/');
  } finally {
    console.log = log;
  }
});

test('wiring: first in every page\'s head; only /api/* runs the worker; invocation logs off', () => {
  const layout = source('src/layouts/Layout.astro');
  const head = layout.slice(layout.indexOf('<head>'));
  assert.ok(head.indexOf('errorReportScript(buildStamp)') < head.indexOf('langHeadScript()'), 'before the other head scripts');
  const config = source('wrangler.jsonc');
  assert.match(config, /"main": "worker\/index\.ts"/);
  assert.equal((config.match(/"run_worker_first": \["\/api\/\*"\]/g) || []).length, 2, 'production and preview');
  assert.equal((config.match(/"logs": \{ "invocation_logs": false \}/g) || []).length, 2);
  assert.equal((config.match(/"binding": "ASSETS"/g) || []).length, 2);
});
