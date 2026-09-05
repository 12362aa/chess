const Database = require('better-sqlite3');
const path = require('path');

/* مسار القاعدة افتراضيًا data.db جنب السيرفر، ويمكن تجاوزه بـ AMKH_DB_PATH
   (للاختبار المعزول على قاعدة مؤقتة من غير ما نلمس بيانات التشغيل). */
const dbPath = process.env.AMKH_DB_PATH || path.join(__dirname, 'data.db');
/* السيرفر بيسجّل كل SQL افتراضيًا زي الأصل؛ AMKH_DB_VERBOSE=0 بيطفّي
   السجل (مفيد للاختبار المعزول عشان مايغرقش الخرج). */
const verbose = process.env.AMKH_DB_VERBOSE === '0' ? undefined : console.log;
const db = new Database(dbPath, verbose ? { verbose } : {});

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initDb() {
  db.exec(`
    -- جدول المستخدمين
    -- password_hash بيسمح بـNULL عن قصد: مستخدم داخل بجوجل مالوش
    -- باسورد عندنا أصلاً. الهوية بتتأكّد من مزوّد خارجي، وإحنا بنصدر
    -- نفس الـJWT في الحالتين عشان باقي النظام مايفرّقش.
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    -- تقدم مراحل نور لكل مستخدم
    CREATE TABLE IF NOT EXISTS nour_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stage_number INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      stars INTEGER DEFAULT 0,
      completed_at TEXT,
      PRIMARY KEY (user_id, stage_number)
    );

    -- إعدادات كل مستخدم
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- سجل مباريات أونلاين (اختياري)
    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opponent_name TEXT,
      result TEXT,
      played_at TEXT DEFAULT (datetime('now'))
    );

    -- طلبات الصداقة
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(sender_id, receiver_id)
    );

    -- الصداقات الفعلية
    CREATE TABLE IF NOT EXISTS friendships (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      since TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, friend_id)
    );

    -- حالة الاتصال والظهور
    CREATE TABLE IF NOT EXISTS presence (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_online INTEGER DEFAULT 0,
      last_seen_at TEXT DEFAULT (datetime('now'))
    );

    -- ══ حظر ══
    -- منفصل عن حذف الصداقة عن قصد: حذف الصداقة بيسيب الطرفين يبعتوا
    -- طلب تاني، والحظر بيمنع الطلب والدعوة والبحث. اتجاه واحد:
    -- blocker حظر blocked.
    CREATE TABLE IF NOT EXISTS friend_blocks (
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (blocker_id, blocked_id)
    );

    -- ══ دعوات المباريات بين الأصدقاء ══
    -- الدعوة سجل مؤقت له عمر (expires_at). بتتخزن في القاعدة مش في
    -- الذاكرة عشان لو السيرفر رستر الدعوة ماتضيعش، ولو المدعو مش متصل
    -- دلوقتي يلاقيها لما يفتح. room_code بيتولّد وقت القبول ويتسلّم
    -- لبروتوكول الغرف الموجود في server.js.
    CREATE TABLE IF NOT EXISTS game_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',   -- pending | accepted | declined | expired | cancelled
      color TEXT DEFAULT 'r',          -- لون الداعي: w | b | r (عشوائي)
      room_code TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      responded_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invites_to     ON game_invites(to_id, status);
    CREATE INDEX IF NOT EXISTS idx_invites_from   ON game_invites(from_id, status);
    CREATE INDEX IF NOT EXISTS idx_requests_recv  ON friend_requests(receiver_id, status);
    CREATE INDEX IF NOT EXISTS idx_friendships_u  ON friendships(user_id);

    -- ══ رسائل الدردشة بين الأصدقاء (1:1) ══
    -- الرسالة متخزّنة مرة واحدة. المحادثة مش جدول مستقل: بتتعرّف من
    -- الزوج (sender_id, recipient_id). read_at = NULL معناها لسه ماتقرتش.
    -- convo_key = "أصغر_id:أكبر_id" عشان كل استعلامات المحادثة تبقى على
    -- عمود واحد مفهرس بدل شرط OR على الاتجاهين. الترتيب من id التصاعدي
    -- (سلطة السيرفر) مش من ساعة الجهاز. الرسايل مربوطة بالحساب فبتفضل
    -- بعد تسجيل الخروج والدخول تاني.
    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      convo_key    TEXT NOT NULL,
      sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body         TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now')),
      read_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_convo  ON messages(convo_key, id);
    CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, read_at);
  `);

  migrate();
}

/* ══════════════════════════════════════════════════════════════════════
   ترقيات على جداول موجودة
   ──────────────────────────────────────────────────────────────────────
   CREATE TABLE IF NOT EXISTS مابيعدّلش جدول موجود، وقاعدة البيانات
   بتبقى شغّالة عند المستخدمين، فأي عمود جديد لازم يتضاف بـALTER TABLE
   محاط بحماية. SQLite مافيهاش ADD COLUMN IF NOT EXISTS فبنقرا أعمدة
   الجدول الأول.
══════════════════════════════════════════════════════════════════════ */
function columns(table) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name); }
  catch (e) { return []; }
}

function addColumn(table, name, definition) {
  if (columns(table).includes(name)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  return true;
}

/* ── إزالة قيد NOT NULL عن users.password_hash ──
   قواعد قديمة اتعملت والعمود NOT NULL. الدخول بجوجل بيـINSERT صف
   password_hash=NULL (المستخدم مالوش باسورد عندنا) فبيفشل بـ
   «NOT NULL constraint failed: users.password_hash» ويرجّع 500.
   SQLite مابتسمحش بإزالة القيد بـALTER COLUMN، فبنعيد بناء الجدول
   مرة واحدة: جدول جديد بالمخطط الصح، ننقل الصفوف، نمسح القديم،
   نعيد التسمية. الأعمدة والفهارس بتترجع بعدها في migrate().
   بنطفّي foreign_keys مؤقتًا (لازم بره أي transaction) عشان DROP
   مايعملش cascade على الجداول اللي بتشير لـusers. */
function dropUsersPasswordHashNotNull() {
  const info = db.prepare(`PRAGMA table_info(users)`).all();
  const ph = info.find(c => c.name === 'password_hash');
  if (!ph || ph.notnull === 0) return false; // مفيش قيد — خلاص

  const NEW_COLS = ['id', 'email', 'password_hash', 'display_name',
                    'created_at', 'last_login_at', 'username',
                    'provider', 'avatar_url', 'google_uid'];
  /* ننقل بس الأعمدة الموجودة فعلًا في الجدول القديم ومعرّفة في الجديد */
  const copy = info.map(c => c.name).filter(n => NEW_COLS.includes(n)).join(', ');

  db.pragma('foreign_keys = OFF');
  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        display_name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_login_at TEXT,
        username TEXT,
        provider TEXT DEFAULT 'local',
        avatar_url TEXT,
        google_uid TEXT
      );
      INSERT INTO users_new (${copy}) SELECT ${copy} FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  });
  rebuild();
  db.pragma('foreign_keys = ON');
  return true;
}

function migrate() {
  const added = [];

  /* ── users ──
     username: الهوية العامة اللي الأصدقاء بيتلاقوا بيها. البحث بيه مش
       بالإيميل عشان مانكشفش إيميلات الناس لأي حد بيبحث.
     provider: local | google — للعرض بس، النظام مايفرّقش في الصلاحيات.
     google_uid: ربط ثابت بحساب جوجل. الإيميل ممكن يتغيّر، الـuid لأ. */
  if (addColumn('users', 'username', 'TEXT')) added.push('users.username');
  if (addColumn('users', 'provider', "TEXT DEFAULT 'local'")) added.push('users.provider');
  if (addColumn('users', 'avatar_url', 'TEXT')) added.push('users.avatar_url');
  if (addColumn('users', 'google_uid', 'TEXT')) added.push('users.google_uid');

  /* ── تقييم Glicko-2 (أونلاين فقط، مربوط بالحساب للأبد) ──
     rating/rd/vol = أرقام Glicko-2. rd>110 = تقييم مبدئي (?).
     rating_games = عدد المباريات المصنّفة. rating_peak = أعلى تقييم.
     wins/losses/draws = سجل المباريات المصنّفة. */
  if (addColumn('users', 'rating', 'REAL DEFAULT 1500')) added.push('users.rating');
  if (addColumn('users', 'rating_rd', 'REAL DEFAULT 350')) added.push('users.rating_rd');
  if (addColumn('users', 'rating_vol', 'REAL DEFAULT 0.06')) added.push('users.rating_vol');
  if (addColumn('users', 'rating_games', 'INTEGER DEFAULT 0')) added.push('users.rating_games');
  if (addColumn('users', 'rating_peak', 'REAL DEFAULT 1500')) added.push('users.rating_peak');
  if (addColumn('users', 'rating_updated_at', 'TEXT')) added.push('users.rating_updated_at');
  if (addColumn('users', 'wins', 'INTEGER DEFAULT 0')) added.push('users.wins');
  if (addColumn('users', 'losses', 'INTEGER DEFAULT 0')) added.push('users.losses');
  if (addColumn('users', 'draws', 'INTEGER DEFAULT 0')) added.push('users.draws');

  /* ── دولة اللاعب (اختيار يدوي من الإعدادات) — كود ISO 3166-1 alpha-2 لعلَم لوحة الصدارة ── */
  if (addColumn('users', 'country', 'TEXT')) added.push('users.country');

  /* ── خصوصية على مستوى الحساب (زي واتساب، تفضل للأبد) ──
     JSON فيه مفاتيح enum: Everyone|Friends|Nobody. القيم الفاضية = الافتراضي. */
  if (addColumn('users', 'privacy_json', 'TEXT')) added.push('users.privacy_json');

  /* دعوة اللعب بين الأصدقاء ممكن تكون مصنّفة (تأثّر على التقييم) */
  if (addColumn('game_invites', 'rated', 'INTEGER DEFAULT 0')) added.push('game_invites.rated');

  /* التحكّم بالوقت للدعوة (#134): tc_base = الأساس بالثواني، tc_inc = الزيادة/نقلة.
     NULL في الاتنين = مباراة بدون توقيت (السلوك الافتراضي القديم). */
  if (addColumn('game_invites', 'tc_base', 'INTEGER')) added.push('game_invites.tc_base');
  if (addColumn('game_invites', 'tc_inc', 'INTEGER')) added.push('game_invites.tc_inc');

  /* لازم بعد إضافة الأعمدة (عشان الجدول الجديد ياخد نسخة كاملة) وقبل
     إنشاء الفهارس تحت (عشان الفهارس بتتمسح مع الجدول القديم وتترجع) */
  if (dropUsersPasswordHashNotNull()) added.push('users.password_hash → nullable');

  /* ── presence ──
     status أوسع من is_online: صاحبك ممكن يكون متصل بس جوه مباراة،
     وده بيغيّر إن كنت تدعيه ولا لأ. is_online بيفضل عشان أي كود قديم. */
  if (addColumn('presence', 'status', "TEXT DEFAULT 'offline'")) added.push('presence.status');
  if (addColumn('presence', 'in_game', "INTEGER DEFAULT 0")) added.push('presence.in_game');

  /* ── messages: رسايل صوتية ──
     kind: 'text' | 'voice'. الصوت بيتخزّن base64 في audio_data زي ما
     بيتبعت على السوكت — الرسايل قصيرة (نوتة صوتية) فمقبول. duration بالثواني. */
  if (addColumn('messages', 'kind', "TEXT DEFAULT 'text'")) added.push('messages.kind');
  if (addColumn('messages', 'audio_data', 'TEXT')) added.push('messages.audio_data');
  if (addColumn('messages', 'duration', 'INTEGER')) added.push('messages.duration');
  if (addColumn('messages', 'mime', 'TEXT')) added.push('messages.mime');

  /* ── علامات الإرسال المتقدمة + الرد + التثبيت (زي واتساب/ماسنجر) ──
     delivered_at: وصلت لجهاز المستلم (✓✓ دائم — قبل كده الوصول كان
       بيتحسب لحظيًا ومايتخزّنش، فبيرجع ✓ واحدة بعد إعادة الفتح؛ ده سبب
       «اختفاء الصح». read_at الموجود أصلاً = اتقرت (تنزل صورة القارئ).
     reply_to: id الرسالة اللي بيتم الرد عليها (اقتباس). NULL = مفيش رد.
     pinned_at: وقت التثبيت (فردي: أي طرف، حفلة: الأدمن). NULL = مش مثبّتة. */
  if (addColumn('messages', 'delivered_at', 'TEXT')) added.push('messages.delivered_at');
  if (addColumn('messages', 'reply_to', 'INTEGER')) added.push('messages.reply_to');
  if (addColumn('messages', 'pinned_at', 'TEXT')) added.push('messages.pinned_at');
  /* pinned_until: لحظة انتهاء التثبيت المؤقّت (٧ أو ٣٠ يومًا…) بتوقيت UTC.
     NULL مع pinned_at غير NULL = تثبيت دائم. الخادم بيكنس المنتهي دوريًا،
     والاستعلامات بتعتبر أي تثبيت مضى وقته «غير مثبّت» حتى لو الكنس ما جاش
     بعد — فالنتيجة صحيحة في كل الأحوال. */
  if (addColumn('messages', 'pinned_until', 'TEXT')) added.push('messages.pinned_until');

  /* ── جروبات الأصدقاء (شات جماعي) ──
     groups: الجروب نفسه. group_members: العضوية. group_messages: الرسايل
     (نص/صوت). group_reads: آخر رسالة قراها كل عضو لحساب غير المقروء. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS group_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT DEFAULT 'text',
      body       TEXT,
      audio_data TEXT,
      duration   INTEGER,
      mime       TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS group_reads (
      group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_id INTEGER DEFAULT 0,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_group_messages_grp ON group_messages(group_id, id);
  `);

  /* ── جروبات: رد + تثبيت + وصول لكل عضو ──
     reply_to/pinned_at زي الفردي بالظبط. last_delivered_id في group_reads
     = أعلى id وصل للعضو (يقابل last_read_id بتاع القراءة) عشان نحسب ✓✓
     للحفلة ومعلومات «مين وصلته». group_messages وgroup_reads اتعملوا
     قبل كده بـCREATE IF NOT EXISTS فالأعمدة الجديدة لازم ALTER محمي. */
  if (addColumn('group_messages', 'reply_to', 'INTEGER')) added.push('group_messages.reply_to');
  if (addColumn('group_messages', 'pinned_at', 'TEXT')) added.push('group_messages.pinned_at');
  if (addColumn('group_messages', 'pinned_until', 'TEXT')) added.push('group_messages.pinned_until');
  if (addColumn('group_reads', 'last_delivered_id', 'INTEGER DEFAULT 0')) added.push('group_reads.last_delivered_id');

  /* ── مين استمع لنوتة صوتية (فردي + جروب) ──
     القراءة تراكمية (high-water)، لكن الاستماع لرسالة صوتية بعينها حدث
     مستقل مش تراكمي، فمحتاج جدول صريح. scope: 'dm' | 'grp' عشان id
     الرسالة مايتلغبطش بين جدول messages وgroup_messages. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_plays (
      scope      TEXT NOT NULL,            -- 'dm' | 'grp'
      message_id INTEGER NOT NULL,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      played_at  TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (scope, message_id, user_id)
    );
  `);

  /* ── سجل المباريات المصنّفة (audit + إعادة حساب) ──
     نخزّن تقييمات ما قبل/بعد المباراة للطرفين + النقلات، عشان نقدر
     نعيد حساب التاريخ كله لو صلّحنا باج أو غيّرنا الإعدادات. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS rated_games (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      white_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      black_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      winner      TEXT,                       -- 'white' | 'black' | 'draw'
      reason      TEXT,
      w_r_before  REAL, w_rd_before REAL, w_vol_before REAL,
      b_r_before  REAL, b_rd_before REAL, b_vol_before REAL,
      w_r_after   REAL, w_rd_after  REAL, w_vol_after  REAL,
      b_r_after   REAL, b_rd_after  REAL, b_vol_after  REAL,
      moves       TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rated_games_w ON rated_games(white_id, id);
    CREATE INDEX IF NOT EXISTS idx_rated_games_b ON rated_games(black_id, id);

    -- دعوات الحفلات المعلّقة (بديل الإضافة المباشرة لما الخصوصية تمنعها)
    CREATE TABLE IF NOT EXISTS party_invites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      party_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      inviter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status      TEXT DEFAULT 'pending',      -- pending | accepted | declined | expired
      created_at  TEXT DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_party_invites_invitee ON party_invites(invitee_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_party_invites_uniq ON party_invites(party_id, invitee_id) WHERE status = 'pending';
  `);

  /* ══════════════════════════════════════════════════════════════════
     سجل كل المباريات + التفاعلات + تثبيت المحادثات (تحديث 26)
  ══════════════════════════════════════════════════════════════════ */
  db.exec(`
    /* ── أرشيف كامل لكل مباراة أونلاين خلصت (ودّية ومصنّفة) ──
       rated_games بيسجّل المصنّفة بس، فأرقام الفوز/الخسارة كانت ناقصة
       في لوحة التصنيف وصفحة الملف الشخصي. الجدول ده بيسجّل الكل. */
    CREATE TABLE IF NOT EXISTS game_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      white_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      black_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      winner     TEXT,                        -- 'white' | 'black' | 'draw'
      reason     TEXT,
      rated      INTEGER DEFAULT 0,
      tc         TEXT,                        -- JSON { base, inc } أو NULL
      moves      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_game_log_w ON game_log(white_id, id);
    CREATE INDEX IF NOT EXISTS idx_game_log_b ON game_log(black_id, id);

    /* ── تفاعلات الإيموجي على الرسائل ──
       scope عشان id الرسالة مايتلغبطش بين messages وgroup_messages.
       المفتاح الأساسي بيسمح بتفاعل واحد لكل (رسالة، مستخدم): التفاعل
       الجديد بيستبدل القديم — زي واتساب. */
    CREATE TABLE IF NOT EXISTS message_reactions (
      scope      TEXT NOT NULL,               -- 'dm' | 'grp'
      message_id INTEGER NOT NULL,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (scope, message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reactions_msg ON message_reactions(scope, message_id);

    /* ── تثبيت محادثة في صندوق الرسائل (لكل مستخدم على حدة) ── */
    CREATE TABLE IF NOT EXISTS chat_pins (
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind      TEXT NOT NULL,                -- 'dm' | 'grp'
      target_id INTEGER NOT NULL,             -- id الصديق أو الجروب
      pinned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, kind, target_id)
    );

    /* ── #6: أكواد استعادة كلمة المرور ──
       بنخزّن بصمة الكود لا الكود نفسه: أي تسريب لقاعدة البيانات مايدّيش
       حد القدرة على استعمال كود لسه صالح. الصفّ واحد لكل بريد (المفتاح
       الأساسي هو البريد) فطلب كود جديد بيبطّل القديم تلقائيًا — ولو
       المستخدم دوس «إرسال» عشر مرات يفضل كود واحد صالح بس.
       attempts بيقفل الباب على تخمين الأرقام الستة بالقوة الغاشمة، و
       hour_start/hour_count بيحدّدوا عدد الطلبات في الساعة لكل بريد —
       التقييد بالبريد لا بالـIP لأن الخادم خلف نفق فكل الطلبات بتبان
       جاية من عنوان واحد. */
    CREATE TABLE IF NOT EXISTS password_resets (
      email       TEXT PRIMARY KEY,
      code_hash   TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,           -- ms منذ الحقبة
      attempts    INTEGER NOT NULL DEFAULT 0,
      sent_at     INTEGER NOT NULL,
      hour_start  INTEGER NOT NULL DEFAULT 0,
      hour_count  INTEGER NOT NULL DEFAULT 0,
      ip          TEXT
    );

    /* ── #13: تأكيد البريد وقت إنشاء الحساب اليدوي ──
       الحساب مابيتكتبش في users غير بعد ما صاحب البريد يثبت إنه فعلًا
       بريده. لحد ساعتها الطلب كله عايش هنا: بصمة الرمز، وبصمة كلمة
       المرور (bcrypt — لا كلمة مرور خام في القاعدة ولو مؤقتًا)، والاسم
       المعروض. المفتاح هو البريد فطلب جديد بنفس البريد بيبطّل القديم،
       والصفّ بيتمسح لحظة إنشاء الحساب أو عند انتهاء الصلاحية.
       نفس حدود الاستعادة سارية: كولداون بين الطلبات، سقف في الساعة،
       وسقف محاولات خاطئة يحرق الرمز. */
    CREATE TABLE IF NOT EXISTS pending_signups (
      email         TEXT PRIMARY KEY,
      code_hash     TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name  TEXT,
      expires_at    INTEGER NOT NULL,         -- ms منذ الحقبة
      attempts      INTEGER NOT NULL DEFAULT 0,
      sent_at       INTEGER NOT NULL,
      hour_start    INTEGER NOT NULL DEFAULT 0,
      hour_count    INTEGER NOT NULL DEFAULT 0
    );
  `);

  /* لو الجدول اتعمل قبل إضافة عدّاد الساعة */
  if (addColumn('password_resets', 'hour_start', 'INTEGER NOT NULL DEFAULT 0')) added.push('password_resets.hour_start');
  if (addColumn('password_resets', 'hour_count', 'INTEGER NOT NULL DEFAULT 0')) added.push('password_resets.hour_count');

  /* منشِنات: مصفوفة JSON بهويات المذكورين — عشان إشعار «ذكرك» */
  if (addColumn('messages', 'mentions', 'TEXT')) added.push('messages.mentions');
  if (addColumn('group_messages', 'mentions', 'TEXT')) added.push('group_messages.mentions');


  /* فهارس على الأعمدة الجديدة — بعد ALTER عشان تكون موجودة */
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username   ON users(username) WHERE username IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_uid ON users(google_uid) WHERE google_uid IS NOT NULL;
  `);

  /* أي حساب قديم مالوش username ياخد واحد مشتق من إيميله، عشان يبان
     في البحث. التفرّد مضمون بالـid في الآخر. */
  const needName = db.prepare(`SELECT id, email FROM users WHERE username IS NULL OR username = ''`).all();
  if (needName.length) {
    const set = db.prepare('UPDATE users SET username = ? WHERE id = ?');
    const taken = new Set(
      db.prepare(`SELECT username FROM users WHERE username IS NOT NULL`).all().map(r => String(r.username).toLowerCase())
    );
    for (const u of needName) {
      let base = String(u.email || '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'player';
      let candidate = base, n = 1;
      while (taken.has(candidate.toLowerCase())) candidate = base + (++n);
      taken.add(candidate.toLowerCase());
      set.run(candidate, u.id);
    }
    added.push(`backfilled ${needName.length} username(s)`);
  }

  if (added.length) console.log('[db] migrated:', added.join(', '));
}

initDb();

module.exports = db;
