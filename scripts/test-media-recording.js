/* اختبار تكامل: مؤشّر التسجيل + إرسال الوسائط (صور/فيديو) + جروب لعضو واحد.
   بيشغّل السيرفر الحقيقي على قاعدة مؤقتة (AMKH_DB_PATH) وبورت فاضي.
   node scripts/test-media-recording.js */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const PORT = 8199;
const BASE = `http://127.0.0.1:${PORT}`;
const WSURL = `ws://127.0.0.1:${PORT}`;
const tmpDb = path.join(os.tmpdir(), `amkh-test-${Date.now()}.db`);

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

(async () => {
  server = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT), AMKH_DB_PATH: tmpDb, AMKH_DB_VERBOSE: '0' } });
  server.stderr.on('data', d => process.stderr.write('[srv] ' + d));
  // انتظر الصحة
  for (let i = 0; i < 40; i++) { try { const h = await api('GET', '/api/health'); if (h.status === 200) break; } catch (e) {} await sleep(150); }

  // مستخدمين
  const A = await api('POST', '/api/register', { username: 'alice', email: 'a@t.co', password: 'pw123456', display_name: 'أليس' });
  const B = await api('POST', '/api/register', { username: 'bob', email: 'b@t.co', password: 'pw123456', display_name: 'بوب' });
  ok(A.status === 200 && A.data.token, 'تسجيل أليس');
  ok(B.status === 200 && B.data.token, 'تسجيل بوب');
  const tA = A.data.token, tB = B.data.token;
  const idB = B.data.user.id;

  // صداقة (طلب + قبول)
  const reqRes = await api('POST', '/api/friends/request', { receiver_id: idB }, tA);
  ok(reqRes.status === 200, 'إرسال طلب صداقة');
  if (reqRes.status !== 200) console.log('   →', JSON.stringify(reqRes));
  const incoming = await api('GET', '/api/friends/requests', null, tB);
  console.log('   incoming:', JSON.stringify(incoming.data));
  const list = incoming.data && (incoming.data.incoming || incoming.data);
  const rid = list && list[0] && list[0].request_id;
  const acc = await api('POST', '/api/friends/respond', { request_id: rid, action: 'accept' }, tB);
  ok(acc.status === 200, 'قبول الصداقة');

  // سوكِتات
  const ca = await wsClient(tA);
  const cb = await wsClient(tB);

  // 1) مؤشّر التسجيل: A → B
  ca.ws.send(JSON.stringify({ type: 'chat:recording', to: idB, on: true }));
  const recMsg = await waitFor(cb.inbox, m => m.type === 'chat:recording' && m.on === true);
  ok(!!recMsg, 'مؤشّر التسجيل وصل للطرف التاني (on)');
  ca.ws.send(JSON.stringify({ type: 'chat:recording', to: idB, on: false }));
  const recOff = await waitFor(cb.inbox, m => m.type === 'chat:recording' && m.on === false);
  ok(!!recOff, 'مؤشّر التسجيل وصل (off)');

  // 2) إرسال صورة A → B
  const imgB64 = Buffer.from('fake-image-bytes').toString('base64');
  const cid = 'test-img-1';
  ca.ws.send(JSON.stringify({ type: 'chat:send', kind: 'image', to: idB, audio: imgB64, mime: 'image/jpeg', client_id: cid }));
  const sent = await waitFor(ca.inbox, m => m.type === 'chat:sent' && m.client_id === cid);
  ok(!!sent, 'المُرسِل استلم chat:sent للصورة (مش عالق على الساعة)');
  const got = await waitFor(cb.inbox, m => m.type === 'chat:message' && m.kind === 'image');
  ok(got && got.audio === imgB64 && got.mime === 'image/jpeg', 'الطرف التاني استلم الصورة بنفس البيانات');

  // 2b) history بيرجّع الصورة كـ audio
  const hist = await api('GET', `/api/chat/history?with=${A.data.user.id}`, null, tB);
  const imgHist = (hist.data.messages || []).find(m => m.kind === 'image');
  ok(imgHist && imgHist.audio === imgB64, 'سجل المحادثة بيحمل الصورة (audio)');

  // 2c) رفض الوسائط الكبيرة
  const huge = 'x'.repeat(8_000_001);
  ca.ws.send(JSON.stringify({ type: 'chat:send', kind: 'image', to: idB, audio: huge, mime: 'image/jpeg', client_id: 'too-big-1' }));
  const errBig = await waitFor(ca.inbox, m => m.type === 'chat:error' && m.reason === 'too-big' && m.client_id === 'too-big-1');
  ok(!!errBig, 'الوسائط الكبيرة بترجّع خطأ too-big (بدل ما تعلّق)');

  // 3) جروب لعضو واحد (بدون أصدقاء مختارين)
  const g = await api('POST', '/api/groups/', { name: 'جروبي', members: [] }, tA);
  ok(g.status === 200 && g.data.id, 'إنشاء جروب لعضو واحد نجح');

  // 3b) صورة في الجروب
  if (g.data.id) {
    ca.ws.send(JSON.stringify({ type: 'group:send', kind: 'image', group_id: g.data.id, audio: imgB64, mime: 'image/jpeg', client_id: 'g-img-1' }));
    const gsent = await waitFor(ca.inbox, m => m.type === 'group:sent' && m.client_id === 'g-img-1');
    ok(!!gsent, 'صورة الجروب: المُرسِل استلم group:sent');
  }

  ca.ws.close(); cb.ws.close();
  await sleep(200);
  console.log(failures === 0 ? '\n✅ كل الاختبارات نجحت' : `\n❌ فشل ${failures} اختبار`);
  server.kill();
  try { fs.unlinkSync(tmpDb); } catch (e) {}
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); if (server) server.kill(); process.exit(1); });
