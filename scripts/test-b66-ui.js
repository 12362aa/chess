/* تحقّقٌ حيٌّ من بلاغاتِ جوجو ٢..٦ و٨ في البناء ٦٦.
   يفتحُ index.html الحقيقيَّ في Edge بلا واجهةٍ عبرَ CDP خامًّا (بلا مكتبات
   تصفّحٍ إضافيّة)، ثمّ يفحصُ الشجرةَ والأنماطَ المحسوبةَ فحصًا صريحًا:
     ٢) أيقونةُ «تحدّياتِ اليوم»: مرسومةٌ ومتحرّكةٌ بلا مربّعٍ أصفرَ خلفَها.
     ٣) أيقوناتُ الألغاز/المتجرِ/الجوائزِ في الرئيسيّة: SVG ملوّنٌ مرسوم.
     ٤) أزرارُ التصنيفِ في المتجرِ والمخزون: لكلٍّ أيقونةٌ ملوّنةٌ + تصفيةٌ تعمل.
     ٥) عملةُ AK في المتجرِ/المخزونِ/الجوائزِ = عملةُ الرئيسيّةِ نفسُها (لامعةٌ متحرّكة).
     ٦) عملةُ الرئيسيّة: بلا مربّعٍ/مستطيلٍ أصفرَ خلفَها.
     ٨) خلفيّةُ الطرفِ الآخرِ تظهرُ في سطرِ الأصدقاءِ/الطلبِ/البحثِ بلا أذًى.
   node scripts/test-b66-ui.js */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

/* منفذانِ غيرُ شائعَينِ تفاديًا لتصادمِ المنافذِ مع أيِّ جلسةٍ أخرى */
const PORT = 9527, HTTP_PORT = 9528;
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

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + '   ' + JSON.stringify(info)); }
}

async function main() {
  const srv = await serve();
  const profile = path.join(os.tmpdir(), 'amkh-b66ui-' + Date.now());
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--window-size=412,915',
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
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 100; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(300); }
  await sleep(2500);

  /* ══ ٦) عملةُ الرئيسيّة: بلا مربّعٍ أصفرَ خلفَها ══ */
  const pill = await J(`(function(){
    var b=document.getElementById('home-econ-coins'); if(!b) return {miss:1};
    var cs=getComputedStyle(b);
    return { bg:cs.backgroundColor, bgi:cs.backgroundImage, bw:cs.borderTopWidth, bs:cs.borderTopStyle, pad:cs.paddingTop };
  })()`);
  check('٦ عملةُ الرئيسيّةِ بلا مربّعٍ أصفر',
    !pill.miss && /rgba\(0, 0, 0, 0\)|transparent/.test(pill.bg) && pill.bgi === 'none' && pill.bw === '0px', pill);

  /* ══ ٢) أيقونةُ التحدّيات: مرسومةٌ ومتحرّكةٌ وبلا صندوقٍ خلفَها ══ */
  const chal = await J(`(function(){
    var host=document.querySelector('.home-daily__icon'); if(!host) return {miss:1};
    var svg=host.querySelector('svg.home-daily__chal');
    var cs=getComputedStyle(host);
    return {
      svg: !!svg,
      anims: svg ? svg.querySelectorAll('animate,animateTransform').length : 0,
      grads: svg ? svg.querySelectorAll('linearGradient,radialGradient').length : 0,
      oldGem: !!host.querySelector('.home-daily__gem'),
      bg: cs.backgroundColor, bgi: cs.backgroundImage, bw: cs.borderTopWidth
    };
  })()`);
  check('٢ أيقونةُ التحدّياتِ مرسومةٌ ومتحرّكة',
    !chal.miss && chal.svg && chal.anims >= 3 && chal.grads >= 2 && !chal.oldGem, chal);
  check('٢ بلا مربّعٍ أصفرَ خلفَ أيقونةِ التحدّيات',
    !chal.miss && /rgba\(0, 0, 0, 0\)|transparent/.test(chal.bg) && chal.bgi === 'none' && chal.bw === '0px', chal);

  /* ══ ٣) أيقوناتُ الألغاز/المتجرِ/الجوائزِ في الرئيسيّة ══ */
  const tiles = await J(`(function(){
    var out=[];
    document.querySelectorAll('.home-tile').forEach(function(t){
      var svg=t.querySelector('.home-tile__icon svg.home-ic');
      if(!svg) return;
      out.push({ cls:t.className.replace('home-tile','').trim(),
        grads: svg.querySelectorAll('linearGradient,radialGradient').length,
        stops: svg.querySelectorAll('stop').length,
        paths: svg.querySelectorAll('path,rect,circle,ellipse').length,
        w: Math.round(svg.getBoundingClientRect().width) });
    });
    return out;
  })()`);
  check('٣ ثلاثُ أيقوناتٍ مرسومةٍ ملوّنةٍ في الرئيسيّة',
    tiles.length >= 3 && tiles.every(t => t.grads >= 1 && t.stops >= 2 && t.paths >= 3 && t.w > 0), tiles);

  /* ══ تجهيزُ حالةٍ اقتصاديّةٍ وهميّةٍ (بلا خادمٍ ولا تسجيلِ دخول) ══ */
  const setupEcon = await evalJS(`(function(){
    var FR=Object.keys(amkhCos.FRAME||{}), BG=Object.keys(amkhCos.BG||{}), BD=Object.keys(amkhCos.BADGE||{});
    window.__ids={ frame:FR.slice(0,3), background:BG.slice(0,3), badge:BD.slice(0,2) };
    var items=[];
    var push=function(type,ids,rar){ ids.forEach(function(idv,i){ items.push({ id:idv, type:type, rarity:rar[i%rar.length],
      price:120+i*40, ar:'عنصرٌ '+type+' '+(i+1), en:'Item '+type+' '+(i+1), inWindow:true }); }); };
    push('frame', FR.slice(0,3), ['common','epic','mythic']);
    push('background', BG.slice(0,3), ['rare','legendary','seasonal']);
    push('badge', BD.slice(0,2), ['common','epic']);
    items.push({ id:'cel_dragon', type:'celebration', rarity:'mythic', price:900, ar:'احتفالُ التنّين', en:'Dragon celebration', inWindow:true });
    items.push({ id:'fx_blackhole', type:'mate_fx', rarity:'legendary', price:700, ar:'ثقبٌ أسود', en:'Black hole', inWindow:true });
    window.__items=items;
    var owned=items.map(function(i){return i.id;});
    window.amkhEconomy.state = { coins:5400, xp:120, level:7, owned:owned,
      equipped:{ frame:FR[0], background:BG[0], badge:BD[0], celebration:'cel_dragon', mate_fx:'fx_blackhole' } };
    return items.length;
  })()`);

  /* ══ ٤+٥) المتجر: أزرارُ تصنيفٍ بأيقوناتٍ + عملةٌ موحّدة ══ */
  const store = await J(`(function(){
    var ov=document.getElementById('store-ov'); if(!ov) return {miss:1};
    ov.classList.add('open'); STORE._open=true;
    var data={ items:window.__items, serverNow:Date.now(), endsAt:Date.now()+3600000 };
    STORE._cur=data; STORE._filter=null; STORE._render(data);
    var chips=[].slice.call(document.querySelectorAll('#store-filters .store-chip'));
    return {
      chips: chips.length,
      withIcon: chips.filter(function(c){ return !!c.querySelector('.store-chip__ic svg'); }).length,
      withText: chips.filter(function(c){ var t=c.querySelector('.store-chip__tx'); return t && t.textContent.trim().length>0; }).length,
      onCount: chips.filter(function(c){ return c.classList.contains('is-on'); }).length,
      iconW: chips.length ? Math.round(chips[0].querySelector('.store-chip__ic').getBoundingClientRect().width) : 0,
      cards: document.querySelectorAll('#store-grid .store-card').length,
      buyCoins: document.querySelectorAll('.store-buy__coin svg.amkh-coin-svg').length,
      balCoin: !!document.querySelector('#store-balance-coin svg.amkh-coin-svg'),
      coinAnim: !!document.querySelector('#store-balance-coin svg.amkh-coin-svg animate'),
      coinW: (function(){ var c=document.querySelector('#store-balance-coin'); return c?Math.round(c.getBoundingClientRect().width):0; })()
    };
  })()`);
  check('٤ أزرارُ تصنيفِ المتجرِ بأيقوناتٍ ملوّنة',
    !store.miss && store.chips >= 4 && store.withIcon === store.chips && store.withText === store.chips
    && store.onCount === 1 && store.iconW > 10, store);
  check('٥ عملةُ المتجرِ = عملةُ الرئيسيّةِ (SVG لامعٌ متحرّك)',
    !store.miss && store.balCoin && store.coinAnim && store.coinW >= 18, store);

  /* تصفيةُ المتجرِ بالفعلِ تُغيّرُ المعروض */
  const filt = await J(`(function(){
    var before=document.querySelectorAll('#store-grid .store-card').length;
    var secBefore=document.querySelectorAll('#store-grid .store-sec').length;
    var chip=document.querySelector('#store-filters .store-chip[data-filter="background"]');
    if(!chip) return {miss:1};
    chip.click();
    return { before:before, secBefore:secBefore,
      after:document.querySelectorAll('#store-grid .store-card').length,
      secAfter:document.querySelectorAll('#store-grid .store-sec').length,
      onIsBg: !!document.querySelector('#store-filters .store-chip.is-on[data-filter="background"]') };
  })()`);
  check('٤ تصفيةُ المتجرِ تعملُ فعلًا',
    !filt.miss && filt.secAfter === 1 && filt.after < filt.before && filt.onIsBg, filt);
  await evalJS(`(function(){ var c=document.querySelector('#store-filters .store-chip[data-filter=""]'); if(c)c.click();
    document.getElementById('store-ov').classList.remove('open'); STORE._open=false; return 1; })()`);

  /* ══ ٤+٥) المخزون: أزرارُ تصنيفٍ بأيقوناتٍ + تصفيةٌ + عملةٌ موحّدة ══ */
  const inv = await J(`(function(){
    var ov=document.getElementById('rewards-ov'); if(!ov) return {miss:1};
    ov.classList.add('open'); REWARDS._open=true; REWARDS._bind();
    REWARDS._itemMeta={}; window.__items.forEach(function(it){ REWARDS._itemMeta[it.id]=it; });
    REWARDS._cat={ items:window.__items }; REWARDS._tab='inventory'; REWARDS._invFilter=null;
    REWARDS._render();
    var chips=[].slice.call(document.querySelectorAll('#rw-body .rw-chips .rw-chip'));
    return {
      chips: chips.length,
      withIcon: chips.filter(function(c){ return !!c.querySelector('.rw-chip__ic svg'); }).length,
      withText: chips.filter(function(c){ var t=c.querySelector('.rw-chip__tx'); return t && t.textContent.trim().length>0; }).length,
      withNum: chips.filter(function(c){ var n=c.querySelector('.rw-chip__n'); return n && /^[0-9]+$/.test(n.textContent.trim()); }).length,
      onCount: chips.filter(function(c){ return c.classList.contains('is-on'); }).length,
      chipH: chips.length ? Math.round(chips[0].getBoundingClientRect().height) : 0,
      styled: chips.length ? getComputedStyle(chips[0]).borderRadius : null,
      secs: document.querySelectorAll('#rw-body .rw-sec').length,
      cards: document.querySelectorAll('#rw-body .rw-inv').length,
      balCoin: !!document.querySelector('#rw-balance-coin svg.amkh-coin-svg')
    };
  })()`);
  check('٤ أزرارُ تصنيفِ المخزونِ بأيقوناتٍ وأعداد',
    !inv.miss && inv.chips >= 4 && inv.withIcon === inv.chips && inv.withText === inv.chips
    && inv.withNum === inv.chips && inv.onCount === 1, inv);
  check('٤ أزرارُ المخزونِ منسّقةٌ فعلًا (CSS موجود)',
    !inv.miss && inv.chipH >= 26 && inv.styled === '999px', inv);
  check('٥ عملةُ الجوائزِ = عملةُ الرئيسيّة', !inv.miss && inv.balCoin, inv);

  const invFilt = await J(`(function(){
    var before=document.querySelectorAll('#rw-body .rw-sec').length;
    var chip=document.querySelector('#rw-body .rw-chip[data-invfilter="background"]');
    if(!chip) return {miss:1};
    chip.click();
    return { before:before, secAfter:document.querySelectorAll('#rw-body .rw-sec').length,
      cards:document.querySelectorAll('#rw-body .rw-inv').length,
      onIsBg: !!document.querySelector('#rw-body .rw-chip.is-on[data-invfilter="background"]') };
  })()`);
  check('٤ تصفيةُ المخزونِ تُوصِلُ لنوعٍ واحدٍ بلا تمرير',
    !invFilt.miss && invFilt.before > 1 && invFilt.secAfter === 1 && invFilt.onIsBg, invFilt);

  /* عملةُ المهامِّ كذلك (نفسُ الوحدة). لقطةُ الخادمِ تبعثُ المهامَّ مصفوفةً
     مسطّحةً يحملُ كلُّ عنصرٍ فيها period/metric — لا { daily, weekly }. */
  const misCoin = await J(`(function(){
    REWARDS._tab='missions';
    window.amkhEconomy.state.missions=[
      { id:'d1', period:'daily', metric:'games', ar:'العبْ مباراتين', en:'Play two games', progress:1, target:2, coins:60, xp:25, claimed:false },
      { id:'w1', period:'weekly', metric:'wins', ar:'افُزْ خمسَ مرّات', en:'Win five games', progress:5, target:5, coins:250, xp:120, claimed:false }
    ];
    REWARDS._render();
    return { rows: document.querySelectorAll('#rw-body .rw-mission').length,
      coins: document.querySelectorAll('#rw-body .rw-reward__coin svg.amkh-coin-svg').length,
      anim: !!document.querySelector('#rw-body .rw-reward__coin svg animate'),
      coinW: (function(){ var c=document.querySelector('#rw-body .rw-reward__coin'); return c?Math.round(c.getBoundingClientRect().width):0; })() };
  })()`);
  check('٥ عملةُ المهامِّ لامعةٌ متحرّكةٌ كالرئيسيّة',
    misCoin.rows === 2 && misCoin.coins === 2 && misCoin.anim && misCoin.coinW >= 16, misCoin);
  await evalJS(`(function(){ document.getElementById('rewards-ov').classList.remove('open'); REWARDS._open=false; return 1; })()`);

  /* ══ ٨) خلفيّةُ الطرفِ الآخرِ في سطورِ الأصدقاء/الطلبِ/البحث ══ */
  const fr = await J(`(function(){
    var bgId=Object.keys(amkhCos.BG||{})[0];
    var host=document.createElement('div'); host.style.cssText='position:fixed;left:0;top:0;width:412px;z-index:99999;background:#101020';
    document.body.appendChild(host); window.__frHost=host;
    var user={ id:99, name:'أحمد', display_name:'أحمد', rating:1480, online:true,
      cosmetics:{ background:bgId, frame:Object.keys(amkhCos.FRAME||{})[0], badge:Object.keys(amkhCos.BADGE||{})[0] } };
    var r1=amkhFriends._baseRow(user,'متصل','is-online');
    var r2=amkhFriends._baseRow(user,'يريد إضافتك صديقًا','');
    var r3=amkhFriends._baseRow(user,'غير متصل','');
    [r1,r2,r3].forEach(function(r){ host.appendChild(r.row); });
    var probe=function(r){
      var row=r.row, info=row.querySelector(':scope > .fr-row__info'),
          nm=row.querySelector('.fr-row__name'), st=row.querySelector('.fr-row__status'),
          rt=row.querySelector('.fr-row__rating'), bn=row.querySelector(':scope > .cos-banner');
      var vis=function(e){ if(!e) return false; var b=e.getBoundingClientRect(); var c=getComputedStyle(e);
        return b.width>0 && b.height>0 && c.display!=='none' && c.visibility!=='hidden' && parseFloat(c.opacity)>0.1; };
      /* الاختبارُ الحاسم: هل اللافتةُ تحجبُ النصَّ فعلًا؟ نقطةٌ على الاسمِ
         يجبُ أن تُصيبَ الاسمَ لا اللافتة. الطبقةُ تُضبَطُ على الابنِ
         المباشرِ (fr-row__info) فالاسمُ حفيدٌ يرثُ سياقَها. */
      var atName=null; if(nm){ var b=nm.getBoundingClientRect();
        var el=document.elementFromPoint(b.left+Math.min(6,b.width/2), b.top+b.height/2);
        atName = el ? (el===nm || nm.contains(el) || el.contains(nm) ? 'name' : el.className) : null; }
      return { banner:!!bn, bannerFirst: !!bn && row.firstChild===bn,
        bannered: row.classList.contains('cos-bannered'),
        nameVis:vis(nm), ratingVis:vis(rt), statusVis:vis(st),
        infoZ:info?getComputedStyle(info).zIndex:null, atName:atName,
        statusColor:st?getComputedStyle(st).color:null,
        nameText:nm?nm.textContent:null, ratingText:rt?rt.textContent:null };
    };
    /* سطرٌ بلا خلفيّةٍ مُجهَّزةٍ: لونُ «متصل» المرجعيّ */
    var plain=amkhFriends._baseRow({ id:98, name:'بلا', display_name:'بلا', rating:1200, online:true },'متصل','is-online');
    host.appendChild(plain.row);
    return { rows:[probe(r1),probe(r2),probe(r3)], plainOnline:getComputedStyle(plain.row.querySelector('.fr-row__status')).color };
  })()`);
  const allRows = fr.rows || [];
  check('٨ اللافتةُ تُرسَمُ في السطورِ الثلاثةِ (أصدقاء/طلب/بحث)',
    allRows.length === 3 && allRows.every(r => r.banner && r.bannerFirst && r.bannered), allRows);
  check('٨ الاسمُ والتقييمُ والحالةُ ظاهرةٌ فوقَ اللافتة',
    allRows.length === 3 && allRows.every(r => r.nameVis && r.ratingVis && r.statusVis
      && r.infoZ === '1' && r.atName === 'name'), allRows);
  check('٨ لونُ «متصل» الأخضرُ لم يتغيّر',
    allRows[0] && allRows[0].statusColor === fr.plainOnline,
    { bannered: allRows[0] && allRows[0].statusColor, plain: fr.plainOnline });

  /* أزرارُ القبولِ/الرفضِ في سطرِ الطلبِ تبقى قابلةً للنقرِ فوقَ اللافتة */
  const acts = await J(`(function(){
    var host=window.__frHost; var row=host.children[1];
    var btn=document.createElement('button'); btn.className='fr-btn'; btn.textContent='قبول';
    row.querySelector('.fr-row__acts').appendChild(btn);
    var b=btn.getBoundingClientRect();
    var top=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
    return { hit: !!top && (top===btn || btn.contains(top)), tag: top?top.className:null,
      z: getComputedStyle(row.querySelector('.fr-row__acts')).zIndex };
  })()`);
  check('٨ أزرارُ القبول/الرفضِ تستقبلُ النقرَ فوقَ اللافتة', acts.hit, acts);

  if (errs.length) console.log('errors     ', errs.slice(0, 6).join(' | '));
  console.log('──────────────');
  console.log('نتيجة       ' + pass + ' ناجح / ' + fail + ' فاشل');

  ws.close(); edge.kill(); srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exitCode = fail ? 1 : 0;
}
main().catch(e => { console.error(e); process.exit(1); });
