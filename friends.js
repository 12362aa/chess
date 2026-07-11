const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

// 1. البحث عن صديق
router.get('/search', authenticateToken, (req, res) => {
  const query = req.query.q;
  if (!query || query.length < 3) {
    return res.status(400).json({ error: 'Search query must be at least 3 characters' });
  }

  // البحث بالإيميل أو الاسم (باستثناء المستخدم نفسه)
  const users = db.prepare(`
    SELECT id, email, display_name 
    FROM users 
    WHERE id != ? AND (email LIKE ? OR display_name LIKE ?)
    LIMIT 10
  `).all(req.user.id, `%${query}%`, `%${query}%`);

  res.json(users);
});

// 2. إرسال طلب صداقة
router.post('/request', authenticateToken, (req, res) => {
  const { receiver_id } = req.body;
  const sender_id = req.user.id;

  if (!receiver_id || sender_id === receiver_id) {
    return res.status(400).json({ error: 'Invalid receiver' });
  }

  // التأكد أن الطرف الآخر موجود
  const receiver = db.prepare('SELECT id FROM users WHERE id = ?').get(receiver_id);
  if (!receiver) return res.status(404).json({ error: 'User not found' });

  // هل هم أصدقاء بالفعل؟
  const isFriend = db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(sender_id, receiver_id);
  if (isFriend) return res.status(400).json({ error: 'Already friends' });

  // هل يوجد طلب وارد من الطرف الآخر؟ (القبول التلقائي)
  const incomingReq = db.prepare('SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"').get(receiver_id, sender_id);
  if (incomingReq) {
    db.transaction(() => {
      // حذف الطلب وإضافة الصداقة بالاتجاهين
      db.prepare('DELETE FROM friend_requests WHERE id = ?').run(incomingReq.id);
      db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)').run(sender_id, receiver_id, receiver_id, sender_id);
    })();
    return res.json({ success: true, message: 'Friend request accepted automatically' });
  }

  // إضافة طلب جديد (تجاهل لو كان موجود مسبقاً)
  try {
    db.prepare('INSERT INTO friend_requests (sender_id, receiver_id) VALUES (?, ?)').run(sender_id, receiver_id);
    res.json({ success: true, message: 'Request sent' });
  } catch (e) {
    // خطأ Unique Constraint
    res.status(400).json({ error: 'Request already exists' });
  }
});

// 3. جلب الطلبات الواردة والصادرة
router.get('/requests', authenticateToken, (req, res) => {
  const userId = req.user.id;

  const incoming = db.prepare(`
    SELECT r.id, r.sender_id as user_id, u.email, u.display_name, r.created_at
    FROM friend_requests r
    JOIN users u ON r.sender_id = u.id
    WHERE r.receiver_id = ? AND r.status = 'pending'
  `).all(userId);

  const outgoing = db.prepare(`
    SELECT r.id, r.receiver_id as user_id, u.email, u.display_name, r.created_at
    FROM friend_requests r
    JOIN users u ON r.receiver_id = u.id
    WHERE r.sender_id = ? AND r.status = 'pending'
  `).all(userId);

  res.json({ incoming, outgoing });
});

// 4. قبول/رفض طلب صداقة
router.post('/respond', authenticateToken, (req, res) => {
  const { request_id, action } = req.body; // action: 'accept' | 'decline'
  const userId = req.user.id;

  const request = db.prepare('SELECT sender_id FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = "pending"').get(request_id, userId);
  
  if (!request) return res.status(404).json({ error: 'Request not found' });

  if (action === 'accept') {
    db.transaction(() => {
      db.prepare('UPDATE friend_requests SET status = "accepted" WHERE id = ?').run(request_id);
      // إضافة بالاتجاهين
      const checkFriendship = db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(userId, request.sender_id);
      if (!checkFriendship) {
        db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)').run(userId, request.sender_id, request.sender_id, userId);
      }
    })();
    res.json({ success: true, message: 'Request accepted' });
  } else if (action === 'decline') {
    db.prepare('UPDATE friend_requests SET status = "declined" WHERE id = ?').run(request_id);
    res.json({ success: true, message: 'Request declined' });
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
});

// 5. جلب قائمة الأصدقاء مع حالتهم
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  const friends = db.prepare(`
    SELECT u.id, u.email, u.display_name, p.is_online, p.last_seen_at
    FROM friendships f
    JOIN users u ON f.friend_id = u.id
    LEFT JOIN presence p ON u.id = p.user_id
    WHERE f.user_id = ?
  `).all(userId);

  res.json(friends);
});

// 6. إزالة صديق
router.delete('/:friendId', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const friendId = req.params.friendId;

  db.transaction(() => {
    db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(userId, friendId);
    db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(friendId, userId);
  })();

  res.json({ success: true, message: 'Friend removed' });
});

// ملاحظة: دعوة الأصدقاء للعب (/api/friends/invite) سيتم معالجتها في server.js بسبب حاجتها للوصول للـ WebSocket وخريطة المستخدمين
module.exports = router;
