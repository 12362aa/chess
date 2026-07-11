const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'amkh_fallback_secret_key_123';

// Middleware للتحقق من التوكن
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
}

// نقطة إنشاء حساب جديد
router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const checkUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (checkUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const insertUser = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)');
    const result = insertUser.run(email, hashedPassword, display_name || '');
    const userId = result.lastInsertRowid;

    // إضافة إعدادات افتراضية
    const defaultSettings = {
      appTheme: "Amkh",
      pieceStyle: "Neo",
      boardColor: "خشب",
      showCoordinates: true,
      highlightLastMove: true,
      highlightCheck: true,
      showHintPoints: true,
      hintColor: "سماوي",
      confirmExit: true,
      soundEnabled: true,
      soundVolume: 80
    };
    db.prepare('INSERT INTO user_settings (user_id, settings_json) VALUES (?, ?)').run(userId, JSON.stringify(defaultSettings));
    
    // إضافة سجل presence أولي
    db.prepare('INSERT INTO presence (user_id) VALUES (?)').run(userId);

    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ token, user: { id: userId, email, display_name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// نقطة تسجيل الدخول
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ token, user: { id: user.id, email: user.email, display_name: user.display_name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// جلب بيانات المستخدم
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, display_name, created_at, last_login_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// جلب الإعدادات
router.get('/settings', authenticateToken, (req, res) => {
  const row = db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(req.user.id);
  if (row) {
    res.json(JSON.parse(row.settings_json));
  } else {
    res.json({});
  }
});

// تحديث الإعدادات
router.post('/settings', authenticateToken, (req, res) => {
  const settingsObj = req.body;
  if (!settingsObj || typeof settingsObj !== 'object') {
    return res.status(400).json({ error: 'Invalid settings format' });
  }
  
  db.prepare("UPDATE user_settings SET settings_json = ?, updated_at = datetime('now') WHERE user_id = ?")
    .run(JSON.stringify(settingsObj), req.user.id);
    
  res.json({ success: true });
});

// جلب تقدم نور
router.get('/progress', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT stage_number, completed, stars, completed_at FROM nour_progress WHERE user_id = ?').all(req.user.id);
  res.json(rows);
});

// تحديث تقدم نور لمرحلة معينة
router.post('/progress', authenticateToken, (req, res) => {
  const { stage_number, completed, stars } = req.body;
  if (!stage_number) return res.status(400).json({ error: 'stage_number is required' });

  const existing = db.prepare('SELECT stars FROM nour_progress WHERE user_id = ? AND stage_number = ?').get(req.user.id, stage_number);
  
  if (existing) {
    // تحديث فقط إذا كان التقدم الجديد أفضل
    if (stars > existing.stars || (stars === existing.stars && completed)) {
      db.prepare("UPDATE nour_progress SET completed = ?, stars = ?, completed_at = datetime('now') WHERE user_id = ? AND stage_number = ?")
        .run(completed ? 1 : 0, stars || 0, req.user.id, stage_number);
    }
  } else {
    db.prepare("INSERT INTO nour_progress (user_id, stage_number, completed, stars, completed_at) VALUES (?, ?, ?, ?, datetime('now'))")
      .run(req.user.id, stage_number, completed ? 1 : 0, stars || 0);
  }
  res.json({ success: true });
});

// مزامنة البيانات المحلية (Hybrid)
router.post('/sync-local', authenticateToken, (req, res) => {
  const { progress, settings, overwrite } = req.body;
  const userId = req.user.id;
  
  // دمج تقدم نور
  if (progress && Array.isArray(progress)) {
    const insertOrUpdateProgress = db.prepare(`
      INSERT INTO nour_progress (user_id, stage_number, completed, stars, completed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, stage_number) DO UPDATE SET
      completed = excluded.completed,
      stars = MAX(nour_progress.stars, excluded.stars),
      completed_at = datetime('now')
    `);
    
    db.transaction(() => {
      for (const p of progress) {
        insertOrUpdateProgress.run(userId, p.stage, p.completed ? 1 : 0, p.stars || 0);
      }
    })();
  }

  // دمج الإعدادات
  if (settings && typeof settings === 'object') {
    if (overwrite) {
      db.prepare("UPDATE user_settings SET settings_json = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(settings), userId);
    } else {
      // قراءة القديم ودمجه مع الجديد
      const row = db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(userId);
      let currentSettings = {};
      if (row) {
        try { currentSettings = JSON.parse(row.settings_json); } catch (e) {}
      }
      const merged = { ...currentSettings, ...settings };
      db.prepare("UPDATE user_settings SET settings_json = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(merged), userId);
    }
  }

  res.json({ success: true });
});

module.exports = {
  router,
  authenticateToken
};
