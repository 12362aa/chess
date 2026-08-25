'use strict';
/* اختبار تكامل: إشارات المكالمة الصوتية (#135) تُنقل عبر سوكت الحضور
   المُصادَق عليه فقط، ومع تحقّق الصداقة/العضوية.
   يتحقق من:
   1) call:invite بين صديقين → يوصل للطرف الآخر + call:invite-ack{delivered:true}
   2) offer/answer/ice تُنقل شفّافة مع from الصحيح
   3) غير الأصدقاء (لا صداقة) → call:error{reason:'not-allowed'}
   4) بدون presence:hello (غير مُصادق) → call:error{reason:'auth'}
   5) مكالمة الحفلة: عضوان في نفس الجروب → تُنقل؛ من برّه الجروب → not-allowed */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const TMP = path.join(os.tmpdir(), 'amkh_call_test_' + Date.now() + '.db');
const PORT = 43227;
const BASE = `http://127.0.0.1:${PORT}`;
const WSURL = `ws://127.0.0.1:${PORT}`;

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({}); } }); });
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
function next(w, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting ' + type)), timeout);
    const h = (raw) => { let d; try { d = JSON.parse(raw); } catch (e) { return; }
      if (!type || d.type === type) { clearTimeout(t); w.off('message', h); resolve(d); } };
    w.on('message', h);
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✔', label); } else { fail++; console.error('  ✗', label); } }

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), AMKH_DB_PATH: TMP, AMKH_DB_VERBOSE: '0' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', d => process.stderr.write('[srv:err] ' + d));

  try {
    await sleep(2500);
    const a = await post(BASE + '/api/register', { email: 'a@t.com', password: 'pw123456', display_name: 'Alice' });
    const b = await post(BASE + '/api/register', { email: 'b@t.com', password: 'pw123456', display_name: 'Bob' });
    const c = await post(BASE + '/api/register', { email: 'c@t.com', password: 'pw123456', display_name: 'Carl' });
    if (!a.token || !b.token || !c.token) throw new Error('register failed');
    const idA = a.user.id, idB = b.user.id, idC = c.user.id;
    const tokA = a.token, tokB = b.token, tokC = c.token;

    /* صداقة A↔B مباشرة في القاعدة (اتجاهين)، و C يفضل غريب.
       جروب G فيه A وB بس. */
    const dbx = new Database(TMP);
    const fr = dbx.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)');
    fr.run(idA, idB); fr.run(idB, idA);
    /* جروب: نحتاج جدول groups؟ نكتفي بـ group_members لأن callPeerAllowed
       بيستعلم منه فقط. */
    const gid = 900;
    dbx.prepare('INSERT OR IGNORE INTO groups (id, name, owner_id) VALUES (?, ?, ?)').run(gid, 'حفلة اختبار', idA);
    const gm = dbx.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
    gm.run(gid, idA); gm.run(gid, idB);
    dbx.close();

    /* سوكتات حضور مُصادَقة */
    const wa = await wsOpen(); wa.send(JSON.stringify({ type: 'presence:hello', token: tokA }));
    const wb = await wsOpen(); wb.send(JSON.stringify({ type: 'presence:hello', token: tokB }));
    const wc = await wsOpen(); wc.send(JSON.stringify({ type: 'presence:hello', token: tokC }));
    await sleep(400);

    console.log('\n[1] call:invite بين صديقين');
    const bInvite = next(wb, 'call:invite');
    const aAck = next(wa, 'call:invite-ack');
    wa.send(JSON.stringify({ type: 'call:invite', to: idB, callId: 'call-1', members: [idA, idB] }));
    const iv = await bInvite; const ack = await aAck;
    ok(iv.from === idA, 'Bob استلم الدعوة من Alice');
    ok(iv.callId === 'call-1', 'callId صحيح');
    ok(iv.kind === 'audio', 'kind=audio');
    ok(Array.isArray(iv.members) && iv.members.includes(idA) && iv.members.includes(idB), 'members مضبوطة');
    ok(iv.fromUser && iv.fromUser.display_name === 'Alice', 'fromUser فيه اسم الداعي');
    ok(ack.delivered === true, 'الداعي استلم ack{delivered:true}');

    console.log('\n[2] offer/answer/ice تُنقل شفّافة');
    const bOffer = next(wb, 'call:offer');
    wa.send(JSON.stringify({ type: 'call:offer', to: idB, callId: 'call-1', sdp: JSON.stringify({ type: 'offer', sdp: 'v=0...' }) }));
    const off = await bOffer;
    ok(off.from === idA && typeof off.sdp === 'string', 'offer وصل بـ sdp من Alice');
    const aAnswer = next(wa, 'call:answer');
    wb.send(JSON.stringify({ type: 'call:answer', to: idA, callId: 'call-1', sdp: JSON.stringify({ type: 'answer', sdp: 'v=0...' }) }));
    const ans = await aAnswer;
    ok(ans.from === idB && typeof ans.sdp === 'string', 'answer رجع من Bob');
    const bIce = next(wb, 'call:ice');
    wa.send(JSON.stringify({ type: 'call:ice', to: idB, callId: 'call-1', candidate: { candidate: 'x', sdpMid: '0' } }));
    const ice = await bIce;
    ok(ice.from === idA && ice.candidate && ice.candidate.candidate === 'x', 'ice candidate اتنقل');

    console.log('\n[3] غير الأصدقاء ممنوعون');
    const aErr = next(wa, 'call:error');
    let cGot = false; const cSpy = next(wc, 'call:invite', 1000).then(() => { cGot = true; }).catch(() => {});
    wa.send(JSON.stringify({ type: 'call:invite', to: idC, callId: 'call-x' }));
    const err = await aErr; await cSpy;
    ok(err.reason === 'not-allowed', 'call:error{not-allowed} للغريب');
    ok(cGot === false, 'الغريب ماوصلوش أي دعوة');

    console.log('\n[4] سوكت غير مُصادق');
    const wd = await wsOpen(); /* من غير presence:hello */
    const dErr = next(wd, 'call:error');
    wd.send(JSON.stringify({ type: 'call:invite', to: idB, callId: 'call-y' }));
    const de = await dErr;
    ok(de.reason === 'auth', 'call:error{auth} لسوكت غير مُصادق');
    wd.close();

    console.log('\n[5] مكالمة الحفلة (عضوان في نفس الجروب)');
    const bGrp = next(wb, 'call:invite');
    wa.send(JSON.stringify({ type: 'call:invite', to: idB, callId: 'g-1', group: gid, members: [idA, idB] }));
    const gi = await bGrp;
    ok(gi.group === gid && gi.from === idA, 'دعوة الحفلة وصلت لعضو الجروب');
    /* C مش عضو → ممنوع */
    const aGrpErr = next(wa, 'call:error');
    wa.send(JSON.stringify({ type: 'call:invite', to: idC, callId: 'g-2', group: gid }));
    const ge = await aGrpErr;
    ok(ge.reason === 'not-allowed', 'غير العضو ممنوع من مكالمة الحفلة');

    wa.close(); wb.close(); wc.close();
    console.log(`\n${fail === 0 ? '✔' : '✗'} النتيجة: ${pass} نجح / ${fail} فشل`);
  } catch (e) {
    fail++;
    console.error('\n✗ TEST CRASHED:', e.message);
  } finally {
    srv.kill();
    try { fs.unlinkSync(TMP); } catch (e) {}
    try { fs.unlinkSync(TMP + '-wal'); } catch (e) {}
    try { fs.unlinkSync(TMP + '-shm'); } catch (e) {}
    process.exit(fail ? 1 : 0);
  }
})();
