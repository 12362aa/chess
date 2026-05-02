const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'رمز الوصول مطلوب' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      userId: decodedToken.uid,
      email: decodedToken.email,
      username: decodedToken.name || decodedToken.email?.split('@')[0]
    };
    console.log(`[Firebase Auth] Token verified for userId: ${req.user.userId}`);
    next();
  } catch (err) {
    console.error('[Firebase Auth] Token verification failed:', err.message);
    return res.status(403).json({ error: 'رمز غير صالح أو منتهي الصلاحية' });
  }
}

module.exports = { authenticateToken };

