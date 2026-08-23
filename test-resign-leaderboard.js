'use strict';
/* اختبار تكامل مركّز على شكاوى المستخدم:
   1) الفوز بالانسحاب (الخصم ينسحب) لازم يرفع تقييم الفائز في مباراة مصنّفة.
   2) لوحة الصدارة (GET /api/leaderboard) لازم تُرجع اللاعبين بعد مباراة مصنّفة.
   3) المباراة الودّية (rated=false) ما تغيّرش التقييم — تأكيد إن 1500 الثابت
      سببه إنها ودّية، مش عطل.
   يُشغّل بسيرفر مؤقّت على قاعدة بيانات مؤقتة (AMKH_DB_PATH). */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const TMP = path.join(os.tmpdir(), 'amkh_resign_test_' + Date.now() + '.db');
const PORT = 43227;
const BASE = `http://127.0.0.1:${PORT}`;
const WSURL = `ws://127.0.0.1:${PORT}`;

function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + urlPath);
    const headers = {};
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, json: {} }); } }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const post = (p, b, t) => req('POST', p, b, t);
const get = (p, t) => req('GET', p, null, t);

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
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitHealth() {
  for (let i = 0; i < 50; i++) {
    try { const h = await get('/api/health'); if (h.json && h.json.status === 'ok') return true; } catch (e) {}
    await sleep(200);
  }
  throw new Error('server did not become healthy');
}

/* يبدأ غرفة كود بين مستخدمين ويرجّع {wa, wb, code}. rated حسب الوسيط. */
async function startRoom(tokA, tokB, rated) {
  const wa = await wsOpen();
  const wb = await wsOpen();
  wa.send(JSON.stringify({ type: 'create', color: 'w', name: 'A', deviceId: 'da', rated: !!rated, token: tokA }));
  const created = await next(wa, 'room-created');
  const code = created.code;
  wb.send(JSON.stringify({ type: 'join', code, name: 'B', deviceId: 'db', token: tokB }));
  await next(wa, 'start');
  const startB = await next(wb, 'start');
  return { wa, wb, code, startRated: !!startB.rated };
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), AMKH_DB_PATH: TMP, AMKH_DB_VERBOSE: '0' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  srv.stderr.on('data', d => process.stderr.write('[srv:err] ' + d));

  let failed = false;
  try {
    await waitHealth();
    console.log('[t] server healthy');

    const a = await post('/api/register', { email: 'a@t.com', password: 'pw123456', display_name: 'Alice' });
    const b = await post('/api/register', { email: 'b@t.com', password: 'pw123456', display_name: 'Bob' });
    if (!a.json.token || !b.json.token) throw new Error('register failed');
    const tokA = a.json.token, tokB = b.json.token;

    /* ── 1) فوز بالانسحاب في مباراة مصنّفة ── */
    {
      const { wa, wb, startRated } = await startRoom(tokA, tokB, true);
      if (!startRated) throw new Error('rated room not marked rated on start');
      const ruA = next(wa, 'rating:update');
      const ruB = next(wb, 'rating:update');
      // Bob (الضيف) ينسحب → Alice (المضيف) تفوز
      wb.send(JSON.stringify({ type: 'resign', token: tokB }));
      const rA = await ruA, rB = await ruB;
      console.log('[t] resign → Alice', rA.outcome, rA.before, '→', rA.after, '(Δ' + rA.delta + ') prov=' + rA.provisional);
      console.log('[t] resign → Bob  ', rB.outcome, rB.before, '→', rB.after, '(Δ' + rB.delta + ')');
      if (rA.outcome !== 'win') throw new Error('winner-by-resign should be win');
      if (!(rA.delta > 0)) throw new Error('winner delta should be > 0 after resign');
      if (!(rB.delta < 0)) throw new Error('resigner delta should be < 0');
      if (!(rA.after > 1500)) throw new Error('winner rating should exceed 1500');
      if (rA.provisional !== true) throw new Error('rating should be provisional (؟) after first game');
      wa.close(); wb.close();
      console.log('[t] ✔ resign-win raises rating; provisional flag set (يفسّر علامة ؟)');
    }

    /* ── 2) لوحة الصدارة تُرجع اللاعبين بعد المباراة المصنّفة ── */
    {
      const lb = await get('/api/leaderboard?limit=100');
      if (lb.status !== 200) throw new Error('leaderboard HTTP ' + lb.status);
      const players = (lb.json && lb.json.players) || [];
      console.log('[t] leaderboard players:', players.map(p => `${p.rank}. ${p.name} ${p.rating}${p.provisional ? '؟' : ''}`).join(' | '));
      if (players.length !== 2) throw new Error('leaderboard should list exactly the 2 rated players, got ' + players.length);
      const names = players.map(p => p.name).sort();
      if (names[0] !== 'Alice' || names[1] !== 'Bob') throw new Error('leaderboard names wrong: ' + names);
      if (players[0].rank !== 1 || players[1].rank !== 2) throw new Error('ranks not 1,2');
      // الأعلى تقييمًا (Alice) لازم تكون الأولى
      if (players[0].name !== 'Alice') throw new Error('Alice (winner) should rank first');
      console.log('[t] ✔ leaderboard works end-to-end');
    }

    /* ── 3) المباراة الودّية ما تغيّرش التقييم ── */
    {
      const meBefore = (await get('/api/me', tokA)).json;
      const { wa, wb, startRated } = await startRoom(tokA, tokB, false);
      if (startRated) throw new Error('casual room wrongly marked rated');
      let rated = false;
      const guard = next(wa, 'rating:update', 1200).then(() => { rated = true; }).catch(() => {});
      wb.send(JSON.stringify({ type: 'resign', token: tokB }));
      await guard;
      if (rated) throw new Error('casual game must NOT change rating');
      const meAfter = (await get('/api/me', tokA)).json;
      if (meAfter.rating !== meBefore.rating) throw new Error('casual game changed rating');
      wa.close(); wb.close();
      console.log('[t] ✔ casual game leaves rating unchanged (يفسّر إن 1500 سببها إنها ودّية)');
    }

    console.log('\n✔ ALL RESIGN + LEADERBOARD TESTS PASSED');
  } catch (e) {
    failed = true;
    console.error('\n✗ TEST FAILED:', e.message);
  } finally {
    srv.kill();
    try { fs.unlinkSync(TMP); } catch (e) {}
    process.exit(failed ? 1 : 0);
  }
})();
