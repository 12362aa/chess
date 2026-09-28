/* قراءةُ نصِّ رخصةِ المؤثّراتِ الصوتيّةِ المجانيّةِ من Mixkit.
   النصُّ داخلَ نافذةٍ منبثقةٍ يبنيها JavaScript، فنفتحُها عبر CDP ونقرؤها.
   node scripts/fetch-mixkit-license.js */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 9519;
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));
if (!EDGE) { console.error('Edge not found'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => { http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej); });

async function main() {
  const profile = path.join(os.tmpdir(), 'amkh-lic-' + Date.now());
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,1000', 'https://mixkit.co/license/'], { stdio: 'ignore' });
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
  const send = (m, p) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const evalJS = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : null; };
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 120; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(300); }
  await sleep(2500);
  await evalJS(`(function(){ var b=document.querySelector('[data-license="sfxFree"]'); if(b) b.click(); return !!b; })()`);
  await sleep(2000);
  const txt = await evalJS(`(function(){
    var c = document.querySelector('[data-modal-target="content"]');
    return c ? c.innerText.replace(/\\n{3,}/g,'\\n\\n').trim() : 'NO MODAL';
  })()`);
  console.log(txt);
  ws.close(); edge.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
main().catch(e => { console.error(e); process.exit(1); });
