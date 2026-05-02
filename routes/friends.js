const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user ID from public ID
async function getUserIdFromPublicId(publicId) {
  console.log(`[DEBUG] getUserIdFromPublicId: searching for publicId=${publicId}`);
  
  // First try to find in users table (primary location)
  let result = await new Promise((resolve, reject) => {
    db.get('SELECT id as userId FROM users WHERE publicId = ?', [publicId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  // If not found, try publicIds table (fallback for older users)
  if (!result) {
    console.log(`[DEBUG] Not found in users table, checking publicIds table...`);
    result = await new Promise((resolve, reject) => {
      db.get('SELECT userId FROM publicIds WHERE publicId = ?', [publicId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  console.log(`[DEBUG] getUserIdFromPublicId result:`, result ? `userId=${result.userId}` : 'null');
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
      // Update if declined
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
      // Create new request
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO friendRequests (fromUserId, toUserId, status) VALUES (?, ?, ?)',
          [req.user.userId, toUserId, 'pending'],
          function(err) {
            if (err) {
              console.error('[DEBUG] Error inserting friend request:', err);
              reject(err);
            } else {
              console.log(`[DEBUG] Friend request inserted successfully. ID: ${this.lastID}, fromUserId: ${req.user.userId}, toUserId: ${toUserId}`);
              resolve();
            }
          }
        );
      });
    }

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
    console.log(`[DEBUG] Fetching friend requests for userId: ${userId} (type: ${typeof userId})`);
    
    // First check if there are ANY requests for this user
    const allRequests = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, fromUserId, toUserId, status FROM friendRequests WHERE toUserId = ?`,
        [userId],
        (err, rows) => {
          if (err) {
            console.error('[DEBUG] Raw query error:', err);
            reject(err);
          } else {
            console.log(`[DEBUG] Raw check: Found ${rows?.length || 0} total requests for toUserId=${userId}`);
            if (rows && rows.length > 0) {
              console.log(`[DEBUG] Raw rows:`, JSON.stringify(rows));
            }
            resolve(rows || []);
          }
        }
      );
    });
    
    const requests = await new Promise((resolve, reject) => {
      db.all(
        `SELECT fr.id, fr.fromUserId, u.username, 
         COALESCE(u.publicId, pi.publicId) as publicId, fr.createdAt
         FROM friendRequests fr
         JOIN users u ON fr.fromUserId = u.id
         LEFT JOIN publicIds pi ON u.id = pi.userId
         WHERE fr.toUserId = ? AND fr.status = 'pending'
         ORDER BY fr.createdAt DESC`,
        [userId],
        (err, rows) => {
          if (err) {
            console.error('[DEBUG] Database error fetching requests:', err);
            reject(err);
          } else {
            console.log(`[DEBUG] Found ${rows?.length || 0} friend requests for userId ${userId}`);
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

    // Get request
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

    // Add to friends table
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

    // Update request status
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

    // Get request
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

    // Update request status
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

// Get friends list with online status and profile
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
    // Limit image size (base64 can be large)
    if (image.length > 500000) {
      return res.status(400).json({ error: 'حجم الصورة كبير جداً. الحد الأقصى 500 كيلوبايت.' });
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
    res.json({ message: 'تم تحديث الحالة', isOnline: !!isOnline });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'فشل تحديث الحالة' });
  }
});

module.exports = router;
