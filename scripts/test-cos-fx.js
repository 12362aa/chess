/* اختبار بصريّ-منطقيّ لمؤثّرات التجميل (بلاغ جوجو: مؤثّرُ الكشِ مات لا يعمل
   في أيّ وضع). يفتح Edge بلا واجهة عبر CDP خامًا (ws)، يحمّل صفحةً صغيرةً
   فيها economy-client.js + screens.css، يجهّز مؤثّرًا، ثمّ يعدّ الجُسيمات.
   ويعيد الاختبار مع prefers-reduced-motion: reduce لإثباتِ أثرِه.
   node scripts/test-cos-fx.js */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

/* منفذٌ غيرُ شائعٍ تفاديًا لتصادمِ المنافذ مع أيّ أداةٍ أخرى */
const PORT = 9473;
const HTTP_PORT = 9474;
const ROOT = path.resolve(__dirname, '..');
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));
if (!EDGE) { console.error('Edge not found'); process.exit(1); }

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/screens.css">
</head><body>
<script src="/economy-client.js"></script>
<script>
  window.__ready = false;
  window.addEventListener('load', function () { window.__ready = true; });
  window.__setup = function (eq) {
    window.amkhEconomy.state = { equipped: eq };
  };
  window.__fire = function (kind) {
    if (kind === 'mate') amkhCos.mateFx(); else amkhCos.celebrate();
    var ov = document.querySelector('.cos-fx-ov');
    return {
      overlayExists: !!ov,
      children: ov ? ov.children.length : 0,
      display: ov ? getComputedStyle(ov).display : null,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      hasMateFx: typeof amkhCos.mateFx === 'function',
      equipped: JSON.stringify(amkhCos.self()),
    };
  };
<\/script></body></html>`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      const u = req.url.split('?')[0];
      if (u === '/' || u === '/index.html') {
        rq.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return rq.end(PAGE);
      }
      const f = path.join(ROOT, u.replace(/^\/+/, ''));
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rq.writeHead(404); return rq.end('x'); }
      const ct = f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'text/plain';
      rq.writeHead(200, { 'Content-Type': ct + '; charset=utf-8' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(HTTP_PORT, '127.0.0.1', () => res(srv));
  });
}

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

async function main() {
  const srv = await serve();
  const profile = path.join(os.tmpdir(), 'amkh-cosfx-' + Date.now());
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=420,900', `http://127.0.0.1:${HTTP_PORT}/`,
  ], { stdio: 'ignore' });

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    try { tabs = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (tabs.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) break; } catch (e) {}
    await sleep(300);
  }
  const tab = tabs && tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!tab) { console.error('no tab'); edge.kill(); srv.close(); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0; const waiting = new Map();
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  });
  const send = (method, params) => new Promise(res => {
    const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const evalJS = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails) };
    return r.result && r.result.result ? r.result.result.value : null;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  for (let i = 0; i < 40; i++) { if (await evalJS('window.__ready === true')) break; await sleep(200); }

  const results = {};
  // ١) الوضعُ الطبيعيّ
  await evalJS(`__setup({ mate_fx: 'fx_blackhole', celebration: 'cel_dragon' })`);
  results.normal_mate = await evalJS(`JSON.stringify(__fire('mate'))`);
  await evalJS(`document.querySelectorAll('.cos-fx-ov').forEach(function(e){e.remove()})`);
  await sleep(3000);
  results.normal_cel = await evalJS(`JSON.stringify(__fire('cel'))`);
  await evalJS(`document.querySelectorAll('.cos-fx-ov').forEach(function(e){e.remove()})`);
  await sleep(4500);

  // ٢) مع prefers-reduced-motion: reduce (إعدادُ «إزالةُ الصورِ المتحرّكة» أو موفّرُ الطاقة)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  results.reduced_mate = await evalJS(`JSON.stringify(__fire('mate'))`);

  console.log('── نتائجُ الاختبار ──');
  for (const k of Object.keys(results)) console.log(k.padEnd(14), results[k]);

  ws.close(); edge.kill(); srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
main().catch(e => { console.error(e); process.exit(1); });
