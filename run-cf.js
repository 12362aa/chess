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

async function publishIfHealthy(url, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await checkHealth(url)) {
      uploadUrl(url);
      return true;
    }
    if (attempt < attempts) {
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
  }
  console.error('Tunnel health check failed; URL was not published:', url);
  return false;
}

if (fs.existsSync(cfBin) || !isWin) {
  console.log(`Starting Cloudflare Tunnel (${cfBin})...`);
  const cf = spawn(cfBin, ['tunnel', '--protocol', 'http2', '--url', `http://localhost:${PORT}`], {
    windowsHide: true
  });

  const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

  function handleData(chunk) {
    const text = chunk.toString();
    const match = text.match(urlRegex);
    if (match && !uploaded) {
      const url = match[0];
      console.log(`[${new Date().toLocaleString()}] Cloudflare Tunnel URL:`, url);
      publishIfHealthy(url).then(ok => { if (ok) uploaded = true; });
    }
  }

  cf.stdout.on('data', handleData);
  cf.stderr.on('data', handleData);

  cf.on('error', (e) => {
    console.error('Cloudflare Tunnel failed to start, falling back to ngrok:', e.message);
    startNgrok();
  });

  cf.on('exit', (code) => {
    console.log(`Cloudflare Tunnel exited with code ${code}. Restarting tunnel in 3 seconds...`);
    uploaded = false;
    setTimeout(() => {
      startCloudflare();
    }, 3000);
  });
} else {
  startNgrok();
}

function startNgrok() {
  const ngrok = spawn(getNgrokBin(), ['http', String(PORT)], {
    stdio: 'ignore',
    detached: false,
    windowsHide: true
  });

  ngrok.on('error', (e) => {
    console.error('failed to start ngrok:', e.message);
    process.exit(1);
  });

  setTimeout(() => {
    const updateUrl = () => {
      http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const tunnels = JSON.parse(data).tunnels;
            if (tunnels && tunnels.length > 0) {
              const url = tunnels[0].public_url;
              console.log(`[${new Date().toLocaleString()}] URL:`, url);
              publishIfHealthy(url);
            }
          } catch(e) {
            console.error('Error:', e.message);
          }
        });
      }).on('error', (e) => console.error('Error fetching tunnels:', e.message));
    };

    updateUrl();
    setInterval(updateUrl, 60000);
  }, 5000);

  ngrok.on('exit', (code) => {
    console.log(`ngrok exited with code ${code}`);
    process.exit(code);
  });
}
