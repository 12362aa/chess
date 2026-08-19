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

    /* اسم المستخدم بيتولّد وقت التسجيل: هو الهوية اللي الأصدقاء
       بيلاقوا بيها، والبحث بيه مش بالإيميل عشان مانكشفش إيميلات الناس */
    const username = uniqueUsername(display_name || email);
    const insertUser = db.prepare('INSERT INTO users (email, password_hash, display_name, username, provider) VALUES (?, ?, ?, ?, \'local\')');
    const result = insertUser.run(email, hashedPassword, display_name || '', username);
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
    
    res.json({ token, user: { id: userId, email, display_name, username, provider: 'local' } });
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

    /* حساب دخل بجوجل مالوش باسورد عندنا. bcrypt.compare بـnull بيرمي
       استثناء، فبنمسك الحالة صراحةً ونقول له يدخل بجوجل بدل ما يشوف
       خطأ سيرفر مبهم. */
    if (!user.password_hash) {
      return res.status(409).json({
        error: 'الحساب ده مسجّل بجوجل — استخدم زر «الدخول بجوجل»',
        provider: user.provider || 'google',
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ token, user: { id: user.id, email: user.email, display_name: user.display_name, username: user.username, provider: user.provider, avatar_url: user.avatar_url } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════════
   دخول جوجل
   ──────────────────────────────────────────────────────────────────────
   المبدأ: جوجل بتتأكّد من الهوية بس. إحنا بنصدر نفس الـJWT اللي الدخول
   العادي بيصدره، فالأصدقاء والـWebSocket والحضور مايفرّقوش بين طريقة
   الدخول ولا بيتفرّعوا عليها.

   بنقبل نوعين من التوكن عشان العميل يبقى حر في طريقة الدخول:
     • توكن جوجل مباشر (iss: accounts.google.com) — اللي plugin الدخول
       الأصلي على أندرويد بيرجّعه. بيتأكّد بـgoogle-auth-library مع
       التحقّق إن الجمهور (aud) هو الـweb client بتاع مشروعنا.
     • توكن Firebase (iss: securetoken.google.com/<project>) — لو العميل
       سجّل في Firebase الأول. بيتأكّد بـfirebase-admin.
   التمييز بالـissuer مش بالتخمين.

   الربط بالحساب الموجود بيحصل بالإيميل: لو حد عمل حساب بباسورد وبعدين
   دخل بجوجل بنفس الإيميل، بيبقى نفس الحساب — مش حساب تاني. وبنسيب
   الباسورد القديم شغّال، فالطريقتين بيفتحوا نفس الحساب.
══════════════════════════════════════════════════════════════════════ */

/* الجمهور المسموح: الـweb client بتاع مشروع Firebase. بيتقري من الـenv
   وإلا من google-services.json عشان مايكونش مكتوب في مكانين. */
function googleAudiences() {
  const out = new Set();
  if (process.env.GOOGLE_WEB_CLIENT_ID) out.add(process.env.GOOGLE_WEB_CLIENT_ID.trim());
  try {
    const cfg = require('./android/app/google-services.json');
    for (const c of cfg.client || []) {
      for (const o of c.oauth_client || []) {
        /* type 3 = web client. هو الجمهور اللي plugin أندرويد بيطلب بيه
           الـidToken، فهو اللي لازم نتحقّق منه. */
        if (o.client_type === 3 && o.client_id) out.add(o.client_id);
      }
    }
  } catch (e) { /* الملف مش موجود في بيئة السيرفر — الـenv يكفي */ }
  return [...out];
}

async function verifyGoogleToken(idToken) {
  /* بنقرا الـpayload بدون تحقّق أول خطوة، عشان نعرف نبعته لمين يتحقّق
     منه. القراءة دي مش مصدر ثقة — الثقة بتيجي من الـverify تحت. */
  let iss = '';
  try {
    const part = String(idToken).split('.')[1] || '';
    iss = JSON.parse(Buffer.from(part, 'base64').toString('utf8')).iss || '';
  } catch (e) {
    throw new Error('malformed token');
  }

  if (iss.includes('securetoken.google.com')) {
    const admin = require('firebase-admin');
    if (!admin.apps.length) throw new Error('firebase not initialised on server');
    const d = await admin.auth().verifyIdToken(idToken);
    return {
      uid: d.uid, email: d.email, name: d.name,
      picture: d.picture, emailVerified: d.email_verified !== false,
    };
  }

  if (iss.includes('accounts.google.com')) {
    const audiences = googleAudiences();
    if (!audiences.length) throw new Error('no google client id configured');
    const { OAuth2Client } = require('google-auth-library');
    const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience: audiences });
    const d = ticket.getPayload();
    return {
      uid: d.sub, email: d.email, name: d.name,
      picture: d.picture, emailVerified: d.email_verified !== false,
    };
  }

  throw new Error('unknown token issuer');
}

/* اسم مستخدم فريد مشتق من الإيميل أو الاسم المعروض */
function uniqueUsername(seed) {
  let base = String(seed || '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'player';
  const taken = n => db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(n);
  let candidate = base, i = 1;
  while (taken(candidate)) candidate = base + (++i);
  return candidate;
}

router.post('/google', async (req, res) => {
  try {
    const idToken = req.body && (req.body.idToken || req.body.id_token || req.body.credential);
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    let g;
    try {
      g = await verifyGoogleToken(idToken);
    } catch (e) {
      console.error('[auth/google] verify failed:', e.message);
      return res.status(401).json({ error: 'Google sign-in could not be verified' });
    }

    if (!g.email) return res.status(400).json({ error: 'Google account has no email' });
    /* إيميل غير مؤكّد معناه إن حد ممكن يسجّل بإيميل غيره ويسرق حسابه
       لما صاحبه يدخل بالباسورد. بنرفض. */
    if (!g.emailVerified) return res.status(403).json({ error: 'Google email is not verified' });

    const email = String(g.email).toLowerCase();
    let user = db.prepare('SELECT * FROM users WHERE google_uid = ?').get(g.uid)
            || db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);

    if (user) {
      /* ربط الحساب الموجود بجوجل لو أول مرة، والباسورد بيفضل زي ما هو */
      db.prepare(`UPDATE users SET google_uid = COALESCE(google_uid, ?),
                    avatar_url = COALESCE(?, avatar_url),
                    display_name = CASE WHEN display_name IS NULL OR display_name = '' THEN ? ELSE display_name END,
                    last_login_at = datetime('now')
                  WHERE id = ?`)
        .run(g.uid, g.picture || null, g.name || '', user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    } else {
      const username = uniqueUsername(g.name || email);
      const info = db.prepare(`INSERT INTO users (email, password_hash, display_name, username, provider, avatar_url, google_uid, last_login_at)
                               VALUES (?, NULL, ?, ?, 'google', ?, ?, datetime('now'))`)
        .run(email, g.name || username, username, g.picture || null, g.uid);
      const id = info.lastInsertRowid;

      /* نفس التهيئة بالظبط اللي الدخول العادي بيعملها */
      const defaultSettings = {
        appTheme: 'Amkh', pieceStyle: 'Neo', boardColor: 'خشب',
        showCoordinates: true, highlightLastMove: true, highlightCheck: true,
        showHintPoints: true, hintColor: 'سماوي', confirmExit: true,
        soundEnabled: true, soundVolume: 80,
      };
      db.prepare('INSERT INTO user_settings (user_id, settings_json) VALUES (?, ?)').run(id, JSON.stringify(defaultSettings));
      db.prepare('INSERT OR IGNORE INTO presence (user_id) VALUES (?)').run(id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, display_name: user.display_name,
        username: user.username, provider: user.provider, avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    console.error('[auth/google]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* تغيير اسم المستخدم — الهوية العامة اللي الأصدقاء بيلاقوك بيها */
router.post('/username', authenticateToken, (req, res) => {
  const raw = String((req.body && req.body.username) || '').trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(raw)) {
    return res.status(400).json({ error: 'الاسم لازم يكون 3–16 حرف إنجليزي أو رقم أو _' });
  }
  const clash = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?').get(raw, req.user.id);
  if (clash) return res.status(409).json({ error: 'الاسم محجوز، جرّب غيره' });
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(raw, req.user.id);
  res.json({ username: raw });
});

// جلب بيانات المستخدم
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, display_name, username, provider, avatar_url, created_at, last_login_at FROM users WHERE id = ?').get(req.user.id);
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
