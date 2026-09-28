/* اختبارُ المسارِ الحقيقيّ: كش-ماتٌ فعليٌّ داخلَ التطبيقِ نفسِه (index.html)
   للتحقّقِ من انطلاقِ مؤثّرِ المات المُجهَّز (بلاغ جوجو #1).
   يجهّز وضعيّةَ مات-في-نقلةٍ ثمّ ينادي G.applyMove ويرصدُ طبقةَ المؤثّرات.
   node scripts/test-mate-fx-live.js */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 9481, HTTP_PORT = 9482;
const ROOT = path.resolve(__dirname, '..');
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));
if (!EDGE) { console.error('Edge not found'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((rq, rs) => {
      let u = decodeURIComponent(rq.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const f = path.join(ROOT, u.replace(/^\/+/, ''));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('x'); }
      rs.writeHead(200, { 'Content-Type': (MIME[path.extname(f)] || 'application/octet-stream') + '; charset=utf-8' });
      fs.createReadStream(f).pipe(rs);
    });
    srv.listen(HTTP_PORT, '127.0.0.1', () => res(srv));
  });
}
function getJSON(url) {
  return new Promise((res, rej) => { http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej); });
}

async function main() {
  const srv = await serve();
  const profile = path.join(os.tmpdir(), 'amkh-matefx-' + Date.now());
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--window-size=420,900',
    `http://127.0.0.1:${HTTP_PORT}/`], { stdio: 'ignore' });

  let tabs = null;
  for (let i = 0; i < 80; i++) {
    try { tabs = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (tabs.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) break; } catch (e) {}
    await sleep(300);
  }
  const tab = tabs && tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!tab) { console.error('no tab'); edge.kill(); srv.close(); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0; const waiting = new Map(); const logs = [];
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') logs.push((msg.params.args || []).map(a => a.value || a.description).join(' '));
    if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text));
  });
  const send = (method, params) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.result && r.result.exceptionDetails) return 'ERR: ' + (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 100; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(300); }
  await sleep(2500);

  /* هل الرموزُ العامّةُ متاحة؟ */
  const probe = await evalJS(`JSON.stringify({
    G: typeof G, S: typeof S, E: typeof E,
    cos: typeof window.amkhCos, econ: typeof window.amkhEconomy,
    mateFx: (window.amkhCos && typeof window.amkhCos.mateFx) || 'none'
  })`);
  console.log('probe      ', probe);

  /* وضعيّةُ مات-في-نقلة: ملكُ الأسودِ a8، بيدقاه a7/b7، رخُّ الأبيضِ h7 → h8.
     bd[0] صفُّ الأسودِ الخلفيّ، bd[7] صفُّ الأبيض. */
  const SETUP = (myCol, mode) => `(function(){
    var b = Array.from({length:8}, function(){ return Array(8).fill(null); });
    b[0][0]='bK'; b[1][0]='bP'; b[1][1]='bP'; b[1][7]='wR'; b[7][4]='wK';
    S.bd=b; S.turn='w'; S.mode=${JSON.stringify(mode)}; S.myCol=${JSON.stringify(myCol)};
    S.levelId=-1; S.over=false;
    S.cas={w:{K:false,Q:false},b:{K:false,Q:false}}; S.ep=null;
    S.hist=[]; S.snapshots=[]; S.capW=[]; S.capB=[]; S.repMap={}; S.halfmove=0;
    S.moveCount=0; S.pending=null; S.sel=null; S.legal=[];
    try{ var g=document.getElementById('go-ov'); if(g) g.classList.remove('open'); }catch(e){}
    try{ document.querySelectorAll('.cos-fx-ov').forEach(function(n){n.remove();}); }catch(e){}
    return 'ok';
  })()`;

  /* سيناريوهاتٌ تغطّي كلَّ أوضاعِ اللعبِ + وضعَ تقليلِ الحركة (موفّرُ البطّاريّة
     على أندرويد يُفعّلُه، وهو سببُ «مش بيشتغل في أيِّ وضع») */
  const SCENARIOS = [
    { name: 'محرّك/نور (myCol=w)', myCol: 'w', mode: 'bot', reduced: false },
    { name: 'لاعبان محلّيًّا (both)', myCol: 'both', mode: 'local', reduced: false },
    { name: 'أونلاين (myCol=w)', myCol: 'w', mode: 'online', reduced: false },
    { name: 'تقليلُ الحركة (lite)', myCol: 'w', mode: 'bot', reduced: true },
  ];

  let pass = 0;
  for (const sc of SCENARIOS) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: sc.reduced ? 'reduce' : 'no-preference' }],
    });
    /* مُجهَّزٌ وهميٌّ (بلا تسجيلِ دخولٍ في المعمل) */
    await evalJS(`window.amkhEconomy.state = { equipped: { mate_fx:'fx_blackhole', celebration:'cel_dragon' } }; 1`);
    await evalJS(SETUP(sc.myCol, sc.mode));
    const moved = await evalJS(`(async function(){ try { await G.applyMove([1,7],[0,7],null); return 'applied'; } catch(e){ return 'THREW: '+(e&&e.message); } })()`);
    await sleep(400);
    const mid = JSON.parse(await evalJS(`JSON.stringify({
      over: S.over,
      ov: document.querySelectorAll('.cos-fx-ov').length,
      kids: (function(){ var o=document.querySelector('.cos-fx-ov'); return o?o.children.length:0; })(),
      lite: (function(){ var o=document.querySelector('.cos-fx-ov'); return !!(o&&o.classList.contains('cos-fx-ov--lite')); })(),
      vis: (function(){ var o=document.querySelector('.cos-fx-ov'); if(!o||!o.children.length) return 0;
        var n=0; Array.prototype.forEach.call(o.children,function(c){ if(getComputedStyle(c).display!=='none') n++; }); return n; })(),
      goOpen: !!(document.getElementById('go-ov')&&document.getElementById('go-ov').classList.contains('open'))
    })`));
    /* بعدَ انتهاءِ المؤثّرِ: هل ظهرت ورقةُ النهايةِ فعلًا؟ (١١٠٠ للمؤثّرِ
       ثمّ ٢٤٠٠ لورقةِ المراجعةِ السريعة ≈ ٣٥٠٠ مللي) — لا تُبتَلَع. */
    await sleep(3400);
    const late = JSON.parse(await evalJS(`JSON.stringify({
      goOpen: !!(document.getElementById('go-ov')&&document.getElementById('go-ov').classList.contains('open')),
      lvOpen: !!document.querySelector('.cos-levelup')
    })`));
    const ok = moved === 'applied' && mid.over && mid.ov === 1 && mid.vis > 0
      && (sc.reduced ? mid.lite : !mid.lite) && late.goOpen;
    if (ok) pass++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + sc.name.padEnd(24),
      JSON.stringify({ ...mid, endOpen: late.goOpen }));
    /* تنظيفٌ قبلَ السيناريو التالي — ومهلةٌ تكفي لانقضاءِ عمرِ المؤثّرِ
       وتصريفِ ما صُفَّ خلفَه (وإلّا ظنّ السيناريو التالي أنّ لا مؤثّر). */
    await evalJS(`(function(){ document.querySelectorAll('.cos-fx-ov,.cos-levelup,.cos-lvbd').forEach(function(n){n.remove();});
      var g=document.getElementById('go-ov'); if(g) g.classList.remove('open'); return 1; })()`);
    await sleep(7000);
    await evalJS(`(function(){ document.querySelectorAll('.cos-fx-ov,.cos-levelup,.cos-lvbd').forEach(function(n){n.remove();}); return 1; })()`);
  }

  /* نافذةُ ترقّي المستوى + صوتُها (بلاغُ جوجو ٧) */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evalJS(`window.amkhCos.levelUp(7, 'ارتقيتَ إلى المستوى ٧', 'مهامُّك صارت أصعبَ وأثمن'); 1`);
  let lv = null;
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    lv = JSON.parse(await evalJS(`JSON.stringify({
      card: !!document.querySelector('.cos-levelup'),
      backdrop: !!document.querySelector('.cos-lvbd'),
      rays: !!document.querySelector('.cos-lv__rays'),
      num: (document.querySelector('.cos-levelup') && document.querySelector('.cos-levelup').textContent || '').replace(/\\s+/g,' ').trim().slice(0,70),
      sfx: (typeof SFX!=='undefined' && typeof SFX.levelUp==='function')
    })`));
    if (lv.card) break;
  }
  console.log((lv && lv.card ? 'PASS  ' : 'FAIL  ') + 'نافذةُ الترقّي'.padEnd(24), JSON.stringify(lv));
  console.log('نتيجة      ', pass + '/' + SCENARIOS.length + ' سيناريو ناجح');
  if (logs.length) console.log('errors     ', logs.slice(0, 8).join(' | '));

  ws.close(); edge.kill(); srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
main().catch(e => { console.error(e); process.exit(1); });
