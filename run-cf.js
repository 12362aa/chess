/* مشغّل نفق ngrok لسيرفر الأونلاين.
   بيشتغل على لينكس وويندوز: بيختار نسخة ngrok المناسبة، وبعد ما النفق
   يفتح بيرفع الرابط العام على url.json في الريبو (اللي التطبيق بيقراه).

   لينكس:   ngrok  (باينري بلا امتداد في جذر المشروع)  + update-url.sh
   ويندوز:  ngrok.exe                                    + start-chess.ps1

   نسخة ngrok لازم تكون متظبّطة بالـauthtoken مرة واحدة قبل التشغيل:
     ./ngrok config add-authtoken <token>        (لينكس)
     .\ngrok.exe config add-authtoken <token>    (ويندوز) */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isWin = process.platform === 'win32';

/* اختيار باينري ngrok: على ويندوز ngrok.exe، على غيره الباينري بلا امتداد.
   لو الملف مش موجود بنقع بالاسم اللي على PATH كحل أخير. */
function ngrokBin() {
  const local = path.join(__dirname, isWin ? 'ngrok.exe' : 'ngrok');
  return fs.existsSync(local) ? local : (isWin ? 'ngrok.exe' : 'ngrok');
}

/* اختيار طريقة رفع الرابط حسب النظام */
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

const ngrok = spawn(ngrokBin(), ['http', String(PORT)], {
  stdio: 'ignore',
  detached: false,
  windowsHide: true
});

ngrok.on('error', (e) => {
  console.error('failed to start ngrok:', e.message);
  console.error('تأكد إن باينري ngrok موجود ومتظبّط بالـauthtoken.');
  process.exit(1);
});

// انتظر 5 ثواني ليتأكد تشغيل ngrok
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
            uploadUrl(url);
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
