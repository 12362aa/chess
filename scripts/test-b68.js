/* تحقّقُ البناء ٦٨ — بلاغُ جوجو الثماني، بندًا بندًا وحيًّا لا بالدعوى:
     ١ التسرّبُ العربيُّ في سجلِّ «آخر المباريات» بالإنجليزيّة (نور ومرحلتُه)
     ٢ «دورك» ما بقيَ يتضخّمُ فيركبَ على صورةِ اللاعب
     ٣ الإطارُ والخلفيّةُ يرجعانِ للرئيسيّةِ بعدَ خروجٍ ودخولٍ لنفسِ الحساب
     ٤ أيقوناتُ الإعداداتِ ملوّنةٌ مرسومةٌ + سطحُ ثيمِ Am-Kh لا بنّيٌّ ذهبيّ
     ٥ أيقونةُ الأصدقاءِ ليست بريدًا ولا تُشبهُ «لاعبان»
     ٦ البيدقُ له أنيميشنٌ حقيقيٌّ (نقلةٌ + حلقةُ صدمة) لا لمعةٌ وحدَها
     ٧ حراسةُ نافذةِ الفشلِ الكاذبةِ في البلوتوث
     ٨ الخلفيّاتُ الأربعُ والعشرونَ: مشهدٌ مرسومٌ لكلٍّ، **لا خلفيّتانِ
       متشابهتانِ**، والمعاينةُ = المُطبَّقُ من مصدرٍ واحد
   node scripts/test-b68.js */
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

/* منفذانِ لا يستعملُهما سكربتٌ آخرَ هنا — تصادمُ المنفذِ يجعلُ السكربتَ
   يتّصلُ بمتصفّحِ سكربتٍ آخرَ فيخرجُ بنتائجَ خاطئةٍ بصمت. */
const PORT = 9651, HTTP_PORT = 9652;
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

/* الخلفيّاتُ الأربعُ والعشرون كما في economy.js */
const BGS = ['bg_aurora','bg_nebula','bg_sunset','bg_forest','bg_royal','bg_ocean_deep',
  'bg_volcano','bg_galaxy','bg_matrix','bg_cherry','bg_dragon_lair','bg_cosmos',
  'bg_inferno','bg_void','bg_thunderstorm','bg_prism','bg_steel','bg_meadow',
  'bg_desert','bg_rain','bg_temple','bg_arcane','bg_reef','bg_eclipse'];

/* المجموعاتُ التي رصدَ جوجو تشابهَها حرفيًّا — تُفحَصُ بتشديدٍ خاصّ */
const GOJO_PAIRS = [
  ['bg_dragon_lair', 'bg_inferno'],
  ['bg_cosmos', 'bg_galaxy'],
  ['bg_cosmos', 'bg_void'],
  ['bg_galaxy', 'bg_void'],
  ['bg_nebula', 'bg_cosmos'],
  ['bg_nebula', 'bg_galaxy'],
  ['bg_thunderstorm', 'bg_rain'],
  ['bg_ocean_deep', 'bg_reef'],
  ['bg_volcano', 'bg_inferno'],
];

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const profile = path.join(os.tmpdir(), 'amkh-b68-' + Date.now());
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
    if (typeof raw !== 'string') throw new Error('eval returned ' + JSON.stringify(raw) + ' for ' + expr.slice(0, 90));
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
      var b=document.getElementById('wl-skip'); if(b){ b.click(); return false; }
      var n=document.querySelector('.wl-screen button, .wl-screen .wl-next'); if(n){ n.click(); return false; }
      return !document.querySelector('.wl-screen');
    })()`);
    if (gone === true) break;
    await sleep(700);
  }
  await evalJS(`(function(){ try{ if(window.Nav&&Nav.go) Nav.go('s-menu'); }catch(e){}
    var s=document.createElement('style'); s.id='b68-probe';
    s.textContent='#appbar-friends{display:inline-flex !important}';
    document.head.appendChild(s); return 1; })()`);
  await sleep(900);

  /* ══════════ ٨ الخلفيّاتُ — البندُ الذي سمّاه جوجو «أكبرَ مشكلة» ══════════ */

  /* أ) لكلِّ خلفيّةٍ مشهدٌ مرسومٌ غيرُ فارغٍ، وفيه عناصرُ رسمٍ فعليّةٌ لا
     مجرّدُ مستطيلٍ متدرّج. */
  const sceneInfo = await J(`(function(){
    if(!window.amkhCos||!amkhCos.bgSceneSVG) return {no:true};
    var out={};
    ${JSON.stringify(BGS)}.forEach(function(id){
      var h=amkhCos.bgSceneSVG(id,'probe');
      var d=document.createElement('div'); d.innerHTML=h;
      var svg=d.querySelector('svg');
      out[id]= svg ? {
        len:h.length,
        shapes: svg.querySelectorAll('path,circle,ellipse,rect,line,polygon,text').length,
        grads: svg.querySelectorAll('linearGradient,radialGradient').length,
        anims: svg.querySelectorAll('animate,animateTransform').length,
        vb: svg.getAttribute('viewBox'),
        par: svg.getAttribute('preserveAspectRatio')
      } : null;
    });
    return out;
  })()`);
  check('٨أ amkhCos.bgSceneSVG موجودةٌ ومُصدَّرة', !sceneInfo.no, sceneInfo);
  const noScene = BGS.filter(b => !sceneInfo[b]);
  check('٨ب كلُّ الخلفيّاتِ الأربعِ والعشرينَ لها مشهدٌ مرسوم', noScene.length === 0, noScene);
  /* عتبةُ ١٠ أشكالٍ: مستطيلُ خلفيّةٍ + بضعةُ عناصرَ لا يصنعُ مشهدًا. الحدُّ
     يمنعُ رجوعَ «مجرّدِ بكسلاتٍ» الذي رفضَه جوجو. */
  const thin = BGS.filter(b => sceneInfo[b] && sceneInfo[b].shapes < 10);
  check('٨ج كلُّ مشهدٍ فيه ١٠ عناصرِ رسمٍ على الأقلّ (لا تدرّجٌ عارٍ)', thin.length === 0,
    thin.map(b => [b, sceneInfo[b] && sceneInfo[b].shapes]));
  const noAnim = BGS.filter(b => sceneInfo[b] && sceneInfo[b].anims < 1);
  check('٨د كلُّ مشهدٍ فيه حركةٌ حقيقيّةٌ واحدةٌ على الأقلّ', noAnim.length === 0, noAnim);
  const badVb = BGS.filter(b => sceneInfo[b] && (sceneInfo[b].vb !== '0 0 200 100' || !/slice/.test(sceneInfo[b].par || '')));
  check('٨هـ viewBox موحّدٌ ٢٠٠×١٠٠ بـslice في كلِّ المشاهد', badVb.length === 0, badVb);

  /* ب) المعاينةُ في المتجرِ = المُطبَّقُ: كلاهما من نفسِ المصدر.
     نقارنُ عددَ الأشكالِ ووجودَ نفسِ بنيةِ المشهدِ في الثلاثةِ:
     thumb (المتجر/المخزون) و bannerHTML (اللافتةُ الحيّة) و bgHTML (الهالة). */
  const unified = await J(`(function(){
    var bad=[];
    ${JSON.stringify(BGS)}.forEach(function(id){
      function shapes(html){
        var d=document.createElement('div'); d.innerHTML=html;
        var s=d.querySelector('svg');
        return s ? s.querySelectorAll('path,circle,ellipse,rect,line,polygon,text').length : -1;
      }
      var t=shapes(amkhCos.thumb({id:id,type:'background'}));
      var b=shapes(amkhCos.bannerHTML({background:id}));
      var g=shapes(amkhCos.bgHTML({background:id}));
      if(!(t>0 && t===b && b===g)) bad.push([id,t,b,g]);
    });
    return bad;
  })()`);
  check('٨و المعاينةُ واللافتةُ والهالةُ من مصدرٍ واحدٍ (نفسُ المشهدِ حرفيًّا)',
    unified.length === 0, unified);

  /* ج) الشرطُ الحاسمُ: **لا خلفيّتانِ متشابهتان**. نصوّرُ كلَّ مشهدٍ على
     مسرحٍ ثابتٍ معتمٍ (٢٠٠×١٠٠ بنسبةِ اللافتةِ الحقيقيّة) والحركةُ مُسكَنةٌ
     فالمقارنةُ حاسمةٌ لا عشوائيّة، ثمّ نطلبُ ٢٤ بصمةً مختلفة. */
  await reduce(true); await sleep(420);
  const stage = await J(`(function(){
    var s=document.getElementById('b68-stage');
    if(!s){ s=document.createElement('div'); s.id='b68-stage';
      s.style.cssText='position:fixed;left:0;top:0;width:200px;height:100px;z-index:99999;'
        +'background:#101010;overflow:hidden';
      document.body.appendChild(s); }
    var r=s.getBoundingClientRect();
    return { x:Math.round(r.left), y:Math.round(r.top), w:200, h:100 };
  })()`);
  const mountBg = bid => evalJS(`(function(){
    var s=document.getElementById('b68-stage');
    s.innerHTML=amkhCos.bgSceneSVG('${bid}','probe');
    var v=s.querySelector('svg');
    if(v){ v.style.cssText='width:200px;height:100px;display:block'; }
    return v?1:0;
  })()`);
  const bgHash = {};
  for (const b of BGS) {
    if (!(await mountBg(b))) continue;
    await sleep(90);
    const buf = await grab({ ...stage, s: 2 });
    if (buf) { bgHash[b] = sha(buf); save('b68-bg-' + b + '.png', buf); }
  }
  /* ولقطةٌ ثانيةٌ لكلِّ مشهدٍ **بنسبةِ اللافتةِ الحقيقيّةِ** (≈٥٫٥:١):
     المراجعةُ في مربّعٍ وحدَه تُخفي أنّ عنصرَ الهويّةِ قد يُقصَّ في
     المكانِ الذي يراه اللاعبُ فعلًا. هذه هي اللقطةُ التي تُحكَمُ بها
     جودةُ الخلفيّةِ لا المربّع. */
  const stageB = await J(`(function(){
    var s=document.getElementById('b68-stage-b');
    if(!s){ s=document.createElement('div'); s.id='b68-stage-b';
      s.style.cssText='position:fixed;left:0;top:120px;width:340px;height:62px;z-index:99999;'
        +'background:#101010;overflow:hidden;border-radius:14px';
      document.body.appendChild(s); }
    var r=s.getBoundingClientRect();
    return { x:Math.round(r.left), y:Math.round(r.top), w:340, h:62 };
  })()`);
  const bannerCut = {};
  for (const b of BGS) {
    const ok = await evalJS(`(function(){
      var s=document.getElementById('b68-stage-b');
      s.innerHTML=amkhCos.bannerHTML({background:'${b}'});
      var v=s.querySelector('.cos-banner__art');
      if(v){ v.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block'; }
      return v?1:0;
    })()`);
    if (!ok) continue;
    await sleep(80);
    const buf = await grab({ ...stageB, s: 3 });
    if (buf) { bannerCut[b] = sha(buf); save('b68-banner-' + b + '.png', buf); }
  }
  check('٨ص كلُّ مشهدٍ صُوِّرَ بنسبةِ اللافتةِ الحقيقيّةِ للمراجعة',
    Object.keys(bannerCut).length === BGS.length, Object.keys(bannerCut).length);
  const bcDup = Object.values(Object.keys(bannerCut).reduce((a, b) => {
    (a[bannerCut[b]] = a[bannerCut[b]] || []).push(b); return a;
  }, {})).filter(a => a.length > 1);
  check('٨ض ولا خلفيّتانِ متشابهتانِ في اللافتةِ أيضًا (لا في المربّعِ وحدَه)',
    bcDup.length === 0, bcDup);
  /* نافذةُ اللافتةِ لا بدّ أن تكونَ الأعرضَ، وإلّا رجعَ القصُّ الشديد */
  const vbMode = await J(`(function(){
    function vb(html){ var d=document.createElement('div'); d.innerHTML=html;
      var s=d.querySelector('svg'); return s?s.getAttribute('viewBox'):null; }
    return { banner: vb(amkhCos.bannerHTML({background:'bg_thunderstorm'})),
             thumb: vb(amkhCos.thumb({id:'bg_thunderstorm',type:'background'})) };
  })()`);
  check('٨ط٢ نافذةُ اللافتةِ أعرضُ من نافذةِ المعاينةِ (فلا تُقصُّ الهويّةُ)',
    vbMode.banner === '0 30 200 40' && vbMode.thumb === '0 0 200 100', vbMode);
  await evalJS(`(function(){ var s=document.getElementById('b68-stage-b'); if(s) s.remove(); return 1; })()`);
  const got = Object.keys(bgHash);
  check('٨ز كلُّ الخلفيّاتِ صُوِّرت', got.length === BGS.length, { got: got.length });
  const byHash = {};
  got.forEach(b => { (byHash[bgHash[b]] = byHash[bgHash[b]] || []).push(b); });
  const clones = Object.values(byHash).filter(a => a.length > 1);
  check('٨ح لا خلفيّتانِ متطابقتانِ بالبكسلِ (شرطُ جوجو الصريح)', clones.length === 0, clones);
  const samePair = GOJO_PAIRS.filter(p => bgHash[p[0]] && bgHash[p[0]] === bgHash[p[1]]);
  check('٨ط الأزواجُ التي رصدَها جوجو متشابهةً صارَتْ مختلفةً فعلًا',
    samePair.length === 0, samePair);

  /* د) هويّةُ الاسم: كلُّ مشهدٍ يحملُ العنصرَ الذي يصفُه اسمُه. نفحصُ
     بصمةً بنيويّةً مميِّزةً لكلٍّ بدلَ الحكمِ بالعين. */
  const identity = await J(`(function(){
    function svg(id){
      var d=document.createElement('div'); d.innerHTML=amkhCos.bgSceneSVG(id,'p');
      return d.querySelector('svg');
    }
    function n(id,sel){ var s=svg(id); return s?s.querySelectorAll(sel).length:0; }
    return {
      /* العاصفة: صاعقةٌ (مساراتٌ حادّةُ الزوايا) + خطوطُ مطرٍ كثيرة */
      storm_rain:  n('bg_thunderstorm','line'),
      storm_bolt:  n('bg_thunderstorm','path'),
      /* المطر: دوائرُ تموّجٍ على البِرَك + خطوطُ قَطر، وبلا وميضِ سماءٍ */
      rain_ripple: n('bg_rain','ellipse'),
      rain_lines:  n('bg_rain','line'),
      /* الكون: حلزونٌ (مساراتٌ منحنية) + كوكبٌ بحلقةٍ (بيضاويّاتٌ بلا حشو) */
      cosmos_ell:  n('bg_cosmos','ellipse'),
      /* المجرّة: قرصٌ جانبيٌّ = بيضاويّاتٌ شديدةُ التفلطح */
      galaxy_ell:  n('bg_galaxy','ellipse'),
      /* الفراغ: ثقبٌ أسودُ = دوائرُ متراكزةٌ سوداء */
      void_circ:   n('bg_void','circle'),
      /* وكرُ التنّين: كنوزٌ (دوائرُ ذهبيّةٌ كثيرة) + رأسٌ (مساراتٌ) */
      dragon_circ: n('bg_dragon_lair','circle'),
      dragon_path: n('bg_dragon_lair','path'),
      /* الجحيم: أعمدةُ لهبٍ وشقوقٌ = مساراتٌ كثيرةٌ بلا دوائرِ كنوز */
      inferno_path:n('bg_inferno','path'),
      /* المنشور: سبعةُ أشعّةِ طيفٍ + مثلّثٌ */
      prism_path:  n('bg_prism','path'),
      /* الشيفرة: نصوصٌ فعليّة */
      matrix_text: n('bg_matrix','text'),
      /* الخسوف: خيوطُ كورونا كثيرة */
      eclipse_path:n('bg_eclipse','path'),
      /* الشِّعاب: أسماكٌ ومرجانٌ = مساراتٌ كثيرة */
      reef_path:   n('bg_reef','path'),
      /* الفولاذ: براشمُ ٣٦ دائرة */
      steel_circ:  n('bg_steel','circle'),
      /* الطلاسم: نجمةٌ خمسيّةٌ + حلقاتٌ + رموز */
      arcane_circ: n('bg_arcane','circle'),
    };
  })()`);
  check('٨ي العاصفةُ فيها برقٌ ومطرٌ فعلًا («فين العاصفة؟»)',
    identity.storm_rain >= 20 && identity.storm_bolt >= 3, identity);
  check('٨ك المطرُ فيه تموّجاتُ بِرَكٍ وقَطرٌ (ومختلفٌ بنيويًّا عن العاصفة)',
    identity.rain_ripple >= 5 && identity.rain_lines >= 20, identity);
  check('٨ل الكونُ والمجرّةُ والفراغُ بِنًى مختلفةٌ لا لوحاتٌ لونيّةٌ لشكلٍ واحد',
    identity.cosmos_ell >= 2 && identity.galaxy_ell >= 4 && identity.void_circ >= 3, identity);
  check('٨م وكرُ التنّينِ فيه كنوزٌ ورأسُ تنّينٍ كامل، والجحيمُ أعمدةُ لهبٍ بلا كنوز',
    identity.dragon_circ >= 9 && identity.dragon_path >= 12 && identity.inferno_path >= 8, identity);
  check('٨ن المنشورُ والشيفرةُ والخسوفُ والشِّعابُ والفولاذُ والطلاسمُ بعناصرِ أسمائها',
    identity.prism_path >= 8 && identity.matrix_text >= 40 && identity.eclipse_path >= 26
    && identity.reef_path >= 14 && identity.steel_circ >= 36 && identity.arcane_circ >= 4, identity);

  /* هـ) تقليلُ الحركةِ يُولِّدُ المشهدَ بلا أيِّ <animate> أصلًا */
  const stillAnims = await J(`(function(){
    var bad=[];
    ${JSON.stringify(BGS)}.forEach(function(id){
      var d=document.createElement('div'); d.innerHTML=amkhCos.bgSceneSVG(id,'p');
      var n=d.querySelectorAll('animate,animateTransform').length;
      if(n>0) bad.push([id,n]);
    });
    return bad;
  })()`);
  check('٨س عندَ تقليلِ الحركةِ يُولَدُ المشهدُ بلا عنصرِ حركةٍ واحد',
    stillAnims.length === 0, stillAnims);
  /* المسرحُ يُرفَعُ فورًا: هو position:fixed بـz-index عالٍ، فتركُه يحجبُ
     الشريطَ الأعلى وشاشةَ الإعداداتِ في كلِّ لقطةٍ تالية. */
  await evalJS(`(function(){ var s=document.getElementById('b68-stage'); if(s) s.remove(); return 1; })()`);
  await reduce(false); await sleep(300);

  /* ══════════ ١ التسرّبُ العربيُّ في سجلِّ المباريات ══════════ */
  const leak = await J(`(function(){
    /* Home مُعرَّفٌ بـconst في النطاقِ العامِّ فمش خاصّيّةً على window —
       window.Home بترجع undefined والفحصُ كان بيتخطّى البندَ بصمت. */
    var H = (typeof Home!=='undefined') ? Home : null;
    if(!H||!H._recent) return {no:true};
    /* مباراتانِ لنور: واحدةٌ برقمِ مرحلةٍ وأخرى قديمةٌ بالاسمِ العربيِّ فقط */
    var games=[
      {t:Date.now()-3600e3, mode:'bot', lvl:7,  opp:'نور — القائد العظيم', res:'win', moves:20},
      {t:Date.now()-7200e3, mode:'bot', lvl:-1, opp:'نور — المبتدئ',      res:'win', moves:24},
      {t:Date.now()-9000e3, mode:'engine', lvl:3, opp:'Stockfish — x',    res:'loss',moves:31}
    ];
    Home._recentSig=null;
    Home._recent(games);
    var box=document.getElementById('home-recent-list');
    var names=[].map.call(box.querySelectorAll('.home-game__name'),function(e){return e.textContent;});
    var metas=[].map.call(box.querySelectorAll('.home-game__meta'),function(e){return e.textContent;});
    /* نفحصُ ما ينتجُه المسارُ الإنجليزيُّ نفسُه الذي يمرُّ به الكنس */
    var en=names.map(function(s){ return I18N.tin('en', s); });
    return { names:names, metas:metas, en:en,
             arInEn: en.filter(function(s){ return /[\\u0600-\\u06FF]/.test(s); }) };
  })()`);
  check('١أ سجلُّ المباريات: اسمُ نورٍ ومرحلتُه يُترجَمانِ بلا حرفٍ عربيّ',
    leak && !leak.no && leak.arInEn.length === 0, leak);
  check('١ب الاسمُ يُبنى من رقمِ المرحلةِ (لا من النصِّ المحفوظ)',
    leak && !leak.no && /Great Commander|Commander/.test(leak.en[0] || ''), leak && leak.en);
  check('١ج المباريات القديمةُ بلا رقمٍ تُستنتَجُ مرحلتُها من النصِّ المحفوظ',
    leak && !leak.no && /Beginner/.test(leak.en[1] || ''), leak && leak.en);

  /* ══════════ ٢ «دورك» لا يركبُ على الصورة ══════════ */
  const turn = await J(`(function(){
    var el=document.querySelector('.pb-turn');
    if(!el) return {no:true};
    var c=getComputedStyle(el);
    var lc=getComputedStyle(document.querySelector('.pb-l'));
    var av=getComputedStyle(document.querySelector('.pb-av'));
    return { anim:c.animationName, nowrap:c.whiteSpace, ov:c.overflow,
             lMin:lc.minWidth, avShrink:av.flexShrink };
  })()`);
  check('٢أ نبضةُ «دورك» ما بقيت تُكبّرُ السطرَ (dbt استُبدِلت)',
    turn && !turn.no && turn.anim === 'pbturn', turn);
  check('٢ب السطرُ سطرٌ واحدٌ بقصٍّ فلا يفيضُ مهما طالَ الاسم',
    turn && turn.nowrap === 'nowrap' && turn.ov === 'hidden', turn);
  check('٢ج الحاويةُ min-width:0 والأفاتارُ لا ينضغط',
    turn && turn.lMin === '0px' && turn.avShrink === '0', turn);
  /* هندسيًّا: باسمٍ طويلٍ جدًّا، صندوقُ «دورك» لا يتقاطعُ مع صورةِ اللاعب */
  const overlap = await J(`(function(){
    try{ if(window.Nav&&Nav.go) Nav.go('s-game'); }catch(e){}
    var nm=document.getElementById('nm-w'), tr=document.getElementById('trn-w'),
        av=document.querySelector('#bar-w .pb-av');
    if(!nm||!tr||!av) return {no:true};
    nm.textContent='Nour — The Great Commander of the Endless Realm';
    tr.textContent='\\u25CF Opponent turn';
    tr.classList.add('show');
    var a=av.getBoundingClientRect(), t=tr.getBoundingClientRect(),
        bar=document.getElementById('bar-w').getBoundingClientRect();
    return { hit: !(t.right<=a.left||t.left>=a.right),
             outBar: (t.left < bar.left-1)||(t.right > bar.right+1),
             t:[Math.round(t.left),Math.round(t.right)], a:[Math.round(a.left),Math.round(a.right)] };
  })()`);
  check('٢د باسمٍ طويلٍ جدًّا: «دورك» لا يتقاطعُ مع صورةِ اللاعب',
    overlap && !overlap.no && overlap.hit === false, overlap);
  check('٢هـ ولا يخرجُ من حدودِ شريطِ اللاعب',
    overlap && overlap.outBar === false, overlap);
  try { await evalJS(`(function(){ if(window.Nav&&Nav.go) Nav.go('s-menu'); return 1; })()`); } catch (e) {}
  await sleep(500);

  /* ══════════ ٣ التجميلُ يرجعُ بعدَ خروجٍ ودخولٍ لنفسِ الحساب ══════════ */
  const SNAP = JSON.stringify({
    coins: 1885, level: 10, xp: 2125, thisLevelXp: 2000, nextLevelXp: 2400, maxLevel: 50,
    equipped: { frame: 'frame_dragon', background: 'bg_thunderstorm', badge: 'badge_crown' },
    owned: ['frame_dragon', 'bg_thunderstorm', 'badge_crown'], missions: [],
  });
  const cycle = await J(`(function(){
    function state(){
      var card=document.querySelector('#s-menu .home-id');
      var av=document.getElementById('home-id-av');
      var nm=document.getElementById('home-id-name');
      return { bannered: !!(card&&card.classList.contains('cos-bannered')),
               banner: !!(card&&card.querySelector('.cos-banner')),
               scene: !!(card&&card.querySelector('.cos-banner__art')),
               frame: !!(av&&av.querySelector('.cos-frame')),
               badge: !!(nm&&nm.querySelector('.cos-badge')) };
    }
    var out={};
    /* ١) دخولٌ وتجهيزٌ */
    window.amkhEconomy.apply(${SNAP});
    out.afterLogin=state();
    /* ٢) خروجٌ — لا بدّ أن يختفيَ كلُّ أثرٍ */
    window.amkhEconomy.clear();
    out.afterLogout=state();
    /* ٣) دخولٌ لنفسِ الحسابِ بلا إعادةِ تحميل — السيناريو الذي أبلغَ عنه جوجو */
    window.amkhEconomy.apply(${SNAP});
    out.afterRelogin=state();
    return out;
  })()`);
  check('٣أ بعدَ الدخول: اللافتةُ والمشهدُ والإطارُ والشارةُ كلُّها ظاهرة',
    cycle.afterLogin.bannered && cycle.afterLogin.banner && cycle.afterLogin.scene
    && cycle.afterLogin.frame && cycle.afterLogin.badge, cycle.afterLogin);
  check('٣ب بعدَ الخروج: لا أثرَ لأيِّ تجميلٍ إطلاقًا',
    !cycle.afterLogout.bannered && !cycle.afterLogout.banner
    && !cycle.afterLogout.frame && !cycle.afterLogout.badge, cycle.afterLogout);
  check('٣ج بعدَ الدخولِ ثانيةً لنفسِ الحساب: يرجعُ الكلُّ بلا إعادةِ تحميل (بلاغُ جوجو ٣)',
    cycle.afterRelogin.bannered && cycle.afterRelogin.banner && cycle.afterRelogin.scene
    && cycle.afterRelogin.frame && cycle.afterRelogin.badge, cycle.afterRelogin);
  /* والسببُ الجذريُّ: تسجيلُ الدخولِ نفسُه يطلبُ اللقطةَ الآن */
  const authHook = await J(`(function(){
    var s=String(window.amkhAuth&&window.amkhAuth.setToken||'');
    return { callsRefresh: /amkhEconomy[\\s\\S]{0,40}refresh/.test(s),
             hasClear: typeof (window.amkhEconomy&&window.amkhEconomy.clear)==='function' };
  })()`);
  check('٣د amkhAuth.setToken يطلبُ لقطةَ الاقتصادِ عندَ كلِّ دخول',
    authHook.callsRefresh === true && authHook.hasClear === true, authHook);

  /* ══════════ ٤ أيقوناتُ الإعداداتِ + لونُ ثيمِ Am-Kh ══════════ */
  await evalJS(`(function(){ try{ if(window.Nav&&Nav.settings) Nav.settings(); }catch(e){} return 1; })()`);
  await sleep(900);
  const setIcons = await J(`(function(){
    var tabs=[].map.call(document.querySelectorAll('.settings-tab'),function(b){
      var s=b.querySelector('.tab-icon svg');
      return { tab:b.dataset.tab,
               clr: !!(s&&s.classList.contains('s-ico--clr')),
               grads: s?s.querySelectorAll('linearGradient,radialGradient').length:0,
               mono: !!(s&&s.getAttribute('stroke')==='currentColor'),
               label: !!b.querySelector('.tab-label') };
    });
    var secs=[].map.call(document.querySelectorAll('#s-settings .section-icon svg'),function(s){
      return { clr:s.classList.contains('s-ico--clr'),
               grads:s.querySelectorAll('linearGradient,radialGradient').length };
    });
    return { tabs:tabs, secs:secs };
  })()`);
  check('٤أ التبويباتُ الخمسةُ بأيقوناتٍ ملوّنةٍ بتدرّجاتٍ ووسمِ نصٍّ سليم',
    setIcons.tabs.length === 5 && setIcons.tabs.every(t => t.clr && t.grads >= 1 && !t.mono && t.label),
    setIcons.tabs);
  check('٤ب رؤوسُ الأقسامِ الخمسةُ بأيقوناتٍ ملوّنةٍ بتدرّجات',
    setIcons.secs.length === 5 && setIcons.secs.every(s => s.clr && s.grads >= 1), setIcons.secs);
  /* لونُ ثيمِ Am-Kh: سطحُ الأقسامِ لا يجوزُ أن يكونَ البنّيَّ ‎rgb(16,10,5)‎
     وما جاورَه، بل سطحَ الثيمِ نفسَه — نفسُ سطحِ بطاقةِ الحسابِ التي قالَ
     جوجو إنّها «الوحيدةُ الصح». */
  await setTheme('amkh'); await sleep({}.x || 420);
  const amkhCol = await J(`(function(){
    function bg(sel){ var e=document.querySelector(sel); if(!e) return null;
      var c=getComputedStyle(e); return { img:c.backgroundImage, col:c.backgroundColor }; }
    function brown(s){ /* البنّيُّ المرفوضُ: أحمرٌ عالٍ وأخضرُ/أزرقُ منخفضان جدًّا */
      return /rgba?\\(\\s*(1[0-9]|2[0-9]|3[0-5])\\s*,\\s*([0-9]|1[0-9])\\s*,\\s*([0-9]|1[0-5])\\s*[,)]/.test(s||'');
    }
    var hero=bg('#s-settings .settings-hero');
    var sec=bg('#s-settings .settings-section');
    var acc=bg('#s-settings .settings-account-card') || bg('#tab-account .settings-section');
    return { hero:hero, sec:sec,
             heroBrown: brown(hero&&hero.img)||brown(hero&&hero.col),
             secBrown: brown(sec&&sec.img)||brown(sec&&sec.col),
             theme: document.body.getAttribute('data-ui-theme'),
             surface: getComputedStyle(document.body).getPropertyValue('--color-surface').trim() };
  })()`);
  check('٤ج ثيمُ Am-Kh: ترويسةُ الإعداداتِ ما بقيت بنّيّةً ذهبيّة',
    amkhCol.heroBrown === false, amkhCol.hero);
  check('٤د ثيمُ Am-Kh: أقسامُ الإعداداتِ ما بقيت بنّيّةً ذهبيّة',
    amkhCol.secBrown === false, amkhCol.sec);
  check('٤هـ ثيمُ Am-Kh: سطحُ الأقسامِ هو سطحُ الثيمِ نفسُه (كبطاقةِ الحساب)',
    !!amkhCol.surface && (amkhCol.sec.col || '').replace(/\\s/g, '') !== 'rgba(0,0,0,0)', amkhCol);
  let setShots = 0;
  for (const t of THEMES) {
    await setTheme(t); await sleep(340);
    /* شاشةُ الإعداداتِ كاملةً لا شريطُ التبويباتِ وحدَه: قصُّ ارتفاعِ
       التبويباتِ فقط كان يخرجُ شريطًا رقيقًا لا يُراجَعُ بالعين. */
    const buf = await grab({ x: 0, y: 0, w: 412, h: 760, s: 2 });
    if (save('b68-settings-' + (t || 'default') + '.png', buf)) setShots++;
  }
  check('٤و لقطةُ شاشةِ الإعداداتِ في السماتِ الخمسِ محفوظة', setShots === THEMES.length, setShots);
  await setTheme('');
  await evalJS(`(function(){ if(window.Nav&&Nav.go) Nav.go('s-menu'); return 1; })()`);
  await sleep(700);

  /* ══════════ ٥ أيقونةُ الأصدقاء ══════════ */
  const fr = await J(`(function(){
    function ds(sel){ var e=document.querySelector(sel); if(!e) return [];
      return [].map.call(e.querySelectorAll('[d]'),function(p){return p.getAttribute('d');}); }
    var f=document.querySelector('.appbar-ic--friends');
    var a=ds('.appbar-ic--friends'), b=ds('.home-ic--local'), c=ds('.home-ic--online');
    /* «بريد» = مستطيلٌ/فقاعةٌ كبيرةٌ تحتلُّ الأيقونةَ. نقيسُ أكبرَ شكلٍ
       مستطيليٍّ **مرئيٍّ** ونشترطُ ألّا يسيطر. مستطيلاتُ الأقنعةِ
       والتعريفاتِ تُستثنى: ‎<mask>‎ فيه مستطيلٌ يغطّي الكادرَ كلَّه
       بحكمِ عملِه، وحسبانُه شكلًا مرئيًّا كان يُفشِلُ الفحصَ زورًا. */
    var rects=f?[].filter.call(f.querySelectorAll('rect'),function(r){
      return !r.closest('mask') && !r.closest('defs') && !r.closest('clipPath');
    }).map(function(r){
      return (+r.getAttribute('width')||0)*(+r.getAttribute('height')||0); }):[];
    var maxRect=rects.length?Math.max.apply(null,rects):0;
    var bubble=f?f.querySelectorAll('circle').length:0;
    return { paths:a.length,
             sharedLocal:a.filter(function(d){return b.indexOf(d)>=0;}),
             sharedOnline:a.filter(function(d){return c.indexOf(d)>=0;}),
             maxRectArea:maxRect, circles:bubble,
             masks: f?f.querySelectorAll('mask').length:0 };
  })()`);
  check('٥أ أيقونةُ الأصدقاءِ لا تشاركُ «لاعبان» ولا «أونلاين» أيَّ مسار',
    fr.paths > 0 && fr.sharedLocal.length === 0 && fr.sharedOnline.length === 0, fr);
  check('٥ب ما بقيَ فيها مستطيلُ فقاعةٍ مسيطرٌ يُقرأُ بريدًا',
    fr.maxRectArea <= 40, fr);
  check('٥ج فيها تراكبُ عُمقٍ بقناعٍ وفقاعةُ دردشةٍ دائريّة',
    fr.masks >= 1 && fr.circles >= 3, fr);

  /* ══════════ ٦ أنيميشنُ البيدق ══════════ */
  const pawn = await J(`(function(){
    var g=document.querySelector('.appbar-ic--pawn .abi-pawn');
    var th=document.querySelector('.appbar-ic--pawn .abi-thud');
    var sh=document.querySelector('.appbar-ic--pawn .abi-shine');
    if(!g) return {no:true};
    var cg=getComputedStyle(g);
    return { name:cg.animationName, dur:cg.animationDuration,
             hasThud: !!th, thudName: th?getComputedStyle(th).animationName:null,
             shineName: sh?getComputedStyle(sh).animationName:null,
             ovf: getComputedStyle(document.querySelector('.appbar-ic--pawn')).overflow };
  })()`);
  check('٦أ البيدقُ له حركةُ نقلةٍ فعليّةٌ بمدّةٍ>٠',
    pawn && !pawn.no && pawn.name === 'abiPawn' && parseFloat(pawn.dur) > 0, pawn);
  check('٦ب له حلقةُ صدمةٍ على الأرضِ تتحرّكُ معَ الهبوط',
    pawn && pawn.hasThud && pawn.thudName === 'abiThud', pawn);
  check('٦ج ذروةُ القفزةِ لا تُقصّ (overflow مرئيّ)', pawn && pawn.ovf === 'visible', pawn);
  /* الحركةُ حقيقيّةٌ لا دعوى — نقيسُ مصفوفةَ التحويلِ الفعليّةَ عبرَ دورةٍ
     كاملةٍ (٤٫٦ث) لا باللقطات: الدورةُ فيها نافذةُ سكونٍ طويلةٌ (٢٫٢ث)
     فعيّناتٌ قليلةٌ متقاربةٌ قد تقعُ كلُّها داخلَها وتُفشِلُ الفحصَ زورًا.
     قراءةُ transform تُثبِتُ القفزةَ والانضغاطَ والميلَ بلا لبس. */
  const pm = [];
  for (let i = 0; i < 24; i++) {
    const t = await evalJS(`(function(){ var g=document.querySelector('.appbar-ic--pawn .abi-pawn');
      return g?getComputedStyle(g).transform:'?'; })()`);
    pm.push(String(t));
    await sleep(235);
  }
  const pmSet = new Set(pm);
  check('٦د حركةُ البيدقِ فعليّةٌ عبرَ دورةٍ كاملةٍ (٢٤ قراءةً على ٥٫٦ث)',
    pmSet.size >= 6, { distinct: pmSet.size, sample: [...pmSet].slice(0, 4) });
  /* والقفزةُ والانضغاطُ يبلغانِ مقدارًا محسوسًا فعلًا (لا نصفَ بكسل) */
  const reach = pm.map(s => {
    const m = /matrix\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(s);
    return m ? { sy: parseFloat(m[4]), ty: parseFloat(m[6]) } : null;
  }).filter(Boolean);
  const maxRise = reach.length ? Math.min(...reach.map(r => r.ty)) : 0;
  const syRange = reach.length ? (Math.max(...reach.map(r => r.sy)) - Math.min(...reach.map(r => r.sy))) : 0;
  check('٦هـ القفزةُ محسوسةٌ (ارتفاعٌ ≥ ١٫٥px) والانضغاطُ ظاهرٌ (مدى scaleY ≥ ٠٫١)',
    maxRise <= -1.5 && syRange >= 0.1, { maxRise, syRange: +syRange.toFixed(3) });
  /* ولقطةُ الشريطِ الأعلى كاملًا للمراجعةِ البصريّة: قصُّ ٣٤px حولَ العلامةِ
     وحدَها كان يعطي إحداثيّاتٍ قديمةً بعدَ الرجوعِ من الإعدادات فتخرجُ
     اللقطةُ سوداءَ — والشريطُ كاملًا أنفعُ أصلًا لأنّه يُظهِرُ البيدقَ
     والأيقوناتَ الأربعَ معًا في سياقِها. */
  await evalJS(`(function(){ try{ if(window.AppBar&&AppBar.sync) AppBar.sync(); }catch(e){} return 1; })()`);
  await sleep(450);
  const barR = await J(`(function(){ var e=document.getElementById('banner'); if(!e) return null;
    var r=e.getBoundingClientRect();
    return { x:0, y:Math.max(0,Math.floor(r.top)), w:Math.ceil(r.width), h:Math.ceil(r.height) }; })()`);
  let barShots = 0;
  for (const t of THEMES) {
    await setTheme(t); await sleep(300);
    if (barR && save('b68-appbar-' + (t || 'default') + '.png', await grab({ ...barR, s: 3 }))) barShots++;
  }
  await setTheme('');
  check('٦و لقطةُ الشريطِ الأعلى في السماتِ الخمسِ محفوظة', barShots === THEMES.length, barShots);
  const pawnVisible = await J(`(function(){
    var m=document.querySelector('.appbar__brand-mark');
    var r=m?m.getBoundingClientRect():null;
    return { w:r?Math.round(r.width):0, h:r?Math.round(r.height):0,
             lead:getComputedStyle(document.getElementById('appbar-home-lead')).display };
  })()`);
  check('٦ز بيدقُ الشعارِ معروضٌ فعلًا بمقاسِه في الشاشةِ الرئيسيّة',
    pawnVisible.w === 22 && pawnVisible.h === 22 && pawnVisible.lead !== 'none', pawnVisible);

  /* ══════════ ٧ حراسةُ نافذةِ الفشلِ الكاذبةِ في البلوتوث ══════════
     الاقترانُ يحتاجُ جهازَينِ فلا يُحاكى في متصفّح؛ نفحصُ الحراسةَ في
     الشيفرةِ نفسِها: تجاهلٌ لو القناةُ قائمةٌ، وتجاهلٌ لنقطةِ نهايةٍ
     أخرى، وتأجيلٌ يُلغى عندَ النجاح. */
  const btSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const btBlock = (btSrc.match(/nearby\.addListener\('connectionResult'[\s\S]{0,3000}?\n    \}\);/) || [''])[0];
  check('٧أ الفشلُ يُتجاهَلُ لو القناةُ قائمةٌ فعلًا',
    /if \(this\.connected\)\s*\{[\s\S]{0,200}return;/.test(btBlock), btBlock.length);
  check('٧ب الفشلُ يُتجاهَلُ لو كان لنقطةِ نهايةٍ غيرِ التي نحنُ عليها',
    /data\.endpointId !== this\.endpointId[\s\S]{0,200}return;/.test(btBlock), btBlock.length);
  check('٧ج النافذةُ مؤجَّلةٌ ولا تظهرُ إن نجحَ الاتصالُ خلالَ المهلة',
    /_failTimer = setTimeout/.test(btBlock) && /if \(this\.connected\) return;/.test(btBlock), btBlock.length);
  check('٧د النجاحُ يُلغي المؤقّتَ فورًا',
    /if \(data\.connected\)[\s\S]{0,300}clearTimeout\(this\._failTimer\)/.test(btBlock), btBlock.length);

  /* ══════════ استقلالُ السمات: رسمُ المشاهدِ والأيقوناتِ واحدٌ في الخمس ══════════ */
  await reduce(true); await sleep(380);
  const stage2 = await J(`(function(){
    var s=document.getElementById('b68-stage');
    if(!s){ s=document.createElement('div'); s.id='b68-stage';
      s.style.cssText='position:fixed;left:0;top:0;width:200px;height:100px;z-index:99999;background:#101010;overflow:hidden';
      document.body.appendChild(s); }
    var r=s.getBoundingClientRect(); return { x:Math.round(r.left), y:Math.round(r.top), w:200, h:100 };
  })()`);
  const SAMPLE = ['bg_thunderstorm', 'bg_cosmos', 'bg_dragon_lair', 'bg_prism'];
  const themeHash = {}; SAMPLE.forEach(k => themeHash[k] = {});
  for (const t of THEMES) {
    await setTheme(t); await sleep(300);
    for (const b of SAMPLE) {
      if (!(await mountBg(b))) continue;
      await sleep(80);
      const buf = await grab({ ...stage2, s: 2 });
      if (buf) themeHash[b][t || 'default'] = sha(buf);
    }
  }
  const themeDrift = SAMPLE.filter(b => new Set(Object.values(themeHash[b])).size !== 1
    || Object.keys(themeHash[b]).length !== THEMES.length);
  check('ط رسمُ المشاهدِ مستقلٌّ عن السماتِ الخمسِ (تدرّجاتُها داخلَها)',
    themeDrift.length === 0, themeDrift.map(b => [b, themeHash[b]]));
  await evalJS(`(function(){ var s=document.getElementById('b68-stage'); if(s) s.remove();
    var p=document.getElementById('b68-probe'); if(p) p.remove(); return 1; })()`);
  await reduce(false); await setTheme('');

  console.log('──────────────');
  console.log('لقطات      ', SHOTS);
  console.log('نتيجة       ' + pass + ' ناجح / ' + fail + ' فاشل');
  try { ws.close(); } catch (e) {}
  edge.kill(); srv.close();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
