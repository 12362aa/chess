const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Firebase Sync - Create or update user from Firebase Auth
router.post('/firebase-sync', authenticateToken, async (req, res) => {
  try {
    const { uid, email, username, photoURL } = req.body;
    
    if (!uid || !email) {
      return res.status(400).json({ error: 'UID and email are required' });
    }

    // Check if user exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE uid = ?', [uid], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingUser) {
      // Update existing user
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET username = ?, photoURL = ?, updatedAt = CURRENT_TIMESTAMP WHERE uid = ?',
          [username || existingUser.username, photoURL || existingUser.photoURL, uid],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      const updatedUser = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE uid = ?', [uid], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      return res.json({ 
        message: 'User updated successfully',
        user: updatedUser
      });
    }

    // Create new user
    const publicId = uid.substring(0, 8).toUpperCase();
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (uid, username, email, publicId, photoURL) VALUES (?, ?, ?, ?, ?)',
        [uid, username || email.split('@')[0], email, publicId, photoURL],
        function(err) {
          if (err) {
            console.error('Error creating user:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    const newUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE uid = ?', [uid], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    res.status(201).json({ 
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    console.error('Firebase sync error:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE uid = ?', [req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Generate public ID
function generatePublicId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Ensure unique public ID
async function getUniquePublicId() {
  for (let i = 0; i < 10; i++) {
    const pid = generatePublicId();
    const exists = await new Promise((resolve, reject) => {
      db.get('SELECT publicId FROM publicIds WHERE publicId = ?', [pid], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
    if (!exists) return pid;
  }
  throw new Error('فشل إنشاء معرف فريد');
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'يجب أن يكون اسم المستخدم بين 3-20 حرفاً' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' });
    }

    // Check if username exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingUser) {
      return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    }

    // Check if email exists
    const existingEmail = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingEmail) {
      return res.status(400).json({ error: 'البريد الإلكتروني موجود مسبقاً' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate public ID
    const publicId = await getUniquePublicId();

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 86400000).toISOString(); // 24 hours

    // Insert user with email verification
    const userId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, email, password, publicId, emailVerified, verificationToken, verificationExpires) VALUES (?, ?, ?, ?, 0, ?, ?)',
        [username, email, hashedPassword, publicId, verificationToken, verificationExpires],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Insert public ID mapping
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO publicIds (publicId, userId) VALUES (?, ?)', [publicId, userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Generate token immediately - no email verification required
    const token = jwt.sign(
      { userId, username, publicId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح!',
      token,
      user: { userId, username, publicId, nourProgress: -1, stats: { wins: 0, losses: 0, draws: 0 } }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'فشل إنشاء الحساب' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    // Email verification removed - login allowed immediately

    // Update last seen
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET lastSeen = CURRENT_TIMESTAMP WHERE id = ?', [user.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, publicId: user.publicId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        userId: user.id,
        username: user.username,
        publicId: user.publicId,
        nourProgress: user.nourProgress,
        stats: { wins: user.wins, losses: user.losses, draws: user.draws }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'فشل تسجيل الدخول' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, username, email, publicId, nourProgress, wins, losses, draws, levels, createdAt FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.json({
      user: {
        userId: user.id,
        username: user.username,
        email: user.email,
        publicId: user.publicId,
        nourProgress: user.nourProgress,
        stats: { wins: user.wins, losses: user.losses, draws: user.draws },
        levels: user.levels ? JSON.parse(user.levels) : {},
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'فشل جلب بيانات المستخدم' });
  }
});

// Update username
router.put('/username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'يجب أن يكون اسم المستخدم بين 3-20 حرفاً' });
    }

    // Check if username exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingUser) {
      return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    }

    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET username = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [username, req.user.userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: 'تم تحديث اسم المستخدم بنجاح' });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'فشل تحديث اسم المستخدم' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
    }

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, username FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      // Don't reveal if email exists - use generic message in Arabic
      return res.json({ message: 'تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني إذا كان مسجلاً في نظامنا' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO passwordResetTokens (userId, token, expiresAt) VALUES (?, ?, ?)',
        [user.id, resetToken, expiresAt],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Send email (configure in .env)
    console.log('Email config check:', {hasUser:!!process.env.EMAIL_USER, hasPass:!!process.env.EMAIL_PASS});
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        console.log('Attempting to send email to:', email);
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: process.env.EMAIL_PORT || 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        const resetUrl = `${process.env.FRONTEND_URL || 'https://12362aa.github.io/chess'}/reset-password?token=${resetToken}`;

        const result = await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'إعادة تعيين كلمة المرور - لعبة الشطرنج',
          html: `
            <h2 style="text-align: right; direction: rtl;">طلب إعادة تعيين كلمة المرور</h2>
            <p style="text-align: right; direction: rtl;">مرحباً ${user.username}،</p>
            <p style="text-align: right; direction: rtl;">لقد طلبت إعادة تعيين كلمة المرور. اضغط على الرابط أدناه لإعادة تعيينها:</p>
            <a href="${resetUrl}" style="background: #c9a84c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">إعادة تعيين كلمة المرور</a>
            <p style="text-align: right; direction: rtl;">هذا الرابط سينتهي صلاحيته خلال ساعة واحدة.</p>
            <p style="text-align: right; direction: rtl;">إذا لم تطلب هذا، يرجى تجاهل هذا الإيميل.</p>
          `
        });
        console.log('Email sent successfully:', result.messageId);
      } catch (emailError) {
        console.error('Email sending failed:', emailError.message, emailError.code);
        // Continue anyway - token is still saved
      }
    } else {
      console.error('Email credentials missing - EMAIL_USER or EMAIL_PASS not set in .env');
      console.log('Reset token saved but email not sent:', resetToken);
    }

    res.json({ message: 'تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني إذا كان مسجلاً في نظامنا' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'حدث خطأ في معالجة الطلب' });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'الرمز مطلوب' });
    }

    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM users WHERE verificationToken = ? AND verificationExpires > datetime("now") AND emailVerified = 0',
        [token],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) {
      return res.status(400).json({ error: 'رمز غير صالح أو منتهي الصلاحية' });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET emailVerified = 1, verificationToken = NULL, verificationExpires = NULL WHERE id = ?',
        [user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'تم التحقق من البريد الإلكتروني بنجاح' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'فشل التحقق من البريد الإلكتروني' });
  }
});

// Resend verification email
router.post('/resend-verification', authenticateToken, async (req, res) => {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, username, email, emailVerified FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'تم التحقق من البريد الإلكتروني مسبقاً' });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 86400000).toISOString();

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET verificationToken = ?, verificationExpires = ? WHERE id = ?',
        [verificationToken, verificationExpires, user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Send verification email
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: process.env.EMAIL_PORT || 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        const verificationUrl = `${process.env.FRONTEND_URL || 'https://12362aa.github.io/chess'}/verify-email?token=${verificationToken}`;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'تحقق من إيميلك - لعبة الشطرنج',
          html: `
            <h2 style="text-align: right; direction: rtl;">التحقق من الإيميل</h2>
            <p style="text-align: right; direction: rtl;">مرحباً ${user.username}،</p>
            <p style="text-align: right; direction: rtl;">يرجى التحقق من عنوان إيميلك بالضغط على الرابط أدناه:</p>
            <a href="${verificationUrl}" style="background: #c9a84c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">تحقق من الإيميل</a>
            <p style="text-align: right; direction: rtl;">هذا الرابط سينتهي صلاحيته خلال 24 ساعة.</p>
          `
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError.message);
        // Continue anyway - token is still saved
      }
    }

    res.json({ message: 'تم إرسال بريد التحقق' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'فشل إعادة إرسال بريد التحقق' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'الرمز وكلمة المرور مطلوبان' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' });
    }

    const resetData = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM passwordResetTokens WHERE token = ? AND used = 0 AND expiresAt > datetime("now")',
        [token],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!resetData) {
      return res.status(400).json({ error: 'رمز غير صالح أو منتهي الصلاحية' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [hashedPassword, resetData.userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('UPDATE passwordResetTokens SET used = 1 WHERE id = ?', [resetData.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: 'تم إعادة تعيين كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'فشل إعادة تعيين كلمة المرور' });
  }
});

module.exports = router;
