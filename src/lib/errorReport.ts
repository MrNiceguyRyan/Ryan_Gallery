// ── A page's own error report ──
// The owner, 2026-10-06: 手机浏览开场动画的时候有时候会卡顿或者报错 — on his
// phone, which we cannot hold. This head script (Layout, the first thing in
// <head>) listens for an uncaught error or a rejected promise and sends a
// short report to the site's own /api/client-error (worker/index.ts), which
// writes it to the worker's log. At most five a page load, each error once;
// only on the site's own hosts (never a local build or a preview pane); a
// script error from another origin (no message to read) is not sent. It
// sends what the error itself says and where: message, file:line:col, the
// first stack lines, the page's path (no query), the language, the user
// agent, the window's size and density, the build — nothing that names the
// reader. If anything in it fails, it fails silent: a report is never worth
// an error of its own.

export const ERROR_REPORT_PATH = '/api/client-error';
/** At most this many reports a page load. */
export const ERROR_REPORT_MAX = 5;

export function errorReportScript(buildStamp: string) {
  return (
    `(function(){try{` +
    `if(window.__rxErrors)return;window.__rxErrors=1;` +
    `if(!/(^|\\.)ryanxugallery\\.com$/.test(location.hostname))return;` +
    `var sent=0,seen={},t0=Date.now();` +
    `function send(msg,at,stack){try{` +
    `msg=String(msg||'');if(!msg||sent>=${ERROR_REPORT_MAX})return;` +
    `var key=msg+'|'+at;if(seen[key])return;seen[key]=1;sent++;` +
    `var body=JSON.stringify({msg:msg.slice(0,300),at:String(at||'').slice(0,200),` +
    `stack:String(stack||'').split('\\n').slice(0,8).join('\\n').slice(0,1200),` +
    `page:location.pathname,lang:document.documentElement.getAttribute('data-lang')||'',` +
    `ua:navigator.userAgent.slice(0,220),vw:innerWidth,vh:innerHeight,dpr:window.devicePixelRatio||1,` +
    `t:Date.now()-t0,build:${JSON.stringify(buildStamp)}});` +
    `if(navigator.sendBeacon&&navigator.sendBeacon(${JSON.stringify(ERROR_REPORT_PATH)},body))return;` +
    `fetch(${JSON.stringify(ERROR_REPORT_PATH)},{method:'POST',body:body,keepalive:true}).catch(function(){});` +
    `}catch(e){}}` +
    `addEventListener('error',function(e){` +
    `if(!e||!e.message||e.message==='Script error.')return;` +
    `send(e.message,String(e.filename||'').replace(/^.*\\//,'')+':'+e.lineno+':'+e.colno,e.error&&e.error.stack);});` +
    `addEventListener('unhandledrejection',function(e){var r=e&&e.reason;` +
    `send(r&&r.message?r.message:String(r),'promise',r&&r.stack);});` +
    `}catch(e){}})();`
  );
}
