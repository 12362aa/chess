const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
const mailer = require('./mailer');

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

/* ══════════════════════════════════════════════════════════════════════
   #13 — إنشاء الحساب اليدوي بتأكيد البريد
   ──────────────────────────────────────────────────────────────────────
   قبل كده: تكتب أي بريد وكلمة مرور فيتعمل حساب في اللحظة. النتيجة إن
   نصّ الحسابات ببريد فيه غلطة مطبعية أو ببريد حدّ تاني — وصاحبه يوم
   ما ينسى كلمته مايقدرش يسترجعها لأن رمز الاستعادة بيروح لبريد مش
   بريده، والحساب بكل تقدّمه بيضيع. وكمان كان ينفع تعمل حسابات ببريد
   ناس تانية.
   بقى المسار خطوتين:
     POST /api/register         { email, password, display_name }  → يبعت الرمز
     POST /api/register-verify  { email, code }                    → يعمل الحساب
   الحساب مايتكتبش في users غير في الخطوة التانية. لحد ساعتها الطلب في
   pending_signups ببصمة bcrypt لكلمة المرور، فلا حساب نصف جاهز ولا
   كلمة مرور خام في القاعدة.

   توافق النسخ المنشورة: البِنى القديمة (٢٨ وأقل) بتتوقّع {token,user}
   من /register فورًا. لو غيّرنا الردّ عليها كل واحد ماحدّشش التطبيق
   مش هيقدر يعمل حسابًا خالص. فالتأكيد بيسري على العميل اللي بيعلن إنه
   يعرفه (verify_flow) — ولما الناس تحدّث، AMKH_REQUIRE_VERIFIED_SIGNUP=1
   بتقفل الباب القديم بلا لمس كود.
══════════════════════════════════════════════════════════════════════ */
const SIGNUP_TTL_MIN = 15;
const SIGNUP_COOLDOWN_MS = 60000;
const SIGNUP_MAX_PER_HOUR = 5;
const SIGNUP_MAX_ATTEMPTS = 5;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* ══════════════════════════════════════════════════════════════════════
   التحقّق من البريد قبل الإرسال — بلاغ «الرمز وصل على بريد الخادم»
   ──────────────────────────────────────────────────────────────────────
   اللي حصل بالظبط: المستخدم كتب بريدًا **مش موجود** (نطاقه سليم، الحساب
   لأ). جيميل قبل الرسالة منّنا، وبعد عشر دقايق رجّعها كـ«فشل تسليم»
   (550 5.1.1) لصاحب حساب الإرسال — ورسالة الارتجاع جوّاها الرسالة
   الأصلية بالرمز. فالنتيجة من عين المستخدم: «الرمز مابيوصلش لي، وبيوصل
   لبريد التطبيق نفسه، وبعد وقت طويل». مافيش أي خطأ في المستلم: الخادم
   كان بيبعت للعنوان المكتوب حرفيًا.

   منفذ ٢٥ محجوب على شبكتنا (مزوّد الإنترنت)، فسؤال خادم الوارد
   «الصندوق موجود؟» (RCPT) مش متاح. فبنقفل الباب على أكثر حالة واقعية
   وهي الغلط المطبعي، بتلات طبقات رخيصة كلها قبل أي إرسال:

     ١) صيغة أدقّ: نقطة في الأول/الآخر أو نقطتان متتاليتان أو نطاق بلا
        امتداد حقيقي — كلها مرفوضة (EMAIL_RE وحده كان بيقبلها).
     ٢) نطاقات شائعة الغلط: gmial/gmai/gmail.co… ليها تصحيح مقترح بالاسم.
     ٣) سجلّ MX حقيقي للنطاق: نطاق مابيستقبلش بريدًا خالص = رفض فوري.
        الاستعلام ~١٥٠ms ومحفوظ في ذاكرة مؤقتة ساعة، ولو الـDNS نفسه
        باظ بنفتح الباب (fail-open) عشان مانقفلش التسجيل بسبب شبكتنا.
     ٤) قواعد جيميل المنشورة للاسم: ٦–٣٠ محرفًا، حروف/أرقام/نقط فقط.
        (فبريد فيه شرطة سفلية أو ناقص حروف بيتمسك هنا قبل ما يتحوّل
        لرسالة مرتجعة.)
══════════════════════════════════════════════════════════════════════ */
const dnsp = require('dns').promises;

const DOMAIN_TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmail.om': 'gmail.com', 'g-mail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'icloud.co': 'icloud.com',
};
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const mxCache = new Map();   // نطاق → { ok, at }

async function domainAcceptsMail(domain) {
  const hit = mxCache.get(domain);
  if (hit && Date.now() - hit.at < 3600000) return hit.ok;
  let ok = null;                                   // null = مش متأكدين
  try {
    const mx = await dnsp.resolveMx(domain);
    ok = !!(mx && mx.length && mx.some(r => r.exchange));
  } catch (e) {
    /* NXDOMAIN/NODATA = النطاق مش بيستقبل بريدًا. أي عطل تانٍ (انقطاع،
       تايم أوت) مش ذنب المستخدم فبنعدّيه. */
    if (e && (e.code === 'ENOTFOUND' || e.code === 'ENODATA')) {
      /* نطاق بلا MX ممكن يستقبل على سجلّ A حسب المعيار — بنجرّب */
      try { const a = await dnsp.resolve(domain); ok = !!(a && a.length); }
      catch (e2) { ok = false; }
    } else ok = null;
  }
  if (ok !== null) mxCache.set(domain, { ok, at: Date.now() });
  return ok === null ? true : ok;
}

/* بترجّع نصّ خطأ للمستخدم، أو null لو البريد مقبول. */
async function emailProblem(email) {
  if (!EMAIL_RE.test(email)) return 'أدخل بريدًا إلكترونيًا صحيحًا';
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at), domain = email.slice(at + 1);
  if (local.length > 64 || email.length > 254) return 'البريد طويل بشكل غير معتاد — راجع كتابته';
  if (/^\.|\.$|\.\./.test(local)) return 'البريد يحتوي نقطة في مكان غير صحيح — راجع كتابته';
  if (/[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]/.test(local)) return 'البريد يحتوي محارف غير مسموحة — راجع كتابته';
  if (/^[.-]|[.-]$|\.\.|^-|-\./.test(domain) || !/^[A-Za-z0-9.-]+$/.test(domain)) {
    return 'اسم نطاق البريد غير صحيح — راجع كتابته';
  }
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (tld.length < 2 || /[^A-Za-z]/.test(tld)) return 'امتداد البريد غير صحيح — راجع كتابته';

  const fix = DOMAIN_TYPOS[domain];
  if (fix) return `يبدو أن هناك خطأ مطبعيًا: هل تقصد ${local}@${fix} ؟`;

  if (GMAIL_DOMAINS.has(domain)) {
    /* قواعد جوجل المعلنة لاسم المستخدم — جيميل بيتجاهل النقط في التوجيه
       لكنه مايسمحش بغيرها، فالشرطة السفلية مثلًا = حساب مش موجود يقينًا. */
    const bare = local.replace(/\./g, '');
    if (!/^[A-Za-z0-9]+$/.test(bare)) {
      return 'حسابات جيميل تسمح بالحروف والأرقام والنقط فقط — راجع كتابة بريدك';
    }
    if (bare.length < 6) return 'اسم حساب جيميل لا يقل عن 6 محارف — راجع كتابة بريدك';
    if (bare.length > 30) return 'اسم حساب جيميل لا يزيد عن 30 محرفًا — راجع كتابة بريدك';
  }
  if (!(await domainAcceptsMail(domain))) {
    return `النطاق «${domain}» لا يستقبل بريدًا — راجع كتابة بريدك`;
  }
  return null;
}


/* الإعدادات الافتراضية لأي حساب جديد.
   ──────────────────────────────────────────────────────────────
   كانت بتزرع بلوب بأسماء مفاتيح مش موجودة في العميل خالص
   (appTheme / boardColor / soundEnabled / hintColor …) — محدّش بيقرأها،
   وواحد منها (pieceStyle:'Neo') بيتقاطع مع مفتاح حقيقي في Cfg، فأول
   تنزيل لحساب جديد كان بيرجّع شكل القطع للافتراضي فوق اختيار المستخدم.
   الصح إن حساب جديد يبدأ فاضي: أول رفع من الجهاز هو اللي بيحدّد إعداداته،
   والقيم الافتراضية بتعيش في العميل (Cfg.data) مش في القاعدة. */
function defaultSettings() {
  return {};
}

/* كتابة الحساب فعلًا. الصفوف التلاتة (users + user_settings + presence)
   في معاملة واحدة: حساب بلا صفّ إعدادات كان بيطلّع أعطالًا غامضة بعدين. */
function createLocalAccount({ email, passwordHash, displayName }) {
  /* اسم المستخدم بيتولّد وقت التسجيل: هو الهوية اللي الأصدقاء
     بيلاقوا بيها، والبحث بيه مش بالإيميل عشان مانكشفش إيميلات الناس */
  const username = uniqueUsername(displayName || email);
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO users (email, password_hash, display_name, username, provider)
                             VALUES (?, ?, ?, ?, 'local')`)
      .run(email, passwordHash, displayName || '', username);
    const uid = info.lastInsertRowid;
    db.prepare('INSERT INTO user_settings (user_id, settings_json) VALUES (?, ?)')
      .run(uid, JSON.stringify(defaultSettings()));
    db.prepare('INSERT OR IGNORE INTO presence (user_id) VALUES (?)').run(uid);
    return uid;
  })();
  return { id, email, display_name: displayName || '', username, provider: 'local' };
}

function signToken(id, email) {
  return jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const displayName = String(b.display_name || '').trim();
    /* العميل الجديد بيعلن إنه يعرف خطوة التأكيد */
    const wantsVerify = !!(b.verify_flow || b.verifyFlow);
    const forceVerify = process.env.AMKH_REQUIRE_VERIFIED_SIGNUP === '1';

    if (!email || !password) {
      return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    }
    /* فحص أعمق قبل أي إرسال: بريد مش موجود معناه رمز بيتوه في رسالة
       مرتجعة، ومستخدم بيستنّى مافيش حاجة جاية. */
    const bad = await emailProblem(email);
    if (bad) return res.status(400).json({ error: bad, email_invalid: true });

    const taken = db.prepare('SELECT id, provider FROM users WHERE lower(email) = ?').get(email);
    if (taken) {
      /* الردّ هنا بيكشف إن البريد عنده حساب — وده مقصود: المستخدم لازم
         يعرف يعمل إيه، والبديل («تم، شوف بريدك») بيسيبه مستنّي رسالة
         عمرها ماتيجي. نفس اختيار كل التطبيقات اللي فيها تسجيل. */
      return res.status(409).json({
        error: taken.provider === 'google'
          ? 'هذا البريد مسجَّل بحساب جوجل — استخدم زرّ «المتابعة بحساب جوجل»'
          : 'هذا البريد مسجَّل بالفعل — سجّل الدخول أو استخدم «نسيت كلمة المرور»',
        exists: true, provider: taken.provider || 'local',
      });
    }

    /* تنظيف الطلبات الميتة: صفّ فات وقته بساعة مالوش أي معنى، وسيبانه
       معناه إن الكولداون بيفضل ساري على بريد نسي صاحبه الموضوع خلاص. */
    try {
      db.prepare('DELETE FROM pending_signups WHERE expires_at < ?').run(Date.now() - 3600000);
    } catch (e) {}

    /* مسار التوافق: عميل قديم + الإجبار مقفول → الحساب يتعمل فورًا.
       ولو البريد مش مهيّأ على الخادم بنعمله برضه: قفل التسجيل على كل
       الناس لأن متغيّر بيئة ناقص أسوأ بكتير من تسجيل بلا تأكيد، والبلاغ
       بيروح للّوج عشان يتصلّح. */
    const mailOk = mailer.ready();
    if (!mailOk) {
      console.error('[register] SMTP غير مهيّأ (' + mailer.status().missing.join(', ')
        + ') — التسجيل ماشي بلا تأكيد بريد');
    }
    if ((!wantsVerify && !forceVerify) || !mailOk) {
      if (!mailOk && forceVerify) {
        return res.status(503).json({ error: 'خدمة البريد غير مهيّأة على الخادم حاليًا. جرّب لاحقًا.' });
      }
      const hash = await bcrypt.hash(password, 10);
      const user = createLocalAccount({ email, passwordHash: hash, displayName });
      return res.json({ token: signToken(user.id, email), user });
    }

    return await requestSignupCode(res, { email, password, displayName });
  } catch (error) {
    console.error('[register]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* توليد رمز التأكيد وحفظ الطلب وإرساله. نفس الدالة بتخدم الطلب الأول
   وإعادة الإرسال — إعادة الإرسال هي نفس النداء بنفس البريد. */
async function requestSignupCode(res, { email, password, displayName }) {
  const now = Date.now();
  const prev = db.prepare('SELECT sent_at, hour_start, hour_count FROM pending_signups WHERE email = ?').get(email);
  if (prev) {
    if (now - Number(prev.sent_at || 0) < SIGNUP_COOLDOWN_MS) {
      const wait = Math.ceil((SIGNUP_COOLDOWN_MS - (now - Number(prev.sent_at))) / 1000);
      /* pending:true بتقول للعميل «عندك رمز في بريدك بالفعل» فيوديه على
         خانة الرمز بدل ما يسيبه يدوس «إنشاء» ويتفرّج على «انتظر». */
      return res.status(429).json({
        error: `انتظر ${secondsAr(wait)} قبل طلب رمز جديد`,
        retry_after: wait, pending: true, ttl_minutes: SIGNUP_TTL_MIN,
      });
    }
    if (now - Number(prev.hour_start || 0) < 3600000 && Number(prev.hour_count || 0) >= SIGNUP_MAX_PER_HOUR) {
      return res.status(429).json({ error: 'طلبت رموزًا كثيرة لهذا البريد. جرّب بعد ساعة.', pending: true });
    }
  }
  const hStart = (prev && now - Number(prev.hour_start || 0) < 3600000) ? Number(prev.hour_start) : now;
  const hCount = (prev && now - Number(prev.hour_start || 0) < 3600000) ? Number(prev.hour_count || 0) + 1 : 1;

  const code = makeResetCode();
  const [codeHash, passHash] = await Promise.all([bcrypt.hash(code, 10), bcrypt.hash(password, 10)]);
  db.prepare(`INSERT INTO pending_signups (email, code_hash, password_hash, display_name, expires_at, attempts, sent_at, hour_start, hour_count)
              VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
              ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,
                password_hash=excluded.password_hash, display_name=excluded.display_name,
                expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at,
                hour_start=excluded.hour_start, hour_count=excluded.hour_count`)
    .run(email, codeHash, passHash, displayName || '', now + SIGNUP_TTL_MIN * 60000, now, hStart, hCount);

  try {
    await mailer.sendSignupCode({ to: email, code, name: displayName, minutes: SIGNUP_TTL_MIN });
  } catch (e) {
    /* ماوصلش بريد → مانسيبش كولداون على رمز مش موجود */
    db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);
    console.error('[register] فشل إرسال رمز التأكيد:', e.message);
    return res.status(502).json({ error: 'تعذّر إرسال البريد الآن. تأكّد من صحة بريدك وأعِد المحاولة.' });
  }
  return res.json({ ok: true, verify: true, email, ttl_minutes: SIGNUP_TTL_MIN });
}

/* الخطوة التانية: الرمز صحيح → الحساب يتولد ويتسجّل دخوله على طول.
   كلمة المرور مش بتترحّل من العميل تاني — بصمتها محفوظة من الخطوة
   الأولى، فحتى لو حد شاف الطلب ده مافيهوش كلمة مرور. */
router.post('/register-verify', async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const code = String(b.code || '').replace(/\D/g, '');
    if (!email || !code) return res.status(400).json({ error: 'البريد والرمز مطلوبان' });

    const row = db.prepare('SELECT * FROM pending_signups WHERE email = ?').get(email);
    if (!row || Number(row.expires_at) < Date.now()) {
      if (row) db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);
      return res.status(400).json({ error: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.', expired: true });
    }
    if (Number(row.attempts) >= SIGNUP_MAX_ATTEMPTS) {
      db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);
      return res.status(429).json({ error: 'تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.', expired: true });
    }

    const okCode = await bcrypt.compare(code, row.code_hash);
    if (!okCode) {
      const left = SIGNUP_MAX_ATTEMPTS - (Number(row.attempts) + 1);
      db.prepare('UPDATE pending_signups SET attempts = attempts + 1 WHERE email = ?').run(email);
      if (left <= 0) {
        db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);
        return res.status(429).json({ error: 'تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.', expired: true });
      }
      return res.status(400).json({ error: `الرمز غير صحيح — باقي لك ${attemptsAr(left)}`, attempts_left: left });
    }

    /* سبق حدّ وسجّل بنفس البريد وإحنا مستنيين الرمز (أو دخل بجوجل) */
    const clash = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (clash) {
      db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);
      return res.status(409).json({ error: 'هذا البريد مسجَّل بالفعل — سجّل الدخول', exists: true });
    }

    const user = createLocalAccount({
      email, passwordHash: row.password_hash, displayName: row.display_name || '',
    });
    db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    res.json({ ok: true, token: signToken(user.id, email), user });
  } catch (error) {
    console.error('[register-verify]', error);
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
        error: 'هذا الحساب مسجَّل بجوجل — استخدم زرّ «الدخول بجوجل»',
        provider: user.provider || 'google',
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ token, user: { id: user.id, email: user.email, display_name: user.display_name, username: user.username, provider: user.provider, avatar_url: user.avatar_url, country: user.country } });
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
      /* ربط الحساب الموجود بجوجل لو أول مرة، والباسورد بيفضل زي ما هو.

         الصورة: كان مكتوب avatar_url = COALESCE(?, avatar_url) — يعني صورة
         جوجل بتكتب فوق أي صورة. ولأن جوجل دايمًا بيرجّع picture، كل تسجيل
         دخول كان بيمحي الصورة اللي المستخدم رفعها من الإعدادات ويحلّ محلها
         رابط https من جوجل. والعميل بيرفض يملأ صورته المحلية من رابط http،
         فبعد إعادة التثبيت المستخدم مايلاقيش صورة خالص — لا بتاعته ولا
         بتاعة جوجل. الصورة المرفوعة (data:) هي اختيار صريح من المستخدم،
         فهي أولى من صورة جوجل التلقائية. */
      db.prepare(`UPDATE users SET google_uid = COALESCE(google_uid, ?),
                    avatar_url = CASE WHEN avatar_url LIKE 'data:%' THEN avatar_url
                                      ELSE COALESCE(?, avatar_url) END,
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

      /* صفّ إعدادات فاضي — نفس اللي defaultSettings() بتعمله للدخول العادي.
         الصفّ نفسه لازم يتعمل (كود بعدين بيفترض وجوده)، لكن محتواه يفضل
         فاضي لحد ما الجهاز يرفع إعداداته الحقيقية. */
      db.prepare('INSERT INTO user_settings (user_id, settings_json) VALUES (?, ?)').run(id, JSON.stringify(defaultSettings()));
      db.prepare('INSERT OR IGNORE INTO presence (user_id) VALUES (?)').run(id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, display_name: user.display_name,
        username: user.username, provider: user.provider, avatar_url: user.avatar_url,
        country: user.country,
      },
    });
  } catch (error) {
    console.error('[auth/google]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ══════════════════════════════════════════════════════════════════════
   #6 — نسيت كلمة المرور: رمز من ٦ أرقام يوصل على البريد
   ──────────────────────────────────────────────────────────────────────
   الدخول اليدوي ماكانش له أي طريق للرجوع لو المستخدم نسي كلمته: يفضل
   مقفول خارج حسابه للأبد. المسار خطوتان بس:
     POST /api/forgot-password  { email }                      → يبعت الرمز
     POST /api/reset-password   { email, code, password }      → يغيّرها

   قرارات أمنية مقصودة:
   • الردّ على forgot-password **موحّد دائمًا** («لو البريد مسجّل هيوصلك
     رمز») — سواء الحساب موجود أو لا أو مرتبط بجوجل. أي تفريق في الردّ
     يحوّل المسار لأداة تكشف مَن عنده حساب عندنا. المستخدم الحقيقي بيعرف
     الحقيقة في بريده: حساب جوجل بيوصله بريد يقوله «ادخل بزر جوجل».
   • بنخزّن بصمة bcrypt للرمز لا الرمز نفسه.
   • التقييد بالبريد لا بالـIP: الخادم خلف نفق (cloudflared/ngrok) وبلا
     إعداد trust proxy، فكل الطلبات بتبان جاية من عنوان واحد — تقييد
     بالـIP كان معناه إن أول مستخدم يستهلك الحدّ للناس كلها. فالكولداون
     (٦٠ ثانية) والسقف (٥ في الساعة) محسوبين لكل بريد على حدة.
   • ٥ محاولات خاطئة بتحرق الرمز — ١٠٠٠٠٠٠ احتمال ÷ ٥ محاولات يعني
     التخمين غير عملي.
══════════════════════════════════════════════════════════════════════ */
const RESET_TTL_MIN = 15;          // صلاحية الرمز بالدقائق
const RESET_COOLDOWN_MS = 60000;   // أقل فاصل بين طلبين لنفس البريد
const RESET_MAX_PER_HOUR = 5;
const RESET_MAX_ATTEMPTS = 5;

/* تصريف المعدود العربي: 1 و2 لهما صيغتهما بلا رقم، و3-10 جمع، و11+ مفرد.
   الرسائل دي بتوصل للمستخدم فمافيش «باقي لك 1 محاولة». */
function attemptsAr(n) {
  if (n === 1) return 'محاولة واحدة';
  if (n === 2) return 'محاولتان';
  return n + ' ' + ((n >= 3 && n <= 10) ? 'محاولات' : 'محاولة');
}
function secondsAr(n) {
  if (n === 1) return 'ثانية واحدة';
  if (n === 2) return 'ثانيتين';
  return n + ' ' + ((n >= 3 && n <= 10) ? 'ثوانٍ' : 'ثانية');
}

/* رمز من ٦ أرقام بمولّد آمن تشفيريًا. Math.random متوقّع، والرمز ده
   مفتاح حساب — فبناخده من crypto. */
function makeResetCode() {
  const crypto = require('crypto');
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/* الردّ الموحّد: نفس النصّ ونفس الحالة في كل الأحوال. */
function resetAccepted(res) {
  return res.json({
    ok: true,
    message: 'إذا كان البريد مسجَّلًا لدينا فسيصلك رمز إعادة التعيين خلال دقيقة.',
    ttl_minutes: RESET_TTL_MIN,
  });
}

router.post('/forgot-password', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا' });
  }
  if (!mailer.ready()) {
    /* الخادم مش مهيّأ للبريد: بلاغ صريح بدل صمت يخلّي المستخدم يستنى
       رسالة عمرها ما هتيجي. */
    console.error('[forgot-password] SMTP غير مهيّأ:', mailer.status().missing.join(', '));
    return res.status(503).json({ error: 'خدمة البريد غير مهيّأة على الخادم حاليًا. جرّب لاحقًا.' });
  }

  const now = Date.now();
  const prev = db.prepare('SELECT sent_at, hour_start, hour_count FROM password_resets WHERE email = ?').get(email);
  if (prev) {
    if (now - Number(prev.sent_at || 0) < RESET_COOLDOWN_MS) {
      const wait = Math.ceil((RESET_COOLDOWN_MS - (now - Number(prev.sent_at))) / 1000);
      return res.status(429).json({ error: `انتظر ${secondsAr(wait)} قبل طلب رمز جديد`, retry_after: wait });
    }
    const hStart = Number(prev.hour_start || 0);
    if (now - hStart < 3600000 && Number(prev.hour_count || 0) >= RESET_MAX_PER_HOUR) {
      return res.status(429).json({ error: 'طلبت رموزًا كثيرة. جرّب بعد ساعة.' });
    }
  }

  const user = db.prepare('SELECT id, email, display_name, password_hash, provider FROM users WHERE lower(email) = ?').get(email);

  /* بريد غير مسجَّل: مانبعتش حاجة ومانكتبش صفًّا (عشان مايتحوّلش الجدول
     لمخزن بريد مجهول)، والردّ زي الناجح بالحرف. */
  if (!user) return resetAccepted(res);

  const hStart = (prev && now - Number(prev.hour_start || 0) < 3600000) ? Number(prev.hour_start) : now;
  const hCount = (prev && now - Number(prev.hour_start || 0) < 3600000) ? Number(prev.hour_count || 0) + 1 : 1;

  /* حساب جوجل بلا كلمة مرور: نبعت له بريدًا يشرح الطريق الصحيح — بدون
     رمز، وبدون تغيير في الردّ. وبنسجّل الطلب في الجدول عشان الكولداون
     يسري عليه كذلك فمايتحوّلش لمرسال بريد مجاني. */
  if (!user.password_hash) {
    db.prepare(`INSERT INTO password_resets (email, code_hash, expires_at, attempts, sent_at, hour_start, hour_count)
                VALUES (?, '-', 0, 0, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET code_hash='-', expires_at=0, attempts=0,
                  sent_at=excluded.sent_at, hour_start=excluded.hour_start, hour_count=excluded.hour_count`)
      .run(email, now, hStart, hCount);
    mailer.sendGoogleNotice({ to: user.email, name: user.display_name })
      .catch(e => console.error('[forgot-password] فشل بريد تنبيه جوجل:', e.message));
    return resetAccepted(res);
  }

  const code = makeResetCode();
  const codeHash = await bcrypt.hash(code, 10);
  db.prepare(`INSERT INTO password_resets (email, code_hash, expires_at, attempts, sent_at, hour_start, hour_count)
              VALUES (?, ?, ?, 0, ?, ?, ?)
              ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,
                expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at,
                hour_start=excluded.hour_start, hour_count=excluded.hour_count`)
    .run(email, codeHash, now + RESET_TTL_MIN * 60000, now, hStart, hCount);

  try {
    await mailer.sendResetCode({ to: user.email, code, name: user.display_name, minutes: RESET_TTL_MIN });
  } catch (e) {
    /* الإرسال فشل: نمسح الصفّ عشان مايفضلش كولداون على رمز ماوصلش،
       والمستخدم يقدر يجرّب تاني فورًا. */
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    console.error('[forgot-password] فشل الإرسال:', e.message);
    return res.status(502).json({ error: 'تعذّر إرسال البريد الآن. جرّب مرة أخرى.' });
  }
  return resetAccepted(res);
});

router.post('/reset-password', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
  const password = String((req.body && req.body.password) || '');
  if (!email || !code || !password) {
    return res.status(400).json({ error: 'البريد والرمز وكلمة المرور مطلوبة' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }

  const row = db.prepare('SELECT code_hash, expires_at, attempts FROM password_resets WHERE email = ?').get(email);
  /* رمز غير موجود أو منتهٍ أو بتاع حساب جوجل ('-') — كلهم نفس الردّ. */
  if (!row || row.code_hash === '-' || Number(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    return res.status(400).json({ error: 'الرمز غير صحيح أو انتهت صلاحيته', expired: true });
  }
  if (Number(row.attempts) >= RESET_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    return res.status(429).json({ error: 'تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.', expired: true });
  }

  const okCode = await bcrypt.compare(code, row.code_hash);
  if (!okCode) {
    const left = RESET_MAX_ATTEMPTS - (Number(row.attempts) + 1);
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?').run(email);
    if (left <= 0) {
      db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
      return res.status(429).json({ error: 'تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.', expired: true });
    }
    return res.status(400).json({ error: `الرمز غير صحيح — باقي لك ${attemptsAr(left)}`, attempts_left: left });
  }

  const user = db.prepare('SELECT id, email, display_name, username, provider, avatar_url, country FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    return res.status(400).json({ error: 'الرمز غير صحيح أو انتهت صلاحيته', expired: true });
  }

  const hash = await bcrypt.hash(password, 10);
  db.prepare("UPDATE users SET password_hash = ?, last_login_at = datetime('now') WHERE id = ?").run(hash, user.id);
  db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);

  /* بندخّله فورًا: هو أثبت ملكية البريد وعرف كلمة المرور الجديدة، فطلب
     تسجيل دخول تاني بعد كل ده خطوة زايدة بلا فايدة أمنية. */
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token, user });
});

/* تشخيص إعداد البريد — بلا أي سرّ في الردّ. للتشغيل والصيانة فقط. */
router.get('/mail-status', (req, res) => res.json(mailer.status()));


router.post('/username', authenticateToken, (req, res) => {
  const raw = String((req.body && req.body.username) || '').trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(raw)) {
    return res.status(400).json({ error: 'يجب أن يكون الاسم من 3 إلى 16 حرفًا إنجليزيًا أو رقمًا أو _' });
  }
  const clash = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?').get(raw, req.user.id);
  if (clash) return res.status(409).json({ error: 'الاسم محجوز، جرّب اسمًا آخر' });
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(raw, req.user.id);
  res.json({ username: raw });
});

/* الاسم المعروض — الاسم اللي أصدقاؤك وخصومك بيشوفوه (بيقبل العربي).
   ده مربوط بخانة «اسم اللاعب» في الإعدادات: قبل كده كانت محلية بحتة، فلو
   المستخدم شال التطبيق أو دخل من جهاز تاني الاسم يضيع. */
router.post('/display-name', authenticateToken, (req, res) => {
  const raw = String((req.body && (req.body.display_name || req.body.name)) || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')   /* محارف تحكّم بتبوّظ العرض */
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);                            /* نفس سقف خانة الإعدادات */
  if (raw === '') {
    /* فاضي = رجّعني للاسم التلقائي (اسم المستخدم) */
    const u = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    const fallback = (u && u.username) || 'لاعب';
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(fallback, req.user.id);
    return res.json({ success: true, display_name: fallback });
  }
  if (raw.length < 2) return res.status(400).json({ error: 'الاسم قصير جدًا' });
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(raw, req.user.id);
  res.json({ success: true, display_name: raw });
});

/* حفظ صورة الملف الشخصي على الخادم عشان الأصدقاء يشوفوها في القائمة.
   الصورة بتوصل كـ data URL متصغّرة من العميل (96×96 JPEG ≈ كام كيلوبايت).
   سلسلة فاضية = مسح الصورة. السقف 80KB أقل بأمان من حد express.json
   الافتراضي (100KB) فالطلب مايترفضش قبل ما يوصل هنا. */
router.post('/avatar', authenticateToken, (req, res) => {
  const url = (req.body && typeof req.body.avatar_url === 'string') ? req.body.avatar_url.trim() : '';
  if (url === '') {
    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user.id);
    return res.json({ success: true, avatar_url: null });
  }
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(url)) {
    return res.status(400).json({ error: 'صيغة الصورة غير مدعومة' });
  }
  if (url.length > 80000) {
    return res.status(413).json({ error: 'الصورة كبيرة جدًا' });
  }
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);
  res.json({ success: true, avatar_url: url });
});

// تحديث دولة اللاعب (كود ISO alpha-2، أو فاضي للمسح) — تُستخدم لعلَم لوحة الصدارة
router.post('/country', authenticateToken, (req, res) => {
  let code = (req.body && typeof req.body.country === 'string') ? req.body.country.trim().toUpperCase() : '';
  if (code === '' || code === 'XX') {
    db.prepare('UPDATE users SET country = NULL WHERE id = ?').run(req.user.id);
    return res.json({ success: true, country: null });
  }
  if (!/^[A-Z]{2}$/.test(code)) return res.status(400).json({ error: 'كود دولة غير صالح' });
  db.prepare('UPDATE users SET country = ? WHERE id = ?').run(code, req.user.id);
  res.json({ success: true, country: code });
});

// جلب بيانات المستخدم
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare(`SELECT id, email, display_name, username, provider, avatar_url, created_at, last_login_at,
                                  rating, rating_rd, rating_games, rating_peak, wins, losses, draws, country
                           FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // ملخّص تقييم جاهز للعرض (provisional لو RD>110)
  const rd = isFinite(user.rating_rd) ? user.rating_rd : 350;
  user.rating = Math.round(isFinite(user.rating) ? user.rating : 1500);
  user.rating_rd = Math.round(rd);
  user.rating_peak = Math.round(isFinite(user.rating_peak) ? user.rating_peak : 1500);
  user.provisional = rd > 110;
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
  const rows = db.prepare('SELECT stage_number, completed, stars, best_moves, completed_at FROM nour_progress WHERE user_id = ?').all(req.user.id);
  res.json(rows);
});

// تحديث تقدم نور لمرحلة معينة
router.post('/progress', authenticateToken, (req, res) => {
  const { stage_number, completed, stars, moves } = req.body;
  if (!stage_number) return res.status(400).json({ error: 'stage_number is required' });

  const mv = Number(moves);
  const best = Number.isFinite(mv) && mv > 0 ? Math.round(mv) : null;
  const existing = db.prepare('SELECT stars, best_moves FROM nour_progress WHERE user_id = ? AND stage_number = ?').get(req.user.id, stage_number);

  if (existing) {
    /* أقل عدد نقلات هو الأفضل، فبناخد الأصغر — ولو الجديد أسوأ في النجوم
       بنسيب النجوم زي ما هي ونحدّث النقلات لوحدها. */
    const nextBest = best == null ? existing.best_moves
      : (existing.best_moves == null ? best : Math.min(existing.best_moves, best));
    if (stars > existing.stars || (stars === existing.stars && completed)) {
      db.prepare("UPDATE nour_progress SET completed = ?, stars = ?, best_moves = ?, completed_at = datetime('now') WHERE user_id = ? AND stage_number = ?")
        .run(completed ? 1 : 0, stars || 0, nextBest, req.user.id, stage_number);
    } else if (nextBest !== existing.best_moves) {
      db.prepare('UPDATE nour_progress SET best_moves = ? WHERE user_id = ? AND stage_number = ?')
        .run(nextBest, req.user.id, stage_number);
    }
  } else {
    db.prepare("INSERT INTO nour_progress (user_id, stage_number, completed, stars, best_moves, completed_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(req.user.id, stage_number, completed ? 1 : 0, stars || 0, best);
  }
  res.json({ success: true });
});

// مزامنة البيانات المحلية (Hybrid)
/* #18: الدمج لازم يكون غير مُدمِّر — دي أساس إن الربط بقى تلقائيًا وبلا
   نافذة سؤال. مرحلة مكتملة على الخادم مايصحّش صفّ محلي قديم ينزّلها إلى
   «غير مكتملة»، فبناخد الأعلى في completed زي ما بناخد الأعلى في stars. */
router.post('/sync-local', authenticateToken, (req, res) => {
  const { progress, settings, overwrite } = req.body;
  const userId = req.user.id;

  // دمج تقدم نور
  if (progress && Array.isArray(progress)) {
    const insertOrUpdateProgress = db.prepare(`
      INSERT INTO nour_progress (user_id, stage_number, completed, stars, best_moves, completed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, stage_number) DO UPDATE SET
      completed = MAX(nour_progress.completed, excluded.completed),
      stars = MAX(nour_progress.stars, excluded.stars),
      /* أقل عدد نقلات هو الأفضل. MIN() في SQLite بترجّع NULL لو أي طرف
         NULL، والصفوف القديمة كلها NULL — فلازم CASE مش MIN لوحدها. */
      best_moves = CASE
        WHEN nour_progress.best_moves IS NULL THEN excluded.best_moves
        WHEN excluded.best_moves  IS NULL THEN nour_progress.best_moves
        ELSE MIN(nour_progress.best_moves, excluded.best_moves) END,
      completed_at = datetime('now')
    `);

    db.transaction(() => {
      for (const p of progress) {
        const stage = Number(p && p.stage);
        if (!Number.isInteger(stage) || stage <= 0) continue;
        const mv = Number(p.moves);
        const best = Number.isFinite(mv) && mv > 0 ? Math.round(mv) : null;
        insertOrUpdateProgress.run(userId, stage, p.completed ? 1 : 0, Number(p.stars) || 0, best);
      }
    })();
  }

  // دمج الإعدادات
  if (settings && typeof settings === 'object') {
    /* upsert مش UPDATE: الحسابات القديمة ممكن مايكونش عندها صف في
       user_settings فالتحديث كان بيضيع بصمت. */
    const save = (json) => db.prepare(`
      INSERT INTO user_settings (user_id, settings_json, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = datetime('now')`).run(userId, json);

    if (overwrite) {
      save(JSON.stringify(settings));
    } else {
      // قراءة القديم ودمجه مع الجديد
      const row = db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(userId);
      let currentSettings = {};
      if (row) {
        try { currentSettings = JSON.parse(row.settings_json); } catch (e) {}
      }
      const merged = { ...currentSettings, ...settings };
      save(JSON.stringify(merged));
    }
  }

  res.json({ success: true });
});

module.exports = {
  router,
  authenticateToken
};
