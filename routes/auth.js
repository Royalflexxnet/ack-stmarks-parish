const { Router } = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { generateToken } = require('../middleware/auth');

const router = Router();

router.post('/register', (req, res) => {
  try {
    const {
      full_name, gender, phone, password,
      marital_status, spouse_name, spouse_phone,
      children_info, fellowship, department,
      mpesa_code, registration_fee
    } = req.body;

    if (!full_name || !gender || !phone || !password) {
      return res.status(400).json({ error: 'Full name, gender, phone, and password are required' });
    }

    const existing = db.prepare('SELECT id FROM members WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(409).json({ error: 'A member with this phone number already exists' });
    }

    const hashed = bcrypt.hashSync(password, 10);

    const nextNo = 'ASMM-' + String(db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(membership_no, 6) AS INTEGER)), 1000) + 1 AS next FROM members").get().next);

    const username = full_name.trim().toLowerCase().replace(/\s+/g, '.');

    const result = db.prepare(`
      INSERT INTO members (membership_no, username, full_name, gender, phone, password, marital_status, spouse_name, spouse_phone, children_info, fellowship, department, registration_fee, mpesa_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(nextNo), username, full_name, gender, phone, hashed,
      marital_status || '', spouse_name || '', spouse_phone || '',
      JSON.stringify(children_info || []), fellowship || '', department || '',
      parseFloat(registration_fee || 0), (mpesa_code || '').trim()
    );

    const fee = parseFloat(registration_fee || 0);
    if (fee > 0) {
      db.prepare(`INSERT INTO contributions (member_id, type, amount, description, status) VALUES (?, ?, ?, ?, 0)`).run(
        result.lastInsertRowid, 'Registration Fee', fee, 'Initial registration fee'
      );
    }

    const token = generateToken(result.lastInsertRowid);
    res.status(201).json({ token, member_id: result.lastInsertRowid, membership_no: String(nextNo) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const input = username.trim();
    const member = db.prepare(`
      SELECT * FROM members WHERE LOWER(username) = LOWER(?)
      OR LOWER(full_name) = LOWER(?) OR phone = ? OR membership_no = ?
    `).get(input, input, input, input);
    if (!member || !bcrypt.compareSync(password, member.password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!member.active) {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact the church admin.' });
    }

    const token = generateToken(member.id);
    res.json({ token, member_id: member.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
