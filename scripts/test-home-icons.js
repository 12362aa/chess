/* تحقّقٌ بصريٌّ وبرمجيٌّ من أيقوناتِ الشاشةِ الرئيسيّةِ المرسومة (طلبُ جوجو).
   يفتحُ index.html الحقيقيَّ في Edge بلا واجهةٍ عبرَ CDP خامًّا، ثمّ:
     ١) يتأكّدُ أنّ كلَّ بطاقاتِ الرئيسيّةِ الثمانيةِ صارت SVG مرسومًا ملوّنًا
        (لا قناعَ currentColor) وأنّ لا `.ico--engine/local/online/bluetooth/levels`
        بقيَ داخلَ الشاشةِ الرئيسيّة.
     ٢) يُثبِتُ أنّ الحركةَ تعملُ فعلًا (getAnimations على كلِّ مجموعةٍ متحرّكة)
        وأنّها تسكنُ كلُّها عندَ prefers-reduced-motion.
     ٣) ينقلُ الأيقوناتَ إلى معملٍ بخلفيّةٍ ثابتةٍ ويلتقطُ لقطةً لكلِّ سمةٍ من
        السماتِ الأربع، ثمّ يقارنُ البكسلاتَ: التطابقُ التامُّ = الأيقونةُ
        مستقلّةٌ عن السمةِ فعلًا (طلبُ «الثيمُ الزجاجيّ»).
     ٤) يحفظُ لقطاتٍ للمراجعةِ بالعينِ في scripts/_shots/.
     ٥) يقيسُ مقاساتِ الأيقوناتِ على الهاتفِ والتابلتِ والكمبيوتر.
   node scripts/test-home-icons.js */
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 9613, HTTP_PORT = 9614;
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

/* الأيقوناتُ الثمانيةُ المتوقّعةُ في الرئيسيّةِ بأصنافِها */
const WANT = ['levels', 'engine', 'local', 'online', 'bt', 'puzzles', 'store', 'rewards'];
/* أيُّها يجبُ أن يتحرّكَ فعلًا (لاعبان ساكنةٌ عمدًا بطلبِ جوجو) */
const MUST_MOVE = ['levels', 'engine', 'online', 'bt', 'puzzles', 'store', 'rewards'];

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const profile = path.join(os.tmpdir(), 'amkh-homeic-' + Date.now());
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
  let id = 0; const waiting = new Map(); const errs = [];
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text));
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
    return crypto.createHash('sha1').update(b64).digest('hex').slice(0, 16);
  };
  const setMotion = red => send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: red ? 'reduce' : 'no-preference' }],
  });

  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 100; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(300); }
  await sleep(2500);

  /* ══ ١) كلُّ البطاقاتِ صارت SVG مرسومًا — ولا قناعَ باقٍ في الرئيسيّة ══ */
  const inv = await J(`(function(){
    var scr=document.getElementById('s-menu');
    var got=[];
    scr.querySelectorAll('.home-hero__icon svg.home-ic, .home-tile__icon svg.home-ic').forEach(function(s){
      var m=/home-ic--([a-z]+)/.exec(s.getAttribute('class')||'');
      got.push({ key: m?m[1]:'?',
        grads: s.querySelectorAll('linearGradient,radialGradient').length,
        stops: s.querySelectorAll('stop').length,
        shapes: s.querySelectorAll('path,rect,circle,ellipse').length,
        smil: s.querySelectorAll('animate,animateTransform').length,
        uniqIds: (function(){ var ids=[].map.call(s.querySelectorAll('[id]'),function(n){return n.id;});
          return ids.length===new Set(ids).size; })() });
    });
    /* أقنعةُ الثيمِ الباقيةُ داخلَ الشاشةِ الرئيسيّةِ فقط (الشيفرونُ مسموح) */
    var masks=[].map.call(scr.querySelectorAll('.home-hero__icon .ico, .home-tile__icon .ico'),
      function(n){ return n.className; });
    return { got: got, masks: masks };
  })()`);
  const keys = inv.got.map(g => g.key);
  check('٨ أيقوناتٍ مرسومةٍ ملوّنةٍ في الرئيسيّة',
    inv.got.length === 8 && WANT.every(k => keys.includes(k)), keys);
  check('كلُّ أيقونةٍ بتدرّجاتٍ حقيقيّةٍ ومعرّفاتٍ بلا تصادم',
    inv.got.length === 8 && inv.got.every(g => g.grads >= 2 && g.stops >= 4 && g.shapes >= 4 && g.uniqIds), inv.got);
  check('لا قناعَ ثيمٍ باقٍ في أيقوناتِ الرئيسيّة', inv.masks.length === 0, inv.masks);
  check('الحركةُ كلُّها CSS لا SMIL (تُوقَفُ بتقليلِ الحركة)',
    inv.got.every(g => g.smil === 0), inv.got.filter(g => g.smil));

  /* ══ ٢) الحركةُ تعملُ فعلًا في الوضعِ العاديّ ══ */
  await setMotion(false);
  await sleep(500);
  const anim = await J(`(function(){
    var out={};
    document.querySelectorAll('#s-menu .home-ic').forEach(function(s){
      var m=/home-ic--([a-z]+)/.exec(s.getAttribute('class')||''); if(!m) return;
      var n=0, names=[];
      s.querySelectorAll('[class]').forEach(function(g){
        if(!/(^|\\s)hic-/.test(g.getAttribute('class')||'')) return;
        var a=g.getAnimations?g.getAnimations():[];
        a.forEach(function(x){ if(x.playState==='running'||x.playState==='finished'){ n++; names.push(x.animationName||'?'); } });
      });
      out[m[1]]={ running:n, names:names };
    });
    return out;
  })()`);
  check('الأيقوناتُ المتحرّكةُ تعملُ فعلًا (٧ منها)',
    MUST_MOVE.every(k => anim[k] && anim[k].running >= 1), anim);
  check('لاعبانِ ساكنةٌ عمدًا كما طلبَ جوجو',
    !anim.local || anim.local.running === 0, anim.local);

  /* ══ ٢-ب) تسكنُ كلُّها عندَ تقليلِ الحركة (موفّرُ البطّاريّةِ على أندرويد) ══ */
  await setMotion(true);
  await sleep(700);
  const still = await J(`(function(){
    var run=0, bad=[];
    document.querySelectorAll('#s-menu .home-ic [class]').forEach(function(g){
      if(!/(^|\\s)hic-/.test(g.getAttribute('class')||'')) return;
      var a=g.getAnimations?g.getAnimations():[];
      a.forEach(function(x){ if(x.playState==='running'){ run++; bad.push(g.getAttribute('class')); } });
    });
    /* وSMIL الباقي (أيقونةُ التحدّياتِ ولمعةُ العملة) مُوقَفٌ برمجيًّا */
    if(window.amkhCos && amkhCos.smilSweep) amkhCos.smilSweep();
    var smilPaused=(function(){ var s=document.querySelector('.home-daily__chal');
      try{ return !!s && s.animationsPaused(); }catch(e){ return null; } })();
    var coinPaused=(function(){ var s=document.querySelector('#home-econ svg');
      try{ return !!s && s.animationsPaused(); }catch(e){ return null; } })();
    return { run:run, bad:bad.slice(0,6), smilPaused:smilPaused, coinPaused:coinPaused };
  })()`);
  check('كلُّ الحركةِ تسكنُ عندَ تقليلِ الحركة', still.run === 0, still);
  check('SMIL المتبقّي (التحدّياتُ + العملة) يُوقَفُ برمجيًّا',
    still.smilPaused === true && still.coinPaused === true, still);
  /* والعملةُ المولّدةُ بعدَ ذلك تُولَدُ بلا <animate> أصلًا */
  const coinStill = await J(`(function(){ var h=amkhCos.coin(20);
    return { hasAnim: /<animate/.test(h) }; })()`);
  check('عملةُ AK المولّدةُ في تقليلِ الحركةِ بلا لمعةٍ فالتة', coinStill.hasAnim === false, coinStill);

  /* ══ ٣) استقلالُ الأيقوناتِ عن السمات: معملٌ بخلفيّةٍ ثابتة ══
     ننقلُ الأيقوناتَ (لا ننسخُها، فلا تتكرّرُ معرّفاتُ التدرّجات) إلى شبكةٍ
     بخلفيّةٍ ثابتةٍ، ونلتقطُ نفسَ المستطيلِ في كلِّ سمةٍ ونقارنُ البكسلات. */
  await setMotion(true);   /* ساكنٌ حتّى تكونَ المقارنةُ عادلة */
  await sleep(400);
  const lab = await J(`(function(){
    /* شاشةُ الترحيبِ/أيُّ طبقةٍ مفتوحةٍ تُغلَقُ حتّى تظهرَ الرئيسيّةُ في اللقطات */
    document.querySelectorAll('.ds-overlay.is-open, .ds-overlay.open').forEach(function(o){
      o.classList.remove('is-open'); o.classList.remove('open'); });
    var host=document.createElement('div');
    host.id='ic-lab';
    host.style.cssText='position:fixed;left:0;top:0;width:412px;z-index:2147483647;'
      + 'background:#0b0f14;display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding:6px;'
      + 'box-sizing:border-box;direction:ltr';
    document.body.appendChild(host);
    /* ننقلُ لا ننسخُ (لئلّا تتكرّرَ معرّفاتُ التدرّجاتِ فتُرسَمَ بالخطأ)،
       ونحفظُ موضعَها الأصليَّ لنُعيدَها بعدَ اللقطات. */
    window.__icBack=[];
    var order=${JSON.stringify(WANT)};
    order.forEach(function(k){
      var s=document.querySelector('#s-menu .home-ic--'+k);
      var cell=document.createElement('div');
      cell.style.cssText='display:flex;align-items:center;justify-content:center;height:96px;background:#0b0f14';
      if(s){ window.__icBack.push({ s:s, p:s.parentNode });
        s.style.width='84px'; s.style.height='84px'; s.style.filter='none'; cell.appendChild(s); }
      host.appendChild(cell);
    });
    var b=host.getBoundingClientRect();
    return { x:Math.round(b.left), y:Math.round(b.top), width:Math.round(b.width), height:Math.round(b.height),
      moved: window.__icBack.length };
  })()`);
  check('المعملُ التقطَ الأيقوناتَ الثمانيةَ كلَّها', lab.moved === 8, lab);
  const THEMES = ['', 'cyberpunk', 'gaming', 'glass'];
  const hashes = {};
  for (const th of THEMES) {
    await evalJS(`(function(){ var b=document.body;
      if(${JSON.stringify(th)}) b.setAttribute('data-ui-theme',${JSON.stringify(th)});
      else b.removeAttribute('data-ui-theme'); return b.getAttribute('data-ui-theme')||'default'; })()`);
    await sleep(450);
    hashes[th || 'default'] = await shot('icons-theme-' + (th || 'default') + '.png',
      { x: lab.x, y: lab.y, width: lab.width, height: lab.height, scale: 2 });
  }
  const uniq = new Set(Object.values(hashes));
  check('الأيقوناتُ نفسُها بكسلًا بكسلًا في السماتِ الأربعِ (الزجاجيُّ منها)',
    uniq.size === 1 && !Object.values(hashes).includes(null), hashes);

  /* لقطةُ معاينةٍ ملوّنةٌ متحرّكةٌ للمراجعةِ بالعين */
  await setMotion(false);
  await evalJS(`(function(){ document.body.removeAttribute('data-ui-theme'); return 1; })()`);
  await sleep(900);
  await shot('icons-lab-color.png', { x: lab.x, y: lab.y, width: lab.width, height: lab.height, scale: 3 });
  /* ولقطةٌ ثانيةٌ بعدَ ثانيتَينِ = طورٌ مختلفٌ من الحركةِ (الصندوقُ مفتوحًا مثلًا) */
  await sleep(2100);
  await shot('icons-lab-phase2.png', { x: lab.x, y: lab.y, width: lab.width, height: lab.height, scale: 3 });

  /* ══ ٥) المقاساتُ على الهاتفِ والهاتفِ القصيرِ والتابلتِ والكمبيوتر ══
     «راعي الشاشاتِ اللوحيّةَ وراعي الكمبيوتر»: الأيقونةُ لا تفيضُ عن حاويتِها
     ولا تصغرُ فيها حتّى تتوهَ في مساحةٍ فارغة. */
  await evalJS(`(function(){
    /* نُعيدُ الأيقوناتَ إلى بطاقاتِها ونمحو المقاساتِ المفروضةَ في المعمل */
    (window.__icBack||[]).forEach(function(r){ try{ r.s.style.width=''; r.s.style.height='';
      r.s.style.filter=''; r.p.appendChild(r.s); }catch(e){} });
    var h=document.getElementById('ic-lab'); if(h) h.remove();
    document.querySelectorAll('.ds-overlay.is-open, .ds-overlay.open').forEach(function(o){
      o.classList.remove('is-open'); o.classList.remove('open'); });
    return 1; })()`);
  const SIZES = [
    { name: 'هاتف 412', w: 412, h: 915 },
    { name: 'هاتفٌ قصير 360', w: 360, h: 640 },
    { name: 'تابلت 834', w: 834, h: 1112 },
    { name: 'كمبيوتر 1440', w: 1440, h: 900 },
  ];
  let dimOK = true; const dims = {};
  for (const s of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.w < 760 });
    await sleep(600);
    const d = await J(`(function(){
      var out=[];
      document.querySelectorAll('#s-menu .home-hero__icon, #s-menu .home-tile__icon').forEach(function(box){
        var s=box.querySelector('svg.home-ic'); if(!s) return;
        var m=/home-ic--([a-z]+)/.exec(s.getAttribute('class')||'');
        var bb=box.getBoundingClientRect(), sb=s.getBoundingClientRect();
        out.push({ k:m?m[1]:'?', box:Math.round(bb.width), ic:Math.round(sb.width),
          fits: sb.width<=bb.width+0.6 && sb.height<=bb.height+0.6,
          filled: sb.width/bb.width>=0.56 });
      });
      return out;
    })()`);
    const bad = d.filter(x => !x.fits || !x.filled);
    dims[s.name] = d.map(x => x.k + ':' + x.ic + '/' + x.box).join(' ');
    if (bad.length) { dimOK = false; dims[s.name + ' ✗'] = bad; }
    /* لقطةُ الشاشةِ الرئيسيّةِ كاملةً في كلِّ مقاسٍ للمراجعةِ بالعين */
    await shot('home-' + s.w + '.png', null);
  }
  check('المقاساتُ سليمةٌ على الهاتفِ والتابلتِ والكمبيوتر', dimOK, dims);
  console.log('مقاسات     ', JSON.stringify(dims, null, 1));
  await send('Emulation.clearDeviceMetricsOverride');

  if (errs.length) console.log('errors     ', errs.slice(0, 6).join(' | '));
  console.log('──────────────');
  console.log('لقطات      ', SHOTS);
  console.log('نتيجة       ' + pass + ' ناجح / ' + fail + ' فاشل');

  ws.close(); edge.kill(); srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exitCode = fail ? 1 : 0;
}
main().catch(e => { console.error(e); process.exit(1); });
