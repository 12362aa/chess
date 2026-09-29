/* تحقّقُ البناء ٦٧ — الأيقوناتُ الثمانيةُ المُعادُ صنعُها (بلاغُ جوجو ١–٤):
     أ) بنيةُ العلامة: الأيقوناتُ الثلاثُ في الرئيسيّة (المحرّك/المراحل/الألغاز)
        صارَتْ بعناصرِها الجديدةِ فعلًا، ولا أثرَ لأيِّ صنفٍ محذوف.
     ب) الحركةُ حيّةٌ حقًّا: لكلِّ صنفٍ متحرّكٍ animation-name فعليٌّ ومدّةٌ>0،
        ولقطاتٌ متتاليةٌ من نفسِ الأيقونةِ تختلفُ — فالحركةُ ليست دعوى.
     ج) تقليلُ الحركة: كلُّ حركةِ hic-/abi- تسكنُ بلا استثناء.
     د) استقلالُ السمات: رسمُ كلِّ أيقونةٍ متطابقٌ بالبكسلِ في السماتِ الخمس.
     هـ) مقاسُ أيقوناتِ الشريطِ الأعلى ٢٢×٢٢ وكلُّها موجودة.
     و) شرطُ جوجو الصريح: أيقونةُ الأصدقاءِ ≠ أيقونةُ «لاعبان» — لا مسارَ
        مشتركٌ بينهما ولا رسمَ متطابق.
     ز) التسرّبُ العربيُّ في الإنجليزيّة: رسائلُ خطأِ الخادمِ كلُّها لها ترجمة.
   node scripts/test-b67-icons.js */
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

/* منفذانِ لا يستعملُهما أيُّ سكربتٍ آخرَ هنا — تصادمُ المنفذِ يجعلُ السكربتَ
   يتّصلُ بمتصفّحِ سكربتٍ آخرَ فيخرجُ بنتائجَ خاطئةٍ بصمت. */
const PORT = 9641, HTTP_PORT = 9642;
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
const sha = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 12);

const THEMES = ['', 'cyberpunk', 'gaming', 'glass', 'amkh'];

/* الأصنافُ التي يجبُ أن تتحرّكَ فعلًا، ومعها العنصرُ المتوقَّعُ حملُها. */
const ANIMATED = [
  ['المحرّك/الهالة', '.home-ic--engine .hic-aura'],
  ['المحرّك/الأرجل', '.home-ic--engine .hic-pin--t'],
  ['المحرّك/المسارات', '.home-ic--engine .hic-trace--a'],
  ['المحرّك/النواة', '.home-ic--engine .hic-core'],
  ['المحرّك/الفارس', '.home-ic--engine .hic-knight'],
  ['المحرّك/العين', '.home-ic--engine .hic-eye'],
  ['المحرّك/المسح', '.home-ic--engine .hic-scan'],
  ['المراحل/الكرة', '.home-ic--levels .hic-orb'],
  ['المراحل/الدرجات', '.home-ic--levels .hic-tr--a'],
  ['المراحل/النجمة', '.home-ic--levels .hic-star'],
  ['المراحل/الهالة', '.home-ic--levels .hic-halo'],
  ['المراحل/الشرر', '.home-ic--levels .hic-spk--a'],
  ['الألغاز/القطعة', '.home-ic--puzzles .hic-pc'],
  ['الألغاز/المحجر', '.home-ic--puzzles .hic-sock'],
  ['الألغاز/الوميض', '.home-ic--puzzles .hic-flash'],
  ['الألغاز/الحلقة', '.home-ic--puzzles .hic-ring'],
  ['الألغاز/الدروز', '.home-ic--puzzles .hic-lock'],
  ['الشريط/الكأس', '.appbar-ic--trophy .abi-trophy'],
  ['الشريط/لمعةُ الكأس', '.appbar-ic--trophy .abi-shine'],
  ['الشريط/شررُ الكأس', '.appbar-ic--trophy .abi-spk--a'],
  ['الشريط/البيدق', '.appbar-ic--pawn .abi-pawn'],
  ['الشريط/لمعةُ البيدق', '.appbar-ic--pawn .abi-shine'],
];
/* أيقوناتُ الشريطِ الخمسُ ومقاسُها الواجب */
const BAR = ['pawn', 'account', 'friends', 'trophy', 'gear'];
/* رسائلُ خطأٍ من الخادمِ كانت تُسرَّبُ عربيّةً في الواجهةِ الإنجليزيّة */
const LEAKS = ['أنتم أصدقاء بالفعل', 'الطلب مُرسَل بالفعل', 'لا يمكن إرسال الطلب',
  'اللاعب غير موجود', 'لا يمكنك إضافة نفسك'];

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const profile = path.join(os.tmpdir(), 'amkh-b67ic-' + Date.now());
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
  const J = async expr => {
    const raw = await evalJS('JSON.stringify(' + expr + ')');
    if (raw && typeof raw === 'object' && raw.__err) throw new Error('eval: ' + raw.__err);
    if (typeof raw !== 'string') throw new Error('eval returned ' + JSON.stringify(raw) + ' for ' + expr.slice(0, 80));
    return JSON.parse(raw);
  };
  const grab = async clip => {
    const r = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: clip.s || 1 },
    });
    return r.result && r.result.data ? Buffer.from(r.result.data, 'base64') : null;
  };
  const save = (file, buf) => { if (buf) fs.writeFileSync(path.join(SHOTS, file), buf); return !!buf; };
  const setTheme = t => evalJS(t
    ? `document.body.setAttribute('data-ui-theme','${t}'),1`
    : `document.body.removeAttribute('data-ui-theme'),1`);
  const reduce = on => send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }],
  });

  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 100; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(300); }
  await sleep(2500);

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
  /* زرُّ الأصدقاءِ مخفيٌّ قبلَ تسجيلِ الدخول؛ نُظهِرُه لنقيسَه ونصوّرَه فقط. */
  /* زرُّ الأصدقاءِ مخفيٌّ قبلَ تسجيلِ الدخول، و auth-client يُعيدُ إخفاءَه
     في كلِّ updateUI؛ فقاعدةُ ورقةِ أنماطٍ بـ!important أقوى من نمطِ السطرِ
     العاديِّ فتُبقيه ظاهرًا للقياسِ والتصويرِ وحدَهما. */
  await evalJS(`(function(){ try{ if(window.Nav&&Nav.go) Nav.go('s-menu'); }catch(e){}
    var s=document.createElement('style'); s.id='b67-probe';
    s.textContent='#appbar-friends{display:inline-flex !important}';
    document.head.appendChild(s);
    return 1; })()`);
  await sleep(900);

  /* ══ أ) بنيةُ العلامةِ الجديدة ══ */
  const struct = await J(`(function(){
    function n(s){ return document.querySelectorAll(s).length; }
    return {
      engPins: n('.home-ic--engine .hic-pin'),
      engTraces: n('.home-ic--engine .hic-trace'),
      engKnight: n('.home-ic--engine .hic-knight'),
      engCore: n('.home-ic--engine .hic-core'),
      lvlTreads: n('.home-ic--levels .hic-tr'),
      lvlOrb: n('.home-ic--levels .hic-orb'),
      lvlStar: n('.home-ic--levels .hic-star'),
      pzSeam: n('.home-ic--puzzles .hic-seam'),
      pzLock: n('.home-ic--puzzles .hic-lock'),
      pzPc: n('.home-ic--puzzles .hic-pc'),
      dead: n('.hic-beads, .hic-eyeg, .hic-led'),
      barIcons: ${JSON.stringify(BAR)}.map(function(k){ return n('.appbar-ic--'+k); })
    };
  })()`);
  check('أ١ المحرّكُ رقاقةٌ كاملة: ٤ جهاتِ أرجلٍ و٤ مساراتٍ ونواةٌ وفارس',
    struct.engPins === 4 && struct.engTraces === 4 && struct.engKnight === 1 && struct.engCore === 1, struct);
  check('أ٢ المراحلُ سُلَّمٌ كامل: ٣ أسطحِ وميضٍ وكرةٌ ونجمة',
    struct.lvlTreads === 3 && struct.lvlOrb === 1 && struct.lvlStar === 1, struct);
  check('أ٣ الألغازُ أُحجيّةٌ كاملة: دروزٌ ووميضُ اشتباكٍ وقطعةٌ ناقصة',
    struct.pzSeam === 1 && struct.pzLock === 1 && struct.pzPc === 1, struct);
  check('أ٤ لا أثرَ لأيِّ صنفٍ محذوفٍ من النسخةِ السابقة', struct.dead === 0, struct.dead);
  check('أ٥ أيقوناتُ الشريطِ الخمسُ كلُّها موجودة (بيدق/حساب/أصدقاء/كأس/ترس)',
    struct.barIcons.every(c => c === 1), { BAR, got: struct.barIcons });

  /* ══ هـ) مقاسُ أيقوناتِ الشريط ══ */
  const sizes = await J(`(function(){
    var o={}; ${JSON.stringify(BAR)}.forEach(function(k){
      var e=document.querySelector('.appbar-ic--'+k);
      if(!e){ o[k]=null; return; }
      var r=e.getBoundingClientRect(); o[k]=[Math.round(r.width),Math.round(r.height)];
    }); return o; })()`);
  check('هـ مقاسُ أيقوناتِ الشريطِ الخمسِ ٢٢×٢٢ بلا شذوذ',
    BAR.every(k => sizes[k] && sizes[k][0] === 22 && sizes[k][1] === 22), sizes);

  /* ══ ب) الحركةُ حيّةٌ فعلًا ══ */
  const live = await J(`(function(){
    var out=[]; ${JSON.stringify(ANIMATED)}.forEach(function(p){
      var e=document.querySelector(p[1]);
      if(!e){ out.push([p[0],'مفقود']); return; }
      var c=getComputedStyle(e);
      var d=parseFloat(c.animationDuration)||0;
      if(c.animationName==='none'||!d) out.push([p[0],c.animationName,c.animationDuration]);
    }); return out; })()`);
  check('ب١ كلُّ صنفٍ متحرّكٍ (٢٢) له حركةٌ فعليّةٌ بمدّةٍ>٠', live.length === 0, live);

  /* الترسُ يدورُ عندَ اللمسِ فقط — نتحقّقُ بقاعدةِ :hover لا بالحالةِ الساكنة */
  const gearRule = await J(`(function(){
    var hit=false;
    for(var i=0;i<document.styleSheets.length;i++){
      var ss=document.styleSheets[i], rs=null;
      try{ rs=ss.cssRules; }catch(e){ continue; }
      if(!rs) continue;
      for(var j=0;j<rs.length;j++){
        var t=rs[j].selectorText||'';
        if(/:hover\\s+\\.abi-gear|:active\\s+\\.abi-gear/.test(t) && /abiGear/.test(rs[j].cssText)) hit=true;
      }
    }
    var st=getComputedStyle(document.querySelector('.appbar-ic--gear .abi-gear')).animationName;
    return { hoverRule: hit, staticName: st };
  })()`);
  check('ب٢ الترسُ ساكنٌ في الراحةِ ويدورُ عندَ اللمسِ فقط',
    gearRule.hoverRule === true && gearRule.staticName === 'none', gearRule);

  /* لقطاتٌ متتاليةٌ من نفسِ الأيقونةِ يجبُ أن تختلفَ — الحركةُ ليست دعوى */
  const rects = await J(`(function(){
    function box(sel){
      var e=document.querySelector(sel); if(!e) return null;
      var h=e.closest('.home-tile__icon, .home-hero__icon, .appbar__icon-btn, .appbar__brand-mark')||e;
      var r=h.getBoundingClientRect();
      return { x:Math.round(r.left), y:Math.round(r.top), w:Math.ceil(r.width), h:Math.ceil(r.height) };
    }
    return { engine: box('.home-ic--engine'), levels: box('.home-ic--levels'),
             puzzles: box('.home-ic--puzzles'), trophy: box('.appbar-ic--trophy'),
             pawn: box('.appbar-ic--pawn'), friends: box('.appbar-ic--friends'),
             account: box('.appbar-ic--account'), gear: box('.appbar-ic--gear') };
  })()`);
  const motionKeys = ['engine', 'levels', 'puzzles', 'trophy', 'pawn'];
  const frames = {};
  motionKeys.forEach(k => frames[k] = []);
  for (let s = 0; s < 5; s++) {
    for (const k of motionKeys) {
      if (!rects[k]) continue;
      const b = await grab({ ...rects[k], s: 4 });
      if (b) { frames[k].push(sha(b)); if (s === 0 || s === 2) save('b67-anim-' + k + '-' + s + '.png', b); }
    }
    await sleep(460);
  }
  const still = motionKeys.filter(k => new Set(frames[k]).size < 3);
  check('ب٣ لقطاتٌ متتاليةٌ من كلِّ أيقونةٍ متحرّكةٍ تختلفُ فعلًا (٥ عيّنات)',
    still.length === 0, { still, frames });

  /* لقطةُ الشريطِ الأعلى كاملًا في كلِّ سمةٍ — المراجعةُ بالعينِ في سياقِه */
  const barRect = await J(`(function(){
    var e=document.querySelector('#banner .appbar'); if(!e) return null;
    var r=e.getBoundingClientRect();
    return { x:0, y:Math.max(0,Math.floor(r.top)), w:Math.ceil(window.innerWidth), h:Math.ceil(r.height) };
  })()`);
  let barShots = 0;
  for (const t of THEMES) {
    await setTheme(t); await sleep(300);
    if (barRect && save('b67-appbar-' + (t || 'default') + '.png', await grab({ ...barRect, s: 3 }))) barShots++;
  }
  await setTheme('');
  check('ب٤ لقطةُ الشريطِ الأعلى في السماتِ الخمسِ محفوظة', barShots === THEMES.length, barShots);

  /* ══ و) شرطُ جوجو: الأصدقاءُ ≠ لاعبان ══ */
  const diffIc = await J(`(function(){
    function ds(sel){
      var e=document.querySelector(sel); if(!e) return [];
      return [].map.call(e.querySelectorAll('[d]'), function(p){ return p.getAttribute('d'); });
    }
    var a=ds('.appbar-ic--friends'), b=ds('.home-ic--online');
    var shared=a.filter(function(d){ return b.indexOf(d)>=0; });
    return { friendsPaths:a.length, onlinePaths:b.length, shared:shared };
  })()`);
  check('و أيقونةُ الأصدقاءِ لا تشاركُ «لاعبان» أيَّ مسارٍ (شرطُ جوجو الصريح)',
    diffIc.friendsPaths > 0 && diffIc.onlinePaths > 0 && diffIc.shared.length === 0, diffIc);

  /* ══ ز) التسرّبُ العربيُّ في الإنجليزيّة ══
     I18N.set('en') يُعيدُ تحميلَ الصفحةِ فيقتلُ الفحص؛ tin يترجمُ إلى
     الإنجليزيّةِ بلا تبديلِ لغةِ الواجهةِ وهو المسارُ نفسُه الذي يمرُّ به
     الكنسُ (translate) — فالنتيجةُ هي ما يراه المستخدمُ حرفًا بحرف. */
  const tr = await J(`(function(){
    if(!window.I18N||!I18N.tin) return { no:true };
    var bad=[];
    ${JSON.stringify(LEAKS)}.forEach(function(s){
      var out=I18N.tin('en', s);
      if(!out || out===s || /[\\u0600-\\u06FF]/.test(out)) bad.push([s,out]);
    });
    return { bad: bad, lang: I18N.lang };
  })()`);
  check('ز رسائلُ خطأِ الخادمِ كلُّها تُترجَمُ بلا حرفٍ عربيٍّ في الإنجليزيّة',
    tr && !tr.no && tr.bad.length === 0, tr);

  /* ══ ج) تقليلُ الحركةِ يُسكِنُ كلَّ شيء ══ */
  await reduce(true); await sleep(420);
  const moving = await J(`(function(){
    var bad=[];
    [].forEach.call(document.querySelectorAll('.home-ic [class*="hic-"], .appbar-ic [class*="abi-"]'), function(e){
      var c=getComputedStyle(e);
      if(c.animationName!=='none' && c.display!=='none') bad.push([e.getAttribute('class'), c.animationName]);
    });
    return bad.slice(0,10);
  })()`);
  check('ج تفضيلُ تقليلِ الحركةِ يُسكِنُ كلَّ حركاتِ hic-/abi- بلا استثناء',
    moving.length === 0, moving);

  /* ══ د) استقلالُ السمات ══
     لا يصحُّ تصويرُ مربّعِ الأيقونةِ نفسِه: خلفيّتُه من متغيّراتِ السمةِ فتختلفُ
     بحقٍّ من سمةٍ لأخرى. المقصودُ هو الرسمُ وحدَه. فنُنشئُ مسرحًا ثابتًا
     بخلفيّةٍ معتمةٍ واحدةٍ، ونستنسخُ فيه كلَّ SVG على حدةٍ ونصوّرُه — فأيُّ
     اختلافٍ بين السماتِ حينَها يعني أنّ لونًا في الرسمِ يتبعُ متغيّرَ سمةٍ
     (currentColor أو var) وهو ما نمنعُه. الحركةُ ساكنةٌ الآن (تقليلُ الحركةِ
     مفعَّلٌ) فالمقارنةُ حاسمةٌ لا عشوائيّة. */
  const ICONS = ['engine', 'levels', 'puzzles', 'trophy', 'pawn', 'friends', 'account', 'gear'];
  const SEL = {
    engine: '.home-ic--engine', levels: '.home-ic--levels', puzzles: '.home-ic--puzzles',
    trophy: '.appbar-ic--trophy', pawn: '.appbar-ic--pawn', friends: '.appbar-ic--friends',
    account: '.appbar-ic--account', gear: '.appbar-ic--gear',
  };
  const stage = await J(`(function(){
    var s=document.getElementById('b67-stage');
    if(!s){ s=document.createElement('div'); s.id='b67-stage';
      s.style.cssText='position:fixed;left:0;top:0;width:96px;height:96px;z-index:99999;'
        +'background:#101010;display:flex;align-items:center;justify-content:center;overflow:hidden';
      document.body.appendChild(s); }
    var r=s.getBoundingClientRect();
    return { x:Math.round(r.left), y:Math.round(r.top), w:96, h:96 };
  })()`);
  const mount = k => evalJS(`(function(){
    var s=document.getElementById('b67-stage'), src=document.querySelector('${SEL[k]}');
    s.innerHTML='';
    if(!src) return 0;
    var c=src.cloneNode(true);
    c.removeAttribute('class');
    c.style.cssText='width:88px;height:88px;display:block';
    s.appendChild(c); return 1;
  })()`);
  const hashes = {}; ICONS.forEach(k => hashes[k] = {});
  for (const t of THEMES) {
    await setTheme(t); await sleep(320);
    for (const k of ICONS) {
      if (!(await mount(k))) continue;
      await sleep(70);
      const b = await grab({ ...stage, s: 3 });
      if (b) {
        hashes[k][t || 'default'] = sha(b);
        if (!t) save('b67-icon-' + k + '.png', b);
      }
    }
  }
  await evalJS(`(function(){ var s=document.getElementById('b67-stage'); if(s) s.remove(); return 1; })()`);
  const themeDiff = ICONS.filter(k => Object.keys(hashes[k]).length !== THEMES.length
    || new Set(Object.values(hashes[k])).size !== 1);
  check('د رسمُ الأيقوناتِ الثمانِ متطابقٌ بالبكسلِ في السماتِ الخمس',
    themeDiff.length === 0, themeDiff.map(k => [k, hashes[k]]));

  /* أيقونتانِ مختلفتانِ لا يصحُّ أن يتطابقَ رسمُهما */
  check('و٢ رسمُ الأصدقاءِ يختلفُ فعلًا عن رسمِ الحسابِ والكأس',
    hashes.friends.default && hashes.friends.default !== hashes.account.default &&
    hashes.friends.default !== hashes.trophy.default,
    { friends: hashes.friends.default, account: hashes.account.default });

  await reduce(false); await setTheme('');

  console.log('──────────────');
  console.log('لقطات      ', SHOTS);
  console.log('نتيجة       ' + pass + ' ناجح / ' + fail + ' فاشل');
  try { ws.close(); } catch (e) {}
  edge.kill(); srv.close();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
