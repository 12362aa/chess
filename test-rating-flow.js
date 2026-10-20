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

/* استنى السيرفر يفتح المنفذ فعلًا. الانتظار الثابت (1200ms) كان بيفشل على
   الأجهزة اللي الـ migration فيها بياخد وقت أطول — فبنجرّب نتّصل بالتكرار. */
function waitBoot(ms){
  const net = require('net');
  const t0 = Date.now();
  const tryOnce = () => new Promise(res => {
    const s = net.connect(PORT, '127.0.0.1');
    const done = ok => { try{s.destroy();}catch(e){} res(ok); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), 800);
  });
  return (async () => {
    while (Date.now() - t0 < (ms || 30000)) {
      if (await tryOnce()) { await sleep(150); return true; }
      await sleep(250);
    }
    throw new Error('server did not start listening in time');
  })();
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
    await waitBoot();
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
    const cosReply=next(wb,'cos');wa.send(JSON.stringify({type:'cos',cos:{frame:'forged-premium'}}));if((await cosReply).cos)throw Error('Forged cosmetics relayed');
    const chatReply=next(wb,'chat');wa.send(JSON.stringify({type:'chat',text:'Fixture game message',safety:{targetId:999}}));const chat=await chatReply;if(chat.safety?.targetId!==a.json.user.id)throw Error('Game message evidence identity not authoritative');

    const rejected=next(wa,'game:rejected');
    wa.send(JSON.stringify({type:'game:over',result:'win',reason:'checkmate'}));await rejected;
    const illegal=next(wb,'move:rejected');
    wb.send(JSON.stringify({type:'move',fr:[1,4],to:[3,4]}));await illegal;
    // Play Scholar's mate; the server determines the result from the legal board.
    for(const [i,uci] of ['e2e4','e7e5','f1c4','b8c6','d1h5','g8f6'].entries()){
      const sender=i%2?wb:wa,receiver=i%2?wa:wb,relayed=next(receiver,'move');
      sender.send(JSON.stringify({type:'move',fr:[8-Number(uci[1]),'abcdefgh'.indexOf(uci[0])],to:[8-Number(uci[3]),'abcdefgh'.indexOf(uci[2])]}));await relayed;
    }
    const ruA = next(wa, 'rating:update');
    const ruB = next(wb, 'rating:update');
    wa.send(JSON.stringify({type:'move',fr:[3,7],to:[1,5]}));
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
    const checkDb=new (require('better-sqlite3'))(TMP);
    checkDb.prepare('INSERT INTO account_sanctions(user_id,scope,reason,expires_at,moderator_id,created_at) VALUES(?,?,?,?,?,?)').run(a.json.user.id,'account','Fixture restriction',Date.now()+3600000,b.json.user.id,Date.now());
    const restricted=next(wa,'safety:restricted');wa.send(JSON.stringify({type:'chat',text:'Blocked fixture'}));await restricted;
    checkDb.close();console.log('[t] existing game socket restriction enforced');

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
