const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'chess.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initTables();
  }
});

function initTables() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      publicId TEXT UNIQUE NOT NULL,
      nourProgress INTEGER DEFAULT -1,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      levels TEXT DEFAULT '{}',
      emailVerified INTEGER DEFAULT 0,
      verificationToken TEXT,
      verificationExpires DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add email verification columns if they don't exist (for existing databases)
  db.run(`ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN verificationToken TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN verificationExpires DATETIME`, () => {});

  // Add profile and online status columns
  db.run(`ALTER TABLE users ADD COLUMN profileImage TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN isOnline INTEGER DEFAULT 0`, () => {});

  // Public IDs mapping
  db.run(`
    CREATE TABLE IF NOT EXISTS publicIds (
      publicId TEXT PRIMARY KEY,
      userId INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Friend requests
  db.run(`
    CREATE TABLE IF NOT EXISTS friendRequests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fromUserId INTEGER NOT NULL,
      toUserId INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fromUserId) REFERENCES users(id),
      FOREIGN KEY (toUserId) REFERENCES users(id)
    )
  `);

  // Friends
  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1Id INTEGER NOT NULL,
      user2Id INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user1Id) REFERENCES users(id),
      FOREIGN KEY (user2Id) REFERENCES users(id),
      UNIQUE(user1Id, user2Id)
    )
  `);

  // Challenges
  db.run(`
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matchId TEXT UNIQUE NOT NULL,
      fromUserId INTEGER NOT NULL,
      toUserId INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      roomCode TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      acceptedAt DATETIME,
      FOREIGN KEY (fromUserId) REFERENCES users(id),
      FOREIGN KEY (toUserId) REFERENCES users(id)
    )
  `);

  // Password reset tokens
  db.run(`
    CREATE TABLE IF NOT EXISTS passwordResetTokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expiresAt DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  console.log('Database tables initialized');
}

module.exports = db;
