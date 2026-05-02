/**
 * ♟ شطرنج Am-Kh — WebSocket Game Server with API
 * Node.js + ws + Express + SQLite
 * يرفع على Back4app (Container)
 */

'use strict';

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8081;

// No database needed for authless version

// Express app for API
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','ngrok-skip-browser-warning']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add ngrok-skip-browser-warning header
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// API Routes removed - no authentication needed
// Only health check endpoints remain

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root health check (for Back4app)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    clients: wss ? wss.clients.size : 0,
    uptime: Math.floor(process.uptime())
  });
});

/* ══════════════════════════════════════
   ROOM MANAGER
══════════════════════════════════════ */
/*
  كل غرفة:
  {
    code: 'ABCD',
    host: { ws, color, name, pimg },
    guest: { ws, color, name, pimg } | null,
    createdAt: Date.now()
  }
*/
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

/* توليد كود 6 حروف عشوائي */
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genCode() : code;
}

/* إرسال JSON آمن */
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

/* تنظيف الغرف القديمة كل 5 دقائق (أكثر من 30 دقيقة) */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

/* ══════════════════════════════════════
   HTTP SERVER (Express + WebSocket)
══════════════════════════════════════ */
const server = http.createServer(app);

/* ══════════════════════════════════════
   WEBSOCKET SERVER
══════════════════════════════════════ */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log(`[+] client connected | total: ${wss.clients.size}`);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      /* ══ إنشاء غرفة ══ */
      case 'create': {
        /* لو العميل عنده غرفة قديمة ننظفها */
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
        console.log(`[room] created ${code} | host=${hostColor}`);
        break;
      }

      /* ══ الانضمام لغرفة ══ */
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

        /* أبلغ الضيف */
        send(ws, { type: 'room-joined', code });

        /* ابدأ اللعبة للاثنين */
        const hostName  = room.host.name  || 'المضيف';
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

        // Replay cached profile images (if they were sent before the opponent connected)
        if (room.host.pimg) send(room.guest.ws, { type: 'pimg', img: room.host.pimg });
        if (room.guest.pimg) send(room.host.ws, { type: 'pimg', img: room.guest.pimg });

        console.log(`[room] ${code} started | host=${room.host.color} guest=${room.guest.color}`);
        break;
      }

      /* ══ رسائل اللعبة — بتتنقل للخصم مباشرة ══ */
      case 'move':
      case 'assist':
      case 'resign':
      case 'chat':
      case 'name':
      case 'pimg': {
        // Persist latest name/pimg in the room so late joiners get it.
        const info = getRoomAndSide(ws);
        if (info) {
          const { room, side } = info;
          if (msg.type === 'name') {
            const nm = (msg.name || '').slice(0, 20);
            if (room[side]) room[side].name = nm;
          } else if (msg.type === 'pimg') {
            const img = msg.img || null;
            if (room[side]) room[side].pimg = img;
          }
        }
        relay(ws, msg);
        break;
      }

      /* ══ Ping ══ */
      case 'ping': {
        send(ws, { type: 'pong' });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[-] client disconnected | total: ${wss.clients.size - 1}`);
    leaveRoom(ws);
    clientRoom.delete(ws);
  });

  ws.on('error', () => {});
});

/* ══ Relay — يبعت الرسالة للخصم في نفس الغرفة ══ */
function relay(ws, msg) {
  const code = clientRoom.get(ws);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  const opp = room.host.ws === ws ? room.guest?.ws : room.host.ws;
  if (opp) send(opp, msg);
}

/* ══ مغادرة الغرفة ══ */
function leaveRoom(ws) {
  const code = clientRoom.get(ws);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  /* أبلغ الخصم باستسلام اللاعب */
  const opp = room.host.ws === ws ? room.guest?.ws : room.host.ws;
  if (opp && opp.readyState === WebSocket.OPEN) {
    send(opp, { type: 'resign' });
  }

  /* لو المضيف غادر نحذف الغرفة */
  if (room.host.ws === ws) {
    rooms.delete(code);
    if (room.guest) clientRoom.delete(room.guest.ws);
  } else {
    /* الضيف غادر — نرجع الغرفة لانتظار ضيف جديد */
    room.guest = null;
  }
  clientRoom.delete(ws);
}

/* ══ Heartbeat — نكتشف العملاء المنقطعين ══ */
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

/* ══ Start ══ */
server.listen(PORT, () => {
  console.log(`♟ Chess server running on port ${PORT}`);
});
