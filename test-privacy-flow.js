'use strict';
/* اختبار تكامل للخصوصية (#91):
   • GET/POST /api/privacy يحفظ ويرجّع الإعدادات (تفضل على الحساب).
   • الإضافة المباشرة للحفلة بتتحوّل لدعوة معلّقة لو خصوصية المُضاف مابتسمحش.
   • قبول الدعوة = انضمام فعلي. */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');

const TMP = path.join(os.tmpdir(), 'amkh_privacy_test_' + Date.now() + '.db');
const PORT = 43227;
const BASE = `http://127.0.0.1:${PORT}/api`;

function req(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(url);
    const headers = Object.assign(
      token ? { Authorization: 'Bearer ' + token } : {},
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    );
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(b || '{}') }); } catch (e) { resolve({ status: res.statusCode, json: {} }); } }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const post = (p, b, t) => req('POST', BASE + p, b, t);
const get  = (p, t)    => req('GET',  BASE + p, null, t);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), AMKH_DB_PATH: TMP, AMKH_DB_VERBOSE: '0' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', d => process.stderr.write('[srv:err] ' + d));

  let failed = false;
  try {
    await sleep(1200);
    // سجّل 3 مستخدمين
    const A = (await post('/register', { email: 'a@t.com', password: 'pw123456', display_name: 'Alice' })).json;
    const B = (await post('/register', { email: 'b@t.com', password: 'pw123456', display_name: 'Bob'   })).json;
    const C = (await post('/register', { email: 'c@t.com', password: 'pw123456', display_name: 'Carol' })).json;
    if (!A.token || !B.token || !C.token) throw new Error('register failed');
    const [tA, tB, tC] = [A.token, B.token, C.token];
    const [idA, idB, idC] = [A.user.id, B.user.id, C.user.id];

    // صداقة Alice↔Bob و Alice↔Carol (طلب متبادل = قبول تلقائي)
    await post('/friends/request', { receiver_id: idB }, tA);
    await post('/friends/request', { receiver_id: idA }, tB);
    await post('/friends/request', { receiver_id: idC }, tA);
    await post('/friends/request', { receiver_id: idA }, tC);

    // 1) خصوصية: الافتراضي ثم الحفظ
    const p0 = await get('/privacy', tB);
    if (p0.json.privacy.who_can_add_me_to_parties !== 'friends') throw new Error('default party add != friends');
    const p1 = await post('/privacy', { who_can_add_me_to_parties: 'nobody', who_can_see_my_rating: 'friends' }, tB);
    if (p1.json.privacy.who_can_add_me_to_parties !== 'nobody') throw new Error('save privacy failed');
    // بتفضل: قراءة تانية
    const p2 = await get('/privacy', tB);
    if (p2.json.privacy.who_can_add_me_to_parties !== 'nobody') throw new Error('privacy not persisted');
    console.log('[t] privacy save/persist OK');

    // 2) Alice تعمل حفلة وتحاول تضيف Bob(nobody) + Carol(friends,default)
    const g = (await post('/groups', { name: 'حفلتي' }, tA)).json;
    const gid = g.id;
    const addRes = (await post(`/groups/${gid}/members`, { members: [idB, idC] }, tA)).json;
    console.log('[t] add result: added', addRes.added, 'invited', addRes.invited);
    if (!(addRes.added || []).includes(idC)) throw new Error('Carol should be added directly');
    if ((addRes.added || []).includes(idB)) throw new Error('Bob must NOT be added directly (nobody)');
    if (!(addRes.invited || []).includes(idB)) throw new Error('Bob should be invited, not added');

    // 3) Bob يشوف الدعوة المعلّقة ويقبلها
    const inv = (await get('/groups/party-invites', tB)).json;
    if (!Array.isArray(inv) || inv.length !== 1) throw new Error('Bob should have exactly 1 pending invite');
    if (inv[0].party_id !== gid) throw new Error('invite party mismatch');
    console.log('[t] Bob sees invite from', inv[0].from_name, 'to', inv[0].party_name);

    const acc = (await post(`/groups/party-invite/${inv[0].invite_id}/accept`, {}, tB)).json;
    if (!acc.ok) throw new Error('accept failed');
    const inv2 = (await get('/groups/party-invites', tB)).json;
    if (inv2.length !== 0) throw new Error('invite should be consumed after accept');

    // العدّ: Alice + Carol (مباشر) + Bob (بعد القبول) = 3
    const mem = (await get(`/groups/${gid}/members`, tA)).json;
    if (!mem.members || mem.members.length !== 3) throw new Error('expected 3 members, got ' + (mem.members || []).length);
    console.log('[t] party has 3 members after accept OK');

    // 4) رؤية التقييم: Bob خلّى تقييمه للأصدقاء فقط. Carol مش صديقته →
    //    البحث لازم يرجّع rating = null (مخفي).
    const sr = (await get('/friends/search?q=Bob', tC)).json;
    const bobRow = (Array.isArray(sr) ? sr : (sr.results || sr.users || [])).find(x => x.id === idB || x.user_id === idB);
    if (bobRow && bobRow.rating != null) throw new Error('Bob rating should be hidden from non-friend Carol');
    console.log('[t] rating visibility (friends-only) hidden from stranger OK');

    console.log('\n✔ ALL PRIVACY FLOW TESTS PASSED');
  } catch (e) {
    failed = true;
    console.error('\n✗ TEST FAILED:', e.message);
  } finally {
    srv.kill();
    try { fs.unlinkSync(TMP); } catch (e) {}
    process.exit(failed ? 1 : 0);
  }
})();
