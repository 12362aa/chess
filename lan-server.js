/**
 * ♟ شطرنج Am-Kh — Local LAN Game Server
 * Simple WebSocket server for local multiplayer without internet
 * Run this on the host device
 */

'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.LAN_PORT || 8082;

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
const server = http.createServer((req, res) => {
  // Simple health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      rooms: rooms.size, 
      clients: wss ? wss.clients.size : 0 
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
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📶 شطرنج LAN Server</h1>
        <div class="info">
          <p>السيرفر يعمل على المنفذ <strong>${PORT}</strong></p>
          <div class="stat">الغرف النشطة: <strong>${rooms.size}</strong></div>
          <div class="stat">اللاعبون المتصلون: <strong>${wss ? wss.clients.size : 0}</strong></div>
          <p style="margin-top: 20px; opacity: 0.7;">يمكن للاعبين الانضمام عبر نفس شبكة Wi-Fi</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log(`[+] LAN client connected | total: ${wss.clients.size}`);

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
});

// Heartbeat to detect disconnected clients
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

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

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`📶 Chess LAN Server running on port ${PORT}`);
  console.log(`   Local access: http://localhost:${PORT}`);
  console.log(`   Network access: http://[your-local-ip]:${PORT}`);
  console.log(`   Ready for LAN multiplayer games!`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📶 Shutting down LAN server...');
  server.close(() => {
    console.log('✓ Server stopped');
    process.exit(0);
  });
});
