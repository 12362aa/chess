const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'chess-firebase.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database (Firebase Edition)');
    initTables();
  }
});

function initTables() {
  // Users table - using Firebase UID as primary key
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      publicId TEXT UNIQUE NOT NULL,
      photoURL TEXT,
      nourProgress INTEGER DEFAULT -1,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      levels TEXT DEFAULT '{}',
      isOnline INTEGER DEFAULT 0,
      lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Friend requests - using Firebase UIDs
  db.run(`
    CREATE TABLE IF NOT EXISTS friendRequests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fromUid TEXT NOT NULL,
      toUid TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fromUid) REFERENCES users(uid),
      FOREIGN KEY (toUid) REFERENCES users(uid),
      UNIQUE(fromUid, toUid)
    )
  `);

  // Friends - using Firebase UIDs
  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1Uid TEXT NOT NULL,
      user2Uid TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user1Uid) REFERENCES users(uid),
      FOREIGN KEY (user2Uid) REFERENCES users(uid),
      UNIQUE(user1Uid, user2Uid)
    )
  `);

  // Challenges - using Firebase UIDs
  db.run(`
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matchId TEXT UNIQUE NOT NULL,
      fromUid TEXT NOT NULL,
      toUid TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      roomCode TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      acceptedAt DATETIME,
      FOREIGN KEY (fromUid) REFERENCES users(uid),
      FOREIGN KEY (toUid) REFERENCES users(uid)
    )
  `);

  // Progress/Levels - using Firebase UID
  db.run(`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL,
      levelId INTEGER NOT NULL,
      stars INTEGER DEFAULT 0,
      moves INTEGER DEFAULT 0,
      completedAt DATETIME,
      FOREIGN KEY (uid) REFERENCES users(uid),
      UNIQUE(uid, levelId)
    )
  `);

  console.log('Firebase database tables initialized');
}

module.exports = db;
