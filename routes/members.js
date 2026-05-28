const { Router } = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/profile', (req, res) => {
  const member = db.prepare(`
    SELECT id, membership_no, username, full_name, gender, phone, marital_status, spouse_name, spouse_phone, children_info, fellowship, department, created_at
    FROM members WHERE id = ?
  `).get(req.memberId);

  if (!member) return res.status(404).json({ error: 'Member not found' });

  member.children_info = JSON.parse(member.children_info || '[]');
  res.json(member);
});

router.put('/profile', (req, res) => {
  const {
    full_name, gender, phone, marital_status,
    spouse_name, spouse_phone, children_info
  } = req.body;

  // Fellowship and department changes require vicar approval via change request
  const current = db.prepare('SELECT fellowship, department FROM members WHERE id = ?').get(req.memberId);

  db.prepare(`
    UPDATE members SET full_name=?, gender=?, phone=?, marital_status=?,
      spouse_name=?, spouse_phone=?, children_info=?
    WHERE id=?
  `).run(
    full_name, gender, phone, marital_status || '',
    spouse_name || '', spouse_phone || '',
    JSON.stringify(children_info || []),
    req.memberId
  );

  res.json({ success: true });
});

router.get('/card', (req, res) => {
  const member = db.prepare(`
    SELECT id, membership_no, full_name, phone, fellowship, department, marital_status, spouse_name, spouse_phone, created_at
    FROM members WHERE id = ?
  `).get(req.memberId);

  if (!member) return res.status(404).json({ error: 'Member not found' });

  res.json({
    id: member.id,
    membership_no: member.membership_no,
    name: member.full_name,
    phone: member.phone,
    fellowship: member.fellowship,
    department: member.department,
    marital_status: member.marital_status || '',
    spouse_name: member.spouse_name || '',
    spouse_phone: member.spouse_phone || '',
    member_since: member.created_at,
    church: 'ACK St. Mark\'s Parish - Malaa'
  });
});

router.put('/password', (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const member = db.prepare('SELECT password FROM members WHERE id = ?').get(req.memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  if (!require('bcryptjs').compareSync(current_password, member.password)) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }

  const hashed = require('bcryptjs').hashSync(new_password, 10);
  db.prepare('UPDATE members SET password = ? WHERE id = ?').run(hashed, req.memberId);
  res.json({ success: true, message: 'Password changed successfully' });
});

router.post('/change-request', (req, res) => {
  try {
    const { field, requested_value } = req.body;
    if (!field || !requested_value) {
      return res.status(400).json({ error: 'Field and requested value are required' });
    }
    if (field !== 'fellowship' && field !== 'department') {
      return res.status(400).json({ error: 'Field must be fellowship or department' });
    }

    const member = db.prepare('SELECT fellowship, department FROM members WHERE id = ?').get(req.memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const currentValue = member[field] || '';

    if (currentValue === requested_value) {
      return res.status(400).json({ error: `Your ${field} is already set to "${requested_value}"` });
    }

    db.prepare(`
      INSERT INTO change_requests (member_id, field, current_value, requested_value, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(req.memberId, field, currentValue, requested_value);

    res.status(201).json({ success: true, message: 'Change request submitted for vicar approval' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit change request' });
  }
});

router.get('/change-requests', (req, res) => {
  const requests = db.prepare(`
    SELECT id, field, current_value, requested_value, status, created_at
    FROM change_requests WHERE member_id = ? ORDER BY created_at DESC
  `).all(req.memberId);
  res.json(requests);
});

module.exports = router;
