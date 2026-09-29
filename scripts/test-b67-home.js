/* تحقّقُ البناء ٦٧ — بلاغاتُ جوجو الثلاثةُ في الشاشةِ الرئيسيّة:
     ١) مربّعُ أيقونةِ «مراحل نور» ومربّعُ «الجوائز» = باقي المربّعاتِ بالضبط
        (خلفيّةٌ وحدٌّ ونصفُ قُطرٍ ومقاسٌ) وفي السماتِ الأربعِ كلِّها.
     ٢) لقطاتٌ للرئيسيّةِ في كلِّ سمةٍ للمراجعةِ بالعين (الأيقونتانِ الجديدتان).
     ٣) «أهمُّ خطأ»: تجميلُ حسابٍ لا يتسرّبُ لحسابٍ آخرَ على نفسِ الجهاز —
        خروجٌ يمسحُ الإطارَ واللافتةَ ولونَ الاسمِ فورًا، ولقطةُ حسابٍ سابقٍ
        (أو لقطةٌ قديمةٌ بلا وسمِ صاحب) لا تُستعادُ أبدًا عندَ init().
   node scripts/test-b67-home.js */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 9631, HTTP_PORT = 9632;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, '_shots');
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
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + '   ' + JSON.stringify(info)); }
}

const THEMES = ['', 'cyberpunk', 'gaming', 'glass', 'amkh'];

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const profile = path.join(os.tmpdir(), 'amkh-b67-' + Date.now());
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--force-device-scale-factor=1', '--window-size=412,915',
    `http://127.0.0.1:${HTTP_PORT}/`], { stdio: 'ignore' });

  let tabs = null;
  for (let i = 0; i < 80; i++) {
    try { tabs = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (tabs.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) break; } catch (e) {}
    await sleep(300);
  }
  const tab = tabs && tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!tab) { console.error('no tab'); edge.kill(); srv.close(); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const waiting = new Map();
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  });
  const send = (method, params) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.result && r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const J = async expr => JSON.parse(await evalJS('JSON.stringify(' + expr + ')'));
  const shot = async (file, clip) => {
    const p = { format: 'png', captureBeyondViewport: !!clip };
    if (clip) p.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: clip.scale || 1 };
    const r = await send('Page.captureScreenshot', p);
    const b64 = r.result && r.result.data;
    if (!b64) return null;
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(b64, 'base64'));
    return true;
  };
  const setTheme = t => evalJS(t
    ? `document.body.setAttribute('data-ui-theme','${t}'),1`
    : `document.body.removeAttribute('data-ui-theme'),1`);

  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 100; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(300); }
  await sleep(2500);

  /* شاشةُ الترحيبِ تحجبُ الرئيسيّة: نُكمِلُ «بلا حساب» ونعودُ للعربيّة. */
  for (let i = 0; i < 8; i++) {
    const gone = await evalJS(`(function(){
      var b=document.getElementById('wl-skip');
      if(b){ b.click(); return false; }
      var n=document.querySelector('.wl-screen button, .wl-screen .wl-next');
      if(n){ n.click(); return false; }
      return !document.querySelector('.wl-screen');
    })()`);
    if (gone === true) break;
    await sleep(700);
  }
  await evalJS(`(function(){ try{ if(window.I18N&&I18N.set) I18N.set('ar'); }catch(e){}
    try{ if(window.Nav&&Nav.go) Nav.go('s-menu'); }catch(e){} return 1; })()`);
  await sleep(900);

  /* ══ ١) توحيدُ المربّعاتِ في كلِّ السماتِ (بلاغُ جوجو ١) ══ */
  const BOXCSS = `(function(){
    function box(sel){
      var el=document.querySelector(sel); if(!el) return null;
      var c=getComputedStyle(el), r=el.getBoundingClientRect();
      return { bg:c.backgroundColor, bi:c.backgroundImage, bw:c.borderTopWidth, bc:c.borderTopColor,
               bs:c.borderTopStyle, rad:c.borderTopLeftRadius, sh:c.boxShadow,
               w:Math.round(r.width), h:Math.round(r.height) };
    }
    return { hero: box('#s-menu .home-hero__icon'),
             tile: box('#s-menu .home-tile:not(.home-tile--rewards) .home-tile__icon'),
             rew:  box('#s-menu .home-tile--rewards .home-tile__icon') };
  })()`;
  const boxes = {};
  for (const t of THEMES) {
    await setTheme(t); await sleep(260);
    boxes[t || 'default'] = await J(BOXCSS);
  }
  const sameKeys = ['bg', 'bi', 'bw', 'bc', 'bs', 'rad', 'sh', 'w', 'h'];
  const diffs = [];
  for (const k in boxes) {
    const b = boxes[k];
    if (!b || !b.hero || !b.tile || !b.rew) { diffs.push([k, 'missing']); continue; }
    sameKeys.forEach(f => {
      if (b.hero[f] !== b.tile[f]) diffs.push([k, 'hero.' + f, b.hero[f], b.tile[f]]);
      if (b.rew[f] !== b.tile[f]) diffs.push([k, 'rewards.' + f, b.rew[f], b.tile[f]]);
    });
  }
  check('١ مربّعُ «مراحل نور» و«الجوائز» = باقي المربّعاتِ في السماتِ الخمس',
    diffs.length === 0, diffs.slice(0, 12));

  /* ══ ٢) لقطاتُ الرئيسيّةِ لكلِّ سمةٍ للمراجعةِ بالعين ══ */
  await setTheme('');
  await sleep(300);
  const rect = await J(`(function(){
    var a=document.querySelector('#s-menu .home-hero'),
        b=document.querySelector('#s-menu .home-tile--rewards')||document.querySelector('#s-menu .home-tile:last-of-type');
    if(!a) return null; var ra=a.getBoundingClientRect(), rb=b?b.getBoundingClientRect():ra;
    return { x:0, y:Math.max(0,ra.top-8), w:Math.ceil(window.innerWidth),
             h:Math.ceil((rb.bottom-ra.top)+16) };
  })()`);
  let shotsOk = 0;
  for (const t of THEMES) {
    await setTheme(t); await sleep(320);
    if (rect && await shot('home-b67-' + (t || 'default') + '.png',
      { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 2 })) shotsOk++;
  }
  check('٢ لقطةُ الرئيسيّةِ في السماتِ الخمسِ محفوظة', shotsOk === THEMES.length, shotsOk);
  await setTheme('');

  /* ══ ٣) تسرّبُ التجميلِ بين الحسابات (بلاغُ جوجو «أهمُّ خطأ») ══ */
  const SNAP = `{ balance: 999, level: 3, xp: 10, owned: ['frame_gold','bg_royal','badge_dragon'],
                  equipped: { frame:'frame_gold', background:'bg_royal', badge:'badge_dragon' } }`;
  const paintState = `(function(){
    var av=document.getElementById('home-id-av'), nm=document.getElementById('home-id-name'),
        card=document.querySelector('#s-menu .home-id');
    return { frame: !!(av&&av.querySelector('.cos-frame')),
             badge: !!(nm&&nm.querySelector('.cos-badge')),
             banner: !!(card&&card.querySelector('.cos-banner')),
             bannered: !!(card&&card.classList.contains('cos-bannered')),
             cached: !!localStorage.getItem('amkh_economy_cache'),
             hasState: !!(window.amkhEconomy&&window.amkhEconomy.state) };
  })()`;

  /* أ) حسابُ «أ» يملكُ إطارًا وخلفيّةً وشارة → يجبُ أن تظهرَ كلُّها */
  const onA = await J(`(function(){
    localStorage.setItem('amkh_user', JSON.stringify({ id: 111, name:'A' }));
    window.amkhEconomy.apply(${SNAP});
    return ${paintState};
  })()`);
  check('٣-أ تجميلُ الحسابِ «أ» يظهرُ فعلًا قبلَ الاختبار',
    onA.frame && onA.badge && onA.banner && onA.bannered && onA.cached, onA);

  /* ب) تسجيلُ الخروج: amkhEconomy.clear() يُنادى من amkhAuth.logout() */
  const afterOut = await J(`(function(){
    window.amkhEconomy.clear();
    return ${paintState};
  })()`);
  check('٣-ب الخروجُ يمسحُ الإطارَ واللافتةَ والشارةَ واللقطةَ المخبّأة',
    !afterOut.frame && !afterOut.badge && !afterOut.banner && !afterOut.bannered &&
    !afterOut.cached && !afterOut.hasState, afterOut);

  /* ج) الدخولُ بحسابِ «ب»: لقطةُ «أ» موجودةٌ في التخزينِ لكنّها موسومةٌ بـ١١١ */
  const onB = await J(`(function(){
    localStorage.setItem('amkh_economy_cache', JSON.stringify({ uid:'111', snap: ${SNAP} }));
    localStorage.setItem('amkh_user', JSON.stringify({ id: 222, name:'B' }));
    window.amkhEconomy.state=null;
    window.amkhEconomy.init();
    try{ Home._identity(); }catch(e){}
    return ${paintState};
  })()`);
  check('٣-ج لقطةُ حسابٍ آخرَ لا تُستعادُ ولا تُرسَمُ إطلاقًا',
    !onB.frame && !onB.badge && !onB.banner && !onB.bannered && !onB.cached && !onB.hasState, onB);

  /* د) اللقطةُ القديمةُ (بلا وسمِ صاحبٍ) من نسخةٍ سابقةٍ للتطبيقِ تُرفَضُ كذلك */
  const legacy = await J(`(function(){
    localStorage.setItem('amkh_economy_cache', JSON.stringify(${SNAP}));
    window.amkhEconomy.state=null;
    window.amkhEconomy.init();
    try{ Home._identity(); }catch(e){}
    return ${paintState};
  })()`);
  check('٣-د اللقطةُ القديمةُ بلا وسمِ صاحبٍ تُرفَضُ وتُمسَح',
    !legacy.frame && !legacy.banner && !legacy.cached && !legacy.hasState, legacy);

  /* هـ) الزائرُ (بلا توكِن): refresh لا يُظهِرُ تجميلًا مطلقًا */
  const guest = await J(`(function(){
    localStorage.setItem('amkh_economy_cache', JSON.stringify({ uid:'222', snap: ${SNAP} }));
    localStorage.removeItem('amkh_user'); localStorage.removeItem('amkh_token');
    window.amkhEconomy.state=null; window.amkhEconomy.init();
    try{ Home._identity(); }catch(e){}
    return ${paintState};
  })()`);
  check('٣-هـ بلا حسابٍ: لا إطارَ ولا لافتةَ ولا لقطةَ باقية',
    !guest.frame && !guest.banner && !guest.hasState, guest);

  /* و) الوصلُ الفعليُّ: logout و_wipeLocalUserData ينادِيانِ clear */
  const wired = await J(`(function(){
    var s=(window.amkhAuth&&window.amkhAuth.logout?String(window.amkhAuth.logout):'');
    return { logoutHasClear: /amkhEconomy[\\s\\S]{0,40}clear/.test(s),
             hasClearFn: typeof (window.amkhEconomy&&window.amkhEconomy.clear)==='function' };
  })()`);
  check('٣-و amkhAuth.logout يستدعي amkhEconomy.clear فعلًا',
    wired.logoutHasClear && wired.hasClearFn, wired);

  console.log('──────────────');
  console.log('مقاسات     ', JSON.stringify(boxes.default));
  console.log('لقطات      ', SHOTS);
  console.log('نتيجة       ' + pass + ' ناجح / ' + fail + ' فاشل');
  try { ws.close(); } catch (e) {}
  edge.kill(); srv.close();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
