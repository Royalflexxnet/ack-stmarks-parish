const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ack-dev-secret';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.memberId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function generateToken(id) {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { authenticate, generateToken };
