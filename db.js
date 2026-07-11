const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initDb() {
  db.exec(`
    -- جدول المستخدمين
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
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
  `);
}

initDb();

module.exports = db;
