/* جلبُ مؤثّرٍ صوتيٍّ حقيقيٍّ للترقّي من الويب (Mixkit، رخصةٌ مجانيّةٌ للمؤثّرات).
   صفحةُ Mixkit تحقن روابطَ الـmp3 عبر JavaScript، فاستخراجُها يحتاج DOM
   مُصيَّرًا: نفتح Edge بلا واجهةٍ عبر CDP خامًا ونقرأ كلّ <audio>/data-*.
   node scripts/fetch-levelup-sfx.js */
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 9517;
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));
if (!EDGE) { console.error('Edge not found'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

function download(url, dest) {
  return new Promise((res, rej) => {
    const go = (u, depth) => {
      if (depth > 5) return rej(new Error('too many redirects'));
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return go(r.headers.location, depth + 1); }
        if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
        const f = fs.createWriteStream(dest);
        r.pipe(f);
        f.on('finish', () => f.close(() => res(fs.statSync(dest).size)));
      }).on('error', rej);
    };
    go(url, 0);
  });
}

async function main() {
  const profile = path.join(os.tmpdir(), 'amkh-sfx-' + Date.now());
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,900', 'https://mixkit.co/free-sound-effects/level-up/'], { stdio: 'ignore' });

  let tabs = null;
  for (let i = 0; i < 90; i++) {
    try { tabs = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (tabs.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) break; } catch (e) {}
    await sleep(300);
  }
  const tab = tabs && tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!tab) { console.error('no tab'); edge.kill(); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0; const waiting = new Map();
  ws.on('message', m => { const msg = JSON.parse(m); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } });
  const send = (method, params) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 120; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(300); }
  await sleep(3500);

  /* كلُّ ما يشبه رابطَ mp3 في الـDOM المُصيَّر: <audio src>، data-*، JSON مضمّن */
  const found = await evalJS(`JSON.stringify((function(){
    var out = [];
    document.querySelectorAll('audio, source').forEach(function(a){
      var u = a.src || a.getAttribute('src') || a.dataset.src || '';
      if (u) out.push({ how:'audio', url:u });
    });
    document.querySelectorAll('[data-audio-player-preview-url-value],[data-preview-url],[data-url],[data-audio-url]').forEach(function(e){
      var u = e.getAttribute('data-audio-player-preview-url-value') || e.getAttribute('data-preview-url') || e.getAttribute('data-url') || e.getAttribute('data-audio-url');
      var t = (e.closest('[data-item-name]') && e.closest('[data-item-name]').getAttribute('data-item-name')) ||
              (e.closest('.item') && (e.closest('.item').querySelector('.item__title, h2, h3') || {}).textContent) || '';
      if (u && /mp3|wav/i.test(u)) out.push({ how:'data', url:u, title:(t||'').trim() });
    });
    var html = document.documentElement.innerHTML;
    var re = /https:\\/\\/assets\\.mixkit\\.co\\/[^"'\\s\\\\]+?\\.mp3/g, m;
    while ((m = re.exec(html))) out.push({ how:'html', url:m[0] });
    var seen = {}, uniq = [];
    out.forEach(function(o){ if (!seen[o.url]) { seen[o.url]=1; uniq.push(o); } });
    return uniq;
  })())`);
  console.log('found      ', found);

  /* العناوينُ بالترتيبِ نفسِه لمطابقةِ كلِّ رابطٍ باسمِه */
  const titles = await evalJS(`JSON.stringify(Array.from(document.querySelectorAll('.item__title, .item-grid-card__title, h2.item__title')).map(function(e){return e.textContent.trim();}))`);
  console.log('titles     ', titles);

  ws.close(); edge.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const list = JSON.parse(found || '[]');
  if (!list.length) { console.error('no mp3 urls found'); process.exit(2); }
  fs.writeFileSync(path.join(__dirname, 'levelup-sfx-urls.json'), JSON.stringify({ list, titles: JSON.parse(titles || '[]') }, null, 2));
  console.log('saved list → scripts/levelup-sfx-urls.json');
}
main().catch(e => { console.error(e); process.exit(1); });
