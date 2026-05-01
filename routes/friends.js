const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user ID from public ID
async function getUserIdFromPublicId(publicId) {
  const result = await new Promise((resolve, reject) => {
    db.get('SELECT userId FROM publicIds WHERE publicId = ?', [publicId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  return result ? result.userId : null;
}

// Send friend request
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { publicId } = req.body;
    const fromUserId = req.user.userId;

    console.log(`[DEBUG] Friend request: fromUserId=${fromUserId}, toPublicId=${publicId}`);

    if (!publicId) {
      return res.status(400).json({ error: 'Public ID is required' });
    }

    const toUserId = await getUserIdFromPublicId(publicId.toUpperCase());
    console.log(`[DEBUG] Resolved toUserId=${toUserId} from publicId=${publicId}`);

    if (!toUserId) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (toUserId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    // Check if already friends
    const existingFriend = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM friends WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?)',
        [req.user.userId, toUserId, toUserId, req.user.userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existingFriend) {
      return res.status(400).json({ error: 'صديق مسبقاً' });
    }

    // Check if request already exists
    const existingRequest = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, status FROM friendRequests WHERE fromUserId = ? AND toUserId = ?',
        [req.user.userId, toUserId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ error: 'طلب الصداقة مرسل مسبقاً' });
      }
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE friendRequests SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          ['pending', existingRequest.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } else {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO friendRequests (fromUserId, toUserId, status) VALUES (?, ?, ?)',
          [req.user.userId, toUserId, 'pending'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // تحقق من الإدراج فوراً
    const checkAfterInsert = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM friendRequests WHERE toUserId = ?', [toUserId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    console.log(`[DEBUG] Requests in DB for toUserId=${toUserId} after insert:`, JSON.stringify(checkAfterInsert));

    res.json({ message: 'تم إرسال طلب الصداقة' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'فشل إرسال طلب الصداقة' });
  }
});

// Get pending friend requests
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log('=== /requests called ===');
    console.log('userId:', userId);

    // تحقق من كل الطلبات في قاعدة البيانات
    const all = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM friendRequests', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    console.log('ALL requests in DB:', JSON.stringify(all));

    const requests = await new Promise((resolve, reject) => {
      db.all(
        `SELECT fr.id, fr.fromUserId, u.username, u.publicId, fr.createdAt
         FROM friendRequests fr
         JOIN users u ON fr.fromUserId = u.id
         WHERE fr.toUserId = ? AND fr.status = 'pending'
         ORDER BY fr.createdAt DESC`,
        [userId],
        (err, rows) => {
          if (err) {
            console.error('[DEBUG] Database error fetching requests:', err);
            reject(err);
          } else {
            console.log(`[DEBUG] Found ${rows?.length || 0} requests for userId=${userId}:`, JSON.stringify(rows));
            resolve(rows || []);
          }
        }
      );
    });

    res.json({ requests });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'فشل جلب طلبات الصداقة' });
  }
});

// Accept friend request
router.post('/accept/:requestId', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM friendRequests WHERE id = ? AND toUserId = ? AND status = ?',
        [requestId, req.user.userId, 'pending'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!request) {
      return res.status(404).json({ error: 'طلب الصداقة غير موجود' });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO friends (user1Id, user2Id) VALUES (?, ?)',
        [request.fromUserId, request.toUserId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE friendRequests SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        ['accepted', requestId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'تم قبول طلب الصداقة' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'فشل قبول طلب الصداقة' });
  }
});

// Decline friend request
router.post('/decline/:requestId', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM friendRequests WHERE id = ? AND toUserId = ? AND status = ?',
        [requestId, req.user.userId, 'pending'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!request) {
      return res.status(404).json({ error: 'طلب الصداقة غير موجود' });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE friendRequests SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        ['declined', requestId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'تم رفض طلب الصداقة' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'فشل رفض طلب الصداقة' });
  }
});

// Get friends list
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const friends = await new Promise((resolve, reject) => {
      db.all(
        `SELECT u.id, u.username, u.publicId, u.wins, u.losses, u.draws,
                u.isOnline, u.lastSeen, u.profileImage
         FROM friends f
         JOIN users u ON (f.user1Id = ? AND u.id = f.user2Id) OR (f.user2Id = ? AND u.id = f.user1Id)
         WHERE f.user1Id = ? OR f.user2Id = ?
         ORDER BY u.isOnline DESC, u.lastSeen DESC`,
        [req.user.userId, req.user.userId, req.user.userId, req.user.userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    res.json({ friends });
  } catch (error) {
    console.error('Get friends list error:', error);
    res.status(500).json({ error: 'فشل جلب قائمة الأصدقاء' });
  }
});

// Remove friend
router.delete('/remove/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;

    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM friends WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?)',
        [req.user.userId, friendId, friendId, req.user.userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'تم حذف الصديق' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'فشل حذف الصديق' });
  }
});

// Update profile image
router.post('/profile-image', authenticateToken, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'الصورة مطلوبة' });
    }
    if (image.length > 500000) {
      return res.status(400).json({ error: 'حجم الصورة كبير جداً' });
    }
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET profileImage = ? WHERE id = ?',
        [image, req.user.userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    res.json({ message: 'تم تحديث صورة الملف الشخصي' });
  } catch (error) {
    console.error('Update profile image error:', error);
    res.status(500).json({ error: 'فشل تحديث صورة الملف الشخصي' });
  }
});

// Update online status
router.post('/status', authenticateToken, async (req, res) => {
  try {
    const { isOnline } = req.body;
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET isOnline = ?, lastSeen = CURRENT_TIMESTAMP WHERE id = ?',
        [isOnline ? 1 : 0, req.user.userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    res.json({ message: 'تم تحديث الحالة' });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'فشل تحديث الحالة' });
  }
});

module.exports = router;
