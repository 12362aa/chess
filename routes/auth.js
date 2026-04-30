const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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
  throw new Error('Failed to generate unique public ID');
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if username exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email exists
    const existingEmail = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
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
          to: email,
          subject: 'Verify Your Email - Chess Game',
          html: `
            <h2>Welcome to Chess Game!</h2>
            <p>Hello ${username},</p>
            <p>Please verify your email address by clicking the link below:</p>
            <a href="${verificationUrl}" style="background: #c9a84c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create this account, please ignore this email.</p>
          `
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }
    } else {
      console.log('Email not configured - verification token saved but not sent:', verificationToken);
    }

    // Generate token
    const token = jwt.sign(
      { userId, username, publicId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully. Please check your email to verify your account.',
      token,
      user: { userId, username, publicId, emailVerified: false }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

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
      message: 'Login successful',
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
    res.status(500).json({ error: 'Login failed' });
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
      return res.status(404).json({ error: 'User not found' });
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
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Update username
router.put('/username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    // Check if username exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET username = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [username, req.user.userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: 'Username updated successfully' });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Failed to update username' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, username FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If the email exists, a reset link will be sent' });
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

        const resetUrl = `${process.env.FRONTEND_URL || 'https://12362aa.github.io/chess'}/reset-password?token=${resetToken}`;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Password Reset - Chess Game',
          html: `
            <h2>Password Reset Request</h2>
            <p>Hello ${user.username},</p>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <a href="${resetUrl}" style="background: #c9a84c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Continue anyway - token is still saved
      }
    } else {
      console.log('Email not configured - reset token saved but not sent:', resetToken);
    }

    res.json({ message: 'If the email exists, a reset link will be sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
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
      return res.status(400).json({ error: 'Invalid or expired token' });
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

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
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
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
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
          subject: 'Verify Your Email - Chess Game',
          html: `
            <h2>Email Verification</h2>
            <p>Hello ${user.username},</p>
            <p>Please verify your email address by clicking the link below:</p>
            <a href="${verificationUrl}" style="background: #c9a84c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
            <p>This link will expire in 24 hours.</p>
          `
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }
    }

    res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
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
      return res.status(400).json({ error: 'Invalid or expired token' });
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

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
