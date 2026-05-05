/**
 * ♟ شطرنج Am-Kh — Local LAN Game Server
 * Simple WebSocket server for local multiplayer without internet
 * Run this on the host device
 */

'use strict';

const http = require('http');
const https = require('https');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.LAN_PORT || 8082;
const SSL_PORT = process.env.LAN_SSL_PORT || 8443;

// SSL certificate generation (self-signed for local use)
let sslOptions = null;
try {
  // Try to load existing SSL certificates
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'server.key')),
    cert: fs.readFileSync(path.join(__dirname, 'server.crt'))
  };
  console.log('🔒 SSL certificates loaded');
} catch (e) {
  console.log('⚠️  SSL certificates not found, generating self-signed certificates...');
  generateSelfSignedCert();
}

function generateSelfSignedCert() {
  const { execSync } = require('child_process');
  try {
    // Generate self-signed certificate for local development
    const keyPath = path.join(__dirname, 'server.key');
    const certPath = path.join(__dirname, 'server.crt');
    
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`, { stdio: 'ignore' });
      console.log('🔐 Self-signed SSL certificate generated');
    }
    
    sslOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  } catch (e) {
    console.log('⚠️  Could not generate SSL certificates. WSS will not be available.');
    console.log('   Install OpenSSL and try again, or use HTTP only.');
  }
}

// Room management for LAN games
const rooms = new Map(); /* code → room */
const clientRoom = new Map(); /* ws → code */

function getRoomAndSide(ws) {
  const code = clientRoom.get(ws);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  const side = room.host?.ws === ws ? 'host' : (room.guest?.ws === ws ? 'guest' : null);
  if (!side) return null;
  return { room, code, side };
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genCode() : code;
}

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

function leaveRoom(ws) {
  const code = clientRoom.get(ws);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  // Notify opponent of resignation
  const opp = room.host.ws === ws ? room.guest?.ws : room.host.ws;
  if (opp && opp.readyState === WebSocket.OPEN) {
    send(opp, { type: 'resign' });
  }

  // Clean up room
  if (room.host.ws === ws) {
    rooms.delete(code);
    if (room.guest) clientRoom.delete(room.guest.ws);
  } else {
    room.guest = null;
  }
  clientRoom.delete(ws);
}

// Create HTTP server for WebSocket upgrade
const httpServer = http.createServer((req, res) => {
  handleRequest(req, res, PORT);
});

// Create HTTPS server if SSL is available
let httpsServer = null;
let wss = null;
let wsss = null;

if (sslOptions) {
  httpsServer = https.createServer(sslOptions, (req, res) => {
    handleRequest(req, res, SSL_PORT);
  });
  
  wsss = new WebSocketServer({ server: httpsServer });
  wsss.on('connection', (ws, req) => handleConnection(ws, req, 'WSS'));
}

// Create WebSocket server for HTTP
wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws, req) => handleConnection(ws, req, 'WS'));

function handleRequest(req, res, port) {
  // Simple health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const totalClients = (wss ? wss.clients.size : 0) + (wsss ? wsss.clients.size : 0);
    res.end(JSON.stringify({ 
      status: 'ok', 
      rooms: rooms.size, 
      clients: totalClients,
      ws: wss ? wss.clients.size : 0,
      wss: wsss ? wsss.clients.size : 0
    }));
    return;
  }

  // Serve info page
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>شطرنج LAN Server</title>
      <style>
        body { font-family: 'Cairo', sans-serif; background: #0a0a14; color: #ede8dc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; text-align: center; }
        h1 { color: #c9a84c; margin-bottom: 20px; }
        .info { background: #10101e; padding: 20px; border-radius: 12px; margin: 20px 0; }
        .stat { display: inline-block; margin: 10px; padding: 10px; background: #181830; border-radius: 8px; }
        .ssl { color: #4ade80; }
        .nossl { color: #f87171; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📶 شطرنج LAN Server</h1>
        <div class="info">
          <p>HTTP Server: <strong>localhost:${PORT}</strong> ${sslOptions ? '<span class="ssl">✓</span>' : '<span class="nossl">✗</span>'}</p>
          ${sslOptions ? `<p>HTTPS Server: <strong>localhost:${SSL_PORT}</strong> <span class="ssl">✓</span></p>` : ''}
          <div class="stat">الغرف النشطة: <strong>${rooms.size}</strong></div>
          <div class="stat">اللاعبون المتصلون: <strong>${(wss ? wss.clients.size : 0) + (wsss ? wsss.clients.size : 0)}</strong></div>
          ${sslOptions ? '<p style="color: #4ade80;">🔒 SSL/WSS مدعوم - يعمل مع HTTPS</p>' : '<p style="color: #f87171;">⚠️ SSL غير مدعوم - يعمل مع HTTP فقط</p>'}
          <p style="margin-top: 20px; opacity: 0.7;">يمكن للاعبين الانضمام عبر نفس شبكة Wi-Fi</p>
        </div>
      </div>
    </body>
    </html>
  `);
}

function handleConnection(ws, req, protocol) {
  console.log(`[+] LAN client connected via ${protocol} | total: ${(wss ? wss.clients.size : 0) + (wsss ? wsss.clients.size : 0)}`);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'create': {
        leaveRoom(ws);
        const code = genCode();
        const hostColor = msg.color === 'b' ? 'b' : 'w';
        const guestColor = hostColor === 'w' ? 'b' : 'w';

        const room = {
          code,
          host: { ws, color: hostColor, name: (msg.name || '').slice(0, 20), pimg: null },
          guest: null,
          guestColor,
          createdAt: Date.now(),
        };
        rooms.set(code, room);
        clientRoom.set(ws, code);

        send(ws, { type: 'room-created', code });
        console.log(`[LAN room] created ${code} | host=${hostColor}`);
        break;
      }

      case 'join': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);

        if (!room) {
          send(ws, { type: 'room-error', msg: 'الكود غير صحيح أو انتهت صلاحية الغرفة' });
          return;
        }
        if (room.guest) {
          send(ws, { type: 'room-error', msg: 'الغرفة ممتلئة' });
          return;
        }
        if (room.host.ws === ws) {
          send(ws, { type: 'room-error', msg: 'لا يمكنك الانضمام لغرفتك الخاصة' });
          return;
        }

        leaveRoom(ws);

        room.guest = { ws, color: room.guestColor, name: (msg.name || '').slice(0, 20), pimg: null };
        clientRoom.set(ws, code);

        send(ws, { type: 'room-joined', code });

        // Start game for both players
        const hostName = room.host.name || 'المضيف';
        const guestName = room.guest.name || 'الضيف';

        send(room.host.ws, {
          type: 'start',
          yourColor: room.host.color,
          oppName: guestName,
        });
        send(room.guest.ws, {
          type: 'start',
          yourColor: room.guest.color,
          oppName: hostName,
        });

        // Share profile images
        if (room.host.pimg) send(room.guest.ws, { type: 'pimg', img: room.host.pimg });
        if (room.guest.pimg) send(room.host.ws, { type: 'pimg', img: room.guest.pimg });

        console.log(`[LAN room] ${code} started | host=${room.host.color} guest=${room.guest.color}`);
        break;
      }

      case 'move':
      case 'resign':
      case 'chat':
      case 'voice':
      case 'name':
      case 'pimg':
      case 'assist': {
        const info = getRoomAndSide(ws);
        if (info) {
          const { room, side } = info;
          
          // Update room data
          if (msg.type === 'name') {
            const nm = (msg.name || '').slice(0, 20);
            if (room[side]) room[side].name = nm;
          } else if (msg.type === 'pimg') {
            const img = msg.img || null;
            if (room[side]) room[side].pimg = img;
          }

          // Relay to opponent
          const oppSide = side === 'host' ? 'guest' : 'host';
          const opp = room[oppSide]?.ws;
          if (opp) send(opp, msg);
        }
        break;
      }

      case 'ping': {
        send(ws, { type: 'pong' });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[-] LAN client disconnected | total: ${wss.clients.size - 1}`);
    leaveRoom(ws);
    clientRoom.delete(ws);
  });

  ws.on('error', () => {});
}

// Heartbeat to detect disconnected clients
const heartbeat = setInterval(() => {
  if (wss) {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }
  if (wsss) {
    wsss.clients.forEach(ws => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }
}, 30000);

if (wss) wss.on('close', () => clearInterval(heartbeat));
if (wsss) wsss.on('close', () => clearInterval(heartbeat));

// Clean up old rooms (older than 2 hours)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 2 * 60 * 60 * 1000) {
      rooms.delete(code);
      console.log(`[LAN] Cleaned up old room: ${code}`);
    }
  }
}, 30 * 60 * 1000);

// Start servers with port conflict handling
function startServer(server, port, protocol) {
  return new Promise((resolve, reject) => {
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${port} is in use, trying next port...`);
        server.listen(port + 1, '0.0.0.0', () => {
          resolve(port + 1);
        });
      } else {
        reject(e);
      }
    });
    
    server.listen(port, '0.0.0.0', () => {
      resolve(port);
    });
  });
}

async function startServers() {
  try {
    const actualPort = await startServer(httpServer, PORT, 'HTTP');
    console.log(`📶 Chess LAN Server running on port ${actualPort}`);
    console.log(`   Local access: http://localhost:${actualPort}`);
    console.log(`   Network access: http://[your-local-ip]:${actualPort}`);
    
    let actualSSLPort = null;
    if (httpsServer) {
      try {
        actualSSLPort = await startServer(httpsServer, SSL_PORT, 'HTTPS');
        console.log(`🔒 Chess LAN Server (SSL) running on port ${actualSSLPort}`);
        console.log(`   Local access: https://localhost:${actualSSLPort}`);
        console.log(`   Network access: https://[your-local-ip]:${actualSSLPort}`);
      } catch (e) {
        console.log(`⚠️  Could not start HTTPS server`);
      }
    }
    
    console.log(`   Ready for LAN multiplayer games!`);
    console.log(`   ${actualSSLPort ? `Use ports ${actualPort} (HTTP) and ${actualSSLPort} (HTTPS)` : `Use port ${actualPort} (HTTP only)`}`);
    
    // Update client-side port if different
    if (actualPort !== PORT) {
      console.log(`   ⚠️  Note: Client will need to use port ${actualPort}`);
    }
    
  } catch (e) {
    console.error('Failed to start servers:', e);
    process.exit(1);
  }
}

startServers();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📶 Shutting down LAN server...');
  if (httpServer) httpServer.close();
  if (httpsServer) httpsServer.close();
  console.log('✓ Server stopped');
  process.exit(0);
});
