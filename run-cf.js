/* مشغّل النفق لسيرفر الأونلاين (Cloudflare Tunnel / ngrok).
   يستخدم cloudflared افتراضياً (بدون صفحة تحذير لتضمن عمل WebSocket في المتصفحات)،
   وبعد ما النفق يفتح بيرفع الرابط العام على url.json في الريبو فوراً. */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isWin = process.platform === 'win32';

function getCfBin() {
  const localLinux = path.join(__dirname, 'cloudflared');
  const localWin = path.join(__dirname, 'cloudflared-windows-amd64.exe');
  if (!isWin && fs.existsSync(localLinux)) return localLinux;
  if (isWin && fs.existsSync(localWin)) return localWin;
  return isWin ? 'cloudflared-windows-amd64.exe' : 'cloudflared';
}

function getNgrokBin() {
  const local = path.join(__dirname, isWin ? 'ngrok.exe' : 'ngrok');
  return fs.existsSync(local) ? local : (isWin ? 'ngrok.exe' : 'ngrok');
}

function uploadUrl(url) {
  if (isWin) {
    spawn('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'start-chess.ps1'),
      url
    ], { stdio: 'ignore', windowsHide: true });
  } else {
    spawn('bash', [path.join(__dirname, 'update-url.sh'), url], { stdio: 'inherit' });
  }
}

const PORT = process.env.PORT || 8081;
const cfBin = getCfBin();

let uploaded = false;
/* آخر رابط اتنشر فعلًا. بنقارن بيه قبل النشر عشان مانرفعش نفس الرابط
   كل دقيقة — كل رفع بيعمل commit في الريبو، فالتكرار بيوسّخ التاريخ. */
let lastPublished = null;

function checkHealth(url, timeout = 8000) {
  return new Promise((resolve) => {
    const transport = url.startsWith('https:') ? require('https') : require('http');
    const req = transport.get(`${url.replace(/\/$/, '')}/api/health?t=${Date.now()}`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
      timeout
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(res.statusCode === 200 && JSON.parse(body).status === 'ok'); }
        catch (_) { resolve(false); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

/* انتشار اسم نفق trycloudflare في DNS بياخد وقت: قِسته 45 ثانية على
   ويندوز. النسخة الأولى كانت 12 محاولة × 2.5 ثانية ≈ 28 ثانية، وفشل
   DNS بيرجع فورًا فالمحاولات كانت بتخلص قبل ما الاسم يشتغل — النتيجة
   إن url.json مايتحدّثش خالص والتطبيق يفضل على رابط قديم ميت.
   150 ثانية بتغطّي أبطأ انتشار شفته بفارق كبير. */
async function publishIfHealthy(url, attempts = 50) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await checkHealth(url)) {
      uploadUrl(url);
      console.log(`Published after ${attempt} health check(s).`);
      return true;
    }
    /* سطر كل 10 محاولات: يطمّن إن الانتظار مقصود مش تعليق */
    if (attempt % 10 === 0) console.log(`  waiting for tunnel DNS… (${attempt}/${attempts})`);
    if (attempt < attempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  console.error('Tunnel health check failed; URL was not published:', url);
  return false;
}

/* ══════════════════════════════════════════════════════════════════════
   ngrok هو النفق الأساسي — ده اللي المشروع معتمد عليه من الأصل.
   ──────────────────────────────────────────────────────────────────────
   ليه ngrok وليه cloudflared بديل بس:
   • حساب ngrok بيدّي اسم مضيف ثابت، فالرابط جاهز فورًا. أنفاق
     trycloudflare المجانية بتدّي اسم عشوائي جديد كل تشغيلة ولازم يستنى
     انتشار DNS — قِسته: مرة اشتغل بعد 45 ثانية، ومرتين ما اشتغلش خلال
     150 ثانية. ومعنى ده إن كل ريستارت للسيرفر ممكن يقطع الأونلاين
     لدقايق أو يفضل مقطوع.
   • cloudflared نفسه بيقول في سجله إن الأنفاق المجانية «مالهاش ضمان
     تشغيل» وبيوصي بـnamed tunnel للإنتاج، وده محتاج حساب ودومين.
   آلية التحديث كل دقيقة بتفضل زي ما هي: لو الرابط اتغيّر لأي سبب،
   url.json بيتحدّث لوحده والتطبيق بيلاقي السيرفر من غير أي تدخّل.
══════════════════════════════════════════════════════════════════════ */
startNgrok();

function startCloudflare() {
  const bin = getCfBin();
  if (isWin && !fs.existsSync(bin)) {
    console.error('cloudflared غير موجود — مفيش نفق بديل.');
    return;
  }
  console.log(`Starting Cloudflare Tunnel as fallback (${bin})...`);
  const cf = spawn(bin, ['tunnel', '--protocol', 'http2', '--url', `http://localhost:${PORT}`], {
    windowsHide: true
  });

  const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

  const handleData = (chunk) => {
    const text = chunk.toString();
    const match = text.match(urlRegex);
    if (match && !uploaded) {
      const url = match[0];
      console.log(`[${new Date().toLocaleString()}] Cloudflare Tunnel URL:`, url);
      publishIfHealthy(url).then(ok => { if (ok) uploaded = true; });
      return;
    }
    /* رسائل cloudflared كانت بتتبلع كلها لأن اللوج كان بيطبع الرابط بس،
       فأي فشل في الاتصال كان بيحصل في صمت. بنطلّع الأخطاء بس. */
    if (/ERR|error|failed/i.test(text)) process.stderr.write('  [cf] ' + text.trim().slice(0, 300) + '\n');
  };

  cf.stdout.on('data', handleData);
  cf.stderr.on('data', handleData);

  cf.on('error', (e) => console.error('Cloudflare Tunnel failed to start:', e.message));
  cf.on('exit', (code) => {
    console.log(`Cloudflare Tunnel exited with code ${code}. Restarting in 3s...`);
    uploaded = false;
    setTimeout(startCloudflare, 3000);
  });
}

function startNgrok() {
  console.log(`Starting ngrok (${getNgrokBin()}) on port ${PORT}...`);
  const ngrok = spawn(getNgrokBin(), ['http', String(PORT)], {
    stdio: 'ignore',
    detached: false,
    windowsHide: true
  });

  ngrok.on('error', (e) => {
    console.error('failed to start ngrok:', e.message);
    console.error('محاولة النفق البديل…');
    startCloudflare();
  });

  /* عدّاد محاولات قراءة لوحة ngrok المحليّة. لو خلصت من غير رابط، يبقى
     ngrok مش شغّال فعلًا (توكن ناقص أو حد تاني ماخد البورت) فبنروح
     للبديل بدل ما نفضل ساكتين والأونلاين واقف. */
  let apiTries = 0;

  setTimeout(() => {
    const updateUrl = () => {
      http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const tunnels = JSON.parse(data).tunnels;
            if (tunnels && tunnels.length > 0) {
              /* ngrok بيرجّع نفق http ونفق https لنفس العنوان — لازم
                 نأخذ https، لأن التطبيق بيحوّله لـwss والمتصفح بيرفض
                 wss على أصل غير آمن. */
              const t = tunnels.find(x => String(x.public_url).startsWith('https:')) || tunnels[0];
              const url = t.public_url;
              if (url !== lastPublished) {
                console.log(`[${new Date().toLocaleString()}] ngrok URL:`, url);
                publishIfHealthy(url).then(ok => { if (ok) lastPublished = url; });
              }
            } else if (++apiTries >= 6) {
              console.error('ngrok مافتحش أي نفق — تحويل للبديل.');
              apiTries = -999;   /* مانكررش التحويل */
              startCloudflare();
            }
          } catch(e) {
            console.error('Error:', e.message);
          }
        });
      }).on('error', (e) => {
        if (++apiTries >= 6 && apiTries > 0) {
          console.error('لوحة ngrok مش بترد (' + e.message + ') — تحويل للبديل.');
          apiTries = -999;
          startCloudflare();
        }
      });
    };

    updateUrl();
    /* آلية التحديث كل دقيقة: لو الخطة المجانية غيّرت الرابط، url.json
       بيتحدّث لوحده. publishIfHealthy بيتأكد إن الرابط شغّال قبل نشره،
       فرابط ميت مابيوصلش للتطبيق. */
    setInterval(updateUrl, 60000);
  }, 5000);

  ngrok.on('exit', (code) => {
    console.log(`ngrok exited with code ${code}. Restarting in 3s...`);
    lastPublished = null;
    setTimeout(startNgrok, 3000);
  });
}
