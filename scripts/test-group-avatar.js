/* اختبار تكامل: صورة الحفلة (avatar) — المالك يقدر يغيّرها، وغير المالك لأ،
   والصورة بتظهر في ملخّص الحفلة وبيتبعت group:updated للأعضاء.
   node scripts/test-group-avatar.js */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const PORT = 8203;
const BASE = `http://127.0.0.1:${PORT}`;
const WSURL = `ws://127.0.0.1:${PORT}`;
const tmpDb = path.join(os.tmpdir(), `amkh-gav-${Date.now()}.db`);

function api(method, endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + endpoint);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b || '{}') }); } catch (e) { resolve({ status: res.statusCode, data: b }); } }); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function wsClient(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WSURL);
    const inbox = [];
    ws.on('message', d => { try { inbox.push(JSON.parse(d.toString())); } catch (e) {} });
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'presence:hello', token })); setTimeout(() => resolve({ ws, inbox }), 300); });
    ws.on('error', reject);
  });
}
const waitFor = async (inbox, pred, ms = 2000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const hit = inbox.find(pred); if (hit) return hit; await sleep(50); }
  return null;
};

let server, failures = 0;
const ok = (cond, msg) => { console.log((cond ? '✔' : '✘') + ' ' + msg); if (!cond) failures++; };
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64');

(async () => {
  server = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT), AMKH_DB_PATH: tmpDb, AMKH_DB_VERBOSE: '0' } });
  server.stderr.on('data', d => process.stderr.write('[srv] ' + d));
  for (let i = 0; i < 60; i++) { try { const h = await api('GET', '/api/health'); if (h.status === 200) break; } catch (e) {} await sleep(150); }

  const A = await api('POST', '/api/register', { username: 'a', email: 'a@t.co', password: 'pw123456', display_name: 'أليس' });
  const B = await api('POST', '/api/register', { username: 'b', email: 'b@t.co', password: 'pw123456', display_name: 'بوب' });
  const tA = A.data.token, tB = B.data.token, idB = B.data.user.id;
  await api('POST', '/api/friends/request', { receiver_id: idB }, tA);
  const inc = await api('GET', '/api/friends/requests', null, tB);
  const rid = inc.data.incoming[0].request_id;
  await api('POST', '/api/friends/respond', { request_id: rid, action: 'accept' }, tB);

  // حفلة بالاتنين
  const g = await api('POST', '/api/groups/', { name: 'حفلتي', members: [idB] }, tA);
  ok(g.status === 200 && g.data.id, 'إنشاء الحفلة');
  const gid = g.data.id;
  ok(g.data.avatar_url == null, 'الحفلة الجديدة من غير صورة (الافتراضي أيقونة مرسومة)');

  // سوكت بوب عشان نتأكد من وصول group:updated
  const cb = await wsClient(tB);

  // المالك (أليس) يغيّر الصورة
  const setRes = await api('POST', `/api/groups/${gid}/avatar`, { avatar_url: IMG }, tA);
  ok(setRes.status === 200 && setRes.data.avatar_url === IMG, 'المالك غيّر صورة الحفلة');
  const upd = await waitFor(cb.inbox, m => m.type === 'group:updated' && m.group_id === gid && m.avatar_url === IMG);
  ok(!!upd, 'وصل group:updated للعضو التاني بالصورة الجديدة');

  // الصورة بتظهر في قايمة الحفلات لبوب
  const list = await api('GET', '/api/groups/', null, tB);
  const mine = (list.data || []).find(x => x.id === gid);
  ok(mine && mine.avatar_url === IMG, 'صورة الحفلة بتظهر في ملخّص العضو');

  // غير المالك (بوب) مايقدرش يغيّر الصورة
  const denied = await api('POST', `/api/groups/${gid}/avatar`, { avatar_url: IMG }, tB);
  ok(denied.status === 403, 'غير المالك ممنوع يغيّر الصورة');

  // صورة مش data URL مرفوضة
  const bad = await api('POST', `/api/groups/${gid}/avatar`, { avatar_url: 'http://x/y.jpg' }, tA);
  ok(bad.status === 400, 'رابط مش data URL بيترفض');

  cb.ws.close();
  await sleep(150);
  console.log(failures === 0 ? '\n✅ كل اختبارات صورة الحفلة نجحت' : `\n❌ فشل ${failures} اختبار`);
  server.kill();
  try { fs.unlinkSync(tmpDb); } catch (e) {}
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); if (server) server.kill(); process.exit(1); });
