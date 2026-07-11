const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ngrok = spawn(
  path.join(__dirname, 'ngrok.exe'),
  ['http', '8081'],
  {
    stdio: 'ignore',
    detached: false,
    windowsHide: true
  }
);

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
            const ps = spawn('powershell', [
              '-ExecutionPolicy', 'Bypass',
              '-File', path.join(__dirname, 'start-chess.ps1'),
              url
            ], { stdio: 'ignore', windowsHide: true });
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