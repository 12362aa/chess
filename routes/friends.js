const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get UID from public ID (Firebase Edition)
async function getUidFromPublicId(publicId) {
  console.log(`[DEBUG] getUidFromPublicId: searching for publicId=${publicId}`);
  
  const result = await new Promise((resolve, reject) => {
    db.get('SELECT uid FROM users WHERE publicId = ?', [publicId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  console.log(`[DEBUG] getUidFromPublicId result:`, result ? `uid=${result.uid}` : 'null');
  return result ? result.uid : null;
}

// Send friend request (Firebase Edition)
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { publicId } = req.body;
    const fromUid = req.user.userId;

    console.log(`[DEBUG] Friend request: fromUid=${fromUid}, toPublicId=${publicId}`);

    if (!publicId) {
      return res.status(400).json({ error: 'Public ID is required' });
    }

    const toUid = await getUidFromPublicId(publicId.toUpperCase());
    console.log(`[DEBUG] Resolved toUid=${toUid} from publicId=${publicId}`);

    if (!toUid) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (toUid === fromUid) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    // Check if already friends
    const existingFriend = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM friends WHERE (user1Uid = ? AND user2Uid = ?) OR (user1Uid = ? AND user2Uid = ?)',
        [fromUid, toUid, toUid, fromUid],
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
        'SELECT id, status FROM friendRequests WHERE fromUid = ? AND toUid = ?',
        [fromUid, toUid],
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
          'INSERT INTO friendRequests (fromUid, toUid, status) VALUES (?, ?, ?)',
          [fromUid, toUid, 'pending'],
          function(err) {
            if (err) {
              console.error('[DEBUG] Error inserting friend request:', err);
              reject(err);
            } else {
              console.log(`[DEBUG] Friend request inserted successfully. ID: ${this.lastID}, fromUid: ${fromUid}, toUid: ${toUid}`);
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

// Get pending friend requests (Firebase Edition)
router.get('/requests', authenticateToken, async (req, res) => {
  console.log(`[DEBUG REQUESTS] Endpoint hit! req.user:`, req.user);
  try {
    const uid = req.user.userId;
    console.log(`[DEBUG REQUESTS] START - uid: ${uid}`);
    
    const requests = await new Promise((resolve, reject) => {
      db.all(
        `SELECT fr.id, fr.fromUid, u.username, u.publicId, u.photoURL, fr.createdAt
         FROM friendRequests fr
         JOIN users u ON fr.fromUid = u.uid
         WHERE fr.toUid = ? AND fr.status = 'pending'
         ORDER BY fr.createdAt DESC`,
        [uid],
        (err, rows) => {
          if (err) {
            console.error('[DEBUG] Database error fetching requests:', err);
            reject(err);
          } else {
            console.log(`[DEBUG] Found ${rows?.length || 0} friend requests for uid ${uid}`);
            resolve(rows || []);
          }
        }
      );
    });

    console.log(`[DEBUG REQUESTS] SUCCESS - Returning ${requests.length} requests`);
    res.json({ requests });
  } catch (error) {
    console.error('[DEBUG REQUESTS] ERROR:', error);
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
        'INSERT INTO friends (user1Uid, user2Uid) VALUES (?, ?)',
        [request.fromUid, request.toUid],
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

// Decline friend request (Firebase Edition)
router.post('/decline/:requestId', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const uid = req.user.userId;

    // Get request
    const request = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM friendRequests WHERE id = ? AND toUid = ? AND status = ?',
        [requestId, uid, 'pending'],
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

// Get friends list with online status and profile (Firebase Edition)
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.userId;
    const friends = await new Promise((resolve, reject) => {
      db.all(
        `SELECT u.uid, u.username, u.publicId, u.wins, u.losses, u.draws,
                u.isOnline, u.lastSeen, u.photoURL
         FROM friends f
         JOIN users u ON (f.user1Uid = ? AND u.uid = f.user2Uid) OR (f.user2Uid = ? AND u.uid = f.user1Uid)
         WHERE f.user1Uid = ? OR f.user2Uid = ?
         ORDER BY u.isOnline DESC, u.lastSeen DESC`,
        [uid, uid, uid, uid],
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

// Remove friend (Firebase Edition)
router.delete('/remove/:friendUid', authenticateToken, async (req, res) => {
  try {
    const { friendUid } = req.params;
    const uid = req.user.userId;

    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM friends WHERE (user1Uid = ? AND user2Uid = ?) OR (user1Uid = ? AND user2Uid = ?)',
        [uid, friendUid, friendUid, uid],
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

// Update profile image (Firebase Edition)
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
        'UPDATE users SET photoURL = ? WHERE uid = ?',
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

// Update online status (Firebase Edition)
router.post('/status', authenticateToken, async (req, res) => {
  try {
    const { isOnline } = req.body;
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET isOnline = ?, lastSeen = CURRENT_TIMESTAMP WHERE uid = ?',
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
