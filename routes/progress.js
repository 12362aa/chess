const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Update level progress
router.post('/level', authenticateToken, async (req, res) => {
  try {
    const { levelId, stars, moves } = req.body;

    if (levelId === undefined || stars === undefined || moves === undefined) {
      return res.status(400).json({ error: 'levelId, stars, and moves are required' });
    }

    // Get current user data
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT levels, nourProgress FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentLevels = user.levels ? JSON.parse(user.levels) : {};
    const prevLevel = currentLevels[levelId] || { stars: 0, moves: 999, done: false };

    // Merge with best progress
    const updatedLevel = {
      stars: Math.max(prevLevel.stars || 0, stars),
      moves: Math.min(prevLevel.moves || 999, moves),
      done: true
    };

    currentLevels[levelId] = updatedLevel;

    // Unlock next level
    if (levelId + 1 < 100) {
      currentLevels['u' + (levelId + 1)] = true;
    }

    // Calculate max progress
    let maxProgress = -1;
    for (let i = 0; i < 100; i++) {
      if (currentLevels[i] && currentLevels[i].done) {
        maxProgress = i;
      }
    }

    // Update database
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET levels = ?, nourProgress = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(currentLevels), maxProgress, req.user.userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      message: 'Progress updated successfully',
      nourProgress: maxProgress,
      level: updatedLevel
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// Get full progress
router.get('/levels', authenticateToken, async (req, res) => {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT levels, nourProgress FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      levels: user.levels ? JSON.parse(user.levels) : {},
      nourProgress: user.nourProgress
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// Sync progress (bidirectional merge)
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const { localLevels } = req.body;

    if (!localLevels || typeof localLevels !== 'object') {
      return res.status(400).json({ error: 'localLevels object is required' });
    }

    // Get remote levels
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT levels FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const remoteLevels = user.levels ? JSON.parse(user.levels) : {};

    // Merge levels
    const merged = { ...remoteLevels };
    const allKeys = new Set([...Object.keys(localLevels), ...Object.keys(remoteLevels)]);

    allKeys.forEach(key => {
      const local = localLevels[key];
      const remote = remoteLevels[key];

      if (!remote) {
        merged[key] = local;
      } else if (!local) {
        merged[key] = remote;
      } else if (typeof local === 'object' && typeof remote === 'object') {
        merged[key] = {
          ...remote,
          ...local,
          stars: Math.max(local.stars || 0, remote.stars || 0),
          moves: Math.min(local.moves || 999, remote.moves || 999),
          done: !!(local.done || remote.done)
        };
      } else {
        merged[key] = remote;
      }
    });

    // Calculate max progress
    let maxProgress = -1;
    for (let i = 0; i < 100; i++) {
      if (merged[i] && merged[i].done) {
        maxProgress = i;
      }
    }

    // Update database
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET levels = ?, nourProgress = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(merged), maxProgress, req.user.userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      message: 'Progress synced successfully',
      levels: merged,
      nourProgress: maxProgress
    });
  } catch (error) {
    console.error('Sync progress error:', error);
    res.status(500).json({ error: 'Failed to sync progress' });
  }
});

// Update stats (wins/losses/draws)
router.post('/stats', authenticateToken, async (req, res) => {
  try {
    const { type } = req.body; // 'win', 'loss', 'draw'

    if (!type || !['win', 'loss', 'draw'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be win, loss, or draw' });
    }

    const column = type === 'win' ? 'wins' : type === 'loss' ? 'losses' : 'draws';

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET ${column} = ${column} + 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'Stats updated successfully' });
  } catch (error) {
    console.error('Update stats error:', error);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

module.exports = router;
