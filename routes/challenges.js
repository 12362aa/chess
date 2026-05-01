const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Generate match ID
function generateMatchId() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

// Send challenge
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { toUserId } = req.body;

    if (!toUserId) {
      return res.status(400).json({ error: 'toUserId is required' });
    }

    if (toUserId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot challenge yourself' });
    }

    // Check if friends
    const isFriend = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM friends WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?)',
        [req.user.userId, toUserId, toUserId, req.user.userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    if (!isFriend) {
      return res.status(400).json({ error: 'Can only challenge friends' });
    }

    const matchId = generateMatchId();

    // Create challenge
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO challenges (matchId, fromUserId, toUserId, status) VALUES (?, ?, ?, ?)',
        [matchId, req.user.userId, toUserId, 'pending'],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'Challenge sent', matchId });
  } catch (error) {
    console.error('Send challenge error:', error);
    res.status(500).json({ error: 'Failed to send challenge' });
  }
});

// Get pending challenges
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const challenges = await new Promise((resolve, reject) => {
      db.all(
        `SELECT c.id, c.matchId, c.fromUserId, u.username, u.publicId, c.createdAt
         FROM challenges c
         JOIN users u ON c.fromUserId = u.id
         WHERE c.toUserId = ? AND c.status = 'pending'
         ORDER BY c.createdAt DESC`,
        [req.user.userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    res.json({ challenges });
  } catch (error) {
    console.error('Get pending challenges error:', error);
    res.status(500).json({ error: 'Failed to get pending challenges' });
  }
});

// Accept challenge - no room needed, direct match
router.post('/accept/:matchId', authenticateToken, async (req, res) => {
  try {
    const { matchId } = req.params;

    // Get challenge
    const challenge = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM challenges WHERE matchId = ? AND toUserId = ? AND status = ?',
        [matchId, req.user.userId, 'pending'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Use matchId as room code - no separate room creation needed
    // Update challenge
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE challenges SET status = ?, roomCode = ?, acceptedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        ['accepted', matchId, challenge.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Get opponent info for the response
    const opponent = await new Promise((resolve, reject) => {
      db.get(
        'SELECT username, publicId FROM users WHERE id = ?',
        [challenge.fromUserId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    res.json({ message: 'Challenge accepted', roomCode: matchId, matchId, opponent });
  } catch (error) {
    console.error('Accept challenge error:', error);
    res.status(500).json({ error: 'Failed to accept challenge' });
  }
});

// Decline challenge
router.post('/decline/:matchId', authenticateToken, async (req, res) => {
  try {
    const { matchId } = req.params;

    // Get challenge
    const challenge = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM challenges WHERE matchId = ? AND toUserId = ? AND status = ?',
        [matchId, req.user.userId, 'pending'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Update challenge
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE challenges SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        ['declined', challenge.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'Challenge declined' });
  } catch (error) {
    console.error('Decline challenge error:', error);
    res.status(500).json({ error: 'Failed to decline challenge' });
  }
});

// Get challenge status (for challenger to know when accepted)
router.get('/status/:matchId', authenticateToken, async (req, res) => {
  try {
    const { matchId } = req.params;

    const challenge = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM challenges WHERE matchId = ? AND fromUserId = ?',
        [matchId, req.user.userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    res.json({
      status: challenge.status,
      roomCode: challenge.roomCode
    });
  } catch (error) {
    console.error('Get challenge status error:', error);
    res.status(500).json({ error: 'Failed to get challenge status' });
  }
});

module.exports = router;
