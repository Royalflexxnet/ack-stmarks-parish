const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'ack-st-marks-parish-secret-2026';

function authenticateAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = db.prepare(`
      SELECT id, username, full_name, role, target_fellowship,
             can_manage_members, can_manage_contributions,
             can_manage_announcements, can_manage_admins
      FROM admins WHERE id = ?
    `).get(decoded.id);

    if (!admin) {
      return res.status(401).json({ error: 'Admin account not found' });
    }

    req.admin = admin;
    req.adminId = admin.id;
    req.adminRole = admin.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (req.admin.role === 'superadmin' || req.admin.role === 'vicar') {
      return next();
    }
    if (req.admin[perm]) {
      return next();
    }
    res.status(403).json({ error: 'You do not have permission for this action' });
  };
}

function generateAdminToken(id) {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { authenticateAdmin, requirePermission, generateAdminToken };
