'use strict';
/* اختبار تكامل: مباراة كود مصنّفة بين مستخدمين مسجّلين →
   لازم يوصل rating:update للطرفين والتقييم يتغيّر في القاعدة. */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const TMP = path.join(os.tmpdir(), 'amkh_rating_test_' + Date.now() + '.db');
const PORT = 43219;
const BASE = `http://127.0.0.1:${PORT}`;
const WSURL = `ws://127.0.0.1:${PORT}`;

function post(url, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        token ? { Authorization: 'Bearer ' + token } : {}) },
      res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, json: {} }); } }); });
    req.on('error', reject); req.write(data); req.end();
  });
}

function wsOpen() {
  return new Promise((resolve, reject) => {
    const w = new WebSocket(WSURL);
    w.on('open', () => resolve(w));
    w.on('error', reject);
  });
}
function next(w, type, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting ' + type)), timeout);
    const h = (raw) => { let d; try { d = JSON.parse(raw); } catch (e) { return; }
      if (!type || d.type === type) { clearTimeout(t); w.off('message', h); resolve(d); } };
    w.on('message', h);
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), AMKH_DB_PATH: TMP, AMKH_DB_VERBOSE: '0' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  srv.stderr.on('data', d => process.stderr.write('[srv:err] ' + d));

  let failed = false;
  try {
    await sleep(1200);
    // سجّل مستخدمين
    const a = await post(BASE + '/api/register', { email: 'a@t.com', password: 'pw123456', display_name: 'Alice' });
    const b = await post(BASE + '/api/register', { email: 'b@t.com', password: 'pw123456', display_name: 'Bob' });
    if (!a.json.token || !b.json.token) throw new Error('register failed: ' + JSON.stringify([a.json, b.json]));
    const tokA = a.json.token, tokB = b.json.token;

    // افتح سوكتين واعمل غرفة مصنّفة
    const wa = await wsOpen();
    const wb = await wsOpen();
    wa.send(JSON.stringify({ type: 'create', color: 'w', name: 'Alice', deviceId: 'da', rated: true, token: tokA }));
    const created = await next(wa, 'room-created');
    const code = created.code;

    wb.send(JSON.stringify({ type: 'join', code, name: 'Bob', deviceId: 'db', token: tokB }));
    await next(wa, 'start');
    const startB = await next(wb, 'start');
    if (!startB.rated) throw new Error('start not marked rated: ' + JSON.stringify(startB));
    console.log('[t] rated room started, code', code);

    // نتيجة متفق عليها: Alice (host, white) فازت
    const ruA = next(wa, 'rating:update');
    const ruB = next(wb, 'rating:update');
    wa.send(JSON.stringify({ type: 'game:over', result: 'win', reason: 'checkmate', token: tokA }));
    wb.send(JSON.stringify({ type: 'game:over', result: 'loss', reason: 'checkmate', token: tokB }));
    const rA = await ruA, rB = await ruB;
    console.log('[t] Alice update:', rA.outcome, rA.before, '→', rA.after, '(Δ' + rA.delta + ')');
    console.log('[t] Bob   update:', rB.outcome, rB.before, '→', rB.after, '(Δ' + rB.delta + ')');

    if (rA.outcome !== 'win') throw new Error('Alice should win');
    if (rB.outcome !== 'loss') throw new Error('Bob should lose');
    if (!(rA.delta > 0)) throw new Error('Alice delta should be positive');
    if (!(rB.delta < 0)) throw new Error('Bob delta should be negative');
    if (!(rA.after > 1500 && rB.after < 1500)) throw new Error('ratings not moved correctly');

    // /me بيرجّع التقييم الجديد
    const meA = await post(BASE + '/api/me', {}, tokA); // note: /me is GET; use GET below
    // GET /me
    const getMe = (tok) => new Promise((resolve, reject) => {
      const u = new URL(BASE + '/api/me');
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', headers: { Authorization: 'Bearer ' + tok } },
        res => { let s=''; res.on('data',c=>s+=c); res.on('end',()=>{try{resolve(JSON.parse(s));}catch(e){reject(e);}}); });
      req.on('error', reject); req.end();
    });
    const gm = await getMe(tokA);
    console.log('[t] GET /me Alice: rating', gm.rating, 'rd', gm.rating_rd, 'wins', gm.wins, 'prov', gm.provisional);
    if (!(gm.rating > 1500)) throw new Error('/me rating not updated');
    if (gm.wins !== 1) throw new Error('/me wins should be 1');

    // إعادة البلاغ ماتصنّفش تاني (guard)
    let doubled = false;
    const guard = next(wa, 'rating:update', 1200).then(()=>{doubled=true;}).catch(()=>{});
    wa.send(JSON.stringify({ type: 'game:over', result: 'win', reason: 'again', token: tokA }));
    wb.send(JSON.stringify({ type: 'game:over', result: 'loss', reason: 'again', token: tokB }));
    await guard;
    if (doubled) throw new Error('double-rated the same room!');
    console.log('[t] guard OK: no double rating');

    wa.close(); wb.close();
    console.log('\n✔ ALL RATING FLOW TESTS PASSED');
  } catch (e) {
    failed = true;
    console.error('\n�’ TEST FAILED:', e.message);
  } finally {
    srv.kill();
    try { fs.unlinkSync(TMP); } catch (e) {}
    process.exit(failed ? 1 : 0);
  }
})();
