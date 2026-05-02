const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'رمز الوصول مطلوب' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'رمز غير صالح أو منتهي الصلاحية' });
    }
    req.user = user;
    console.log(`[DEBUG AUTH] Token verified for userId: ${user.userId} (type: ${typeof user.userId})`);
    next();
  });
}

module.exports = { authenticateToken };

