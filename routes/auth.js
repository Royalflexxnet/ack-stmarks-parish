const { Router } = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { generateToken } = require('../middleware/auth');

const router = Router();

router.post('/register', (req, res) => {
  try {
    const {
      full_name, gender, phone, password,
      marital_status, spouse_name, spouse_phone, spouse_is_member,
      spouse_gender, spouse_password,
      children_info, fellowship, department,
      mpesa_code, registration_fee
    } = req.body;

    if (!full_name || !gender || !phone || !password) {
      return res.status(400).json({ error: 'Full name, gender, phone, and password are required' });
    }

    if (spouse_is_member && marital_status === 'Married') {
      if (!spouse_name || !spouse_phone || !spouse_gender || !spouse_password) {
        return res.status(400).json({ error: 'Spouse name, phone, gender, and password are required when registering spouse as a member' });
      }
    }

    const existing = db.prepare('SELECT id FROM members WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(409).json({ error: 'A member with this phone number already exists' });
    }

    if (spouse_is_member && marital_status === 'Married') {
      const spouseExisting = db.prepare('SELECT id FROM members WHERE phone = ?').get(spouse_phone.trim());
      if (spouseExisting) {
        return res.status(409).json({ error: 'A member with the spouse\'s phone number already exists' });
      }
    }

    const hashed = bcrypt.hashSync(password, 10);

    const txn = db.transaction(() => {
      const baseNum = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(membership_no, 6) AS INTEGER)), 1000) AS base FROM members").get().base;
      const username = full_name.trim().toLowerCase().replace(/\s+/g, '.');

      let spouseMemberId = null;
      let nextNo, spouseNextNo;

      // If spouse is being registered as a member, assign numbers sequentially
      if (spouse_is_member && marital_status === 'Married') {
        nextNo = 'ASMM-' + String(baseNum + 1);
        spouseNextNo = 'ASMM-' + String(baseNum + 2);
        const spouseUsername = spouse_name.trim().toLowerCase().replace(/\s+/g, '.');
        const spouseHashed = bcrypt.hashSync(spouse_password, 10);

        const spouseResult = db.prepare(`
          INSERT INTO members (membership_no, username, full_name, gender, phone, password, marital_status, fellowship, department, registration_fee, mpesa_code, spouse_member_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          String(spouseNextNo), spouseUsername, spouse_name.trim(), spouse_gender, spouse_phone.trim(), spouseHashed,
          'Married', fellowship || '', department || '', 0, (mpesa_code || '').trim(), null
        );

        spouseMemberId = spouseResult.lastInsertRowid;
      } else {
        nextNo = 'ASMM-' + String(baseNum + 1);
      }

      // Insert primary member
      const result = db.prepare(`
        INSERT INTO members (membership_no, username, full_name, gender, phone, password, marital_status, spouse_name, spouse_phone, children_info, fellowship, department, registration_fee, mpesa_code, spouse_member_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(nextNo), username, full_name, gender, phone, hashed,
        marital_status || '',
        spouse_is_member ? '' : (spouse_name || ''),
        spouse_is_member ? '' : (spouse_phone || ''),
        JSON.stringify(children_info || []), fellowship || '', department || '',
        parseFloat(registration_fee || 0), (mpesa_code || '').trim(),
        spouseMemberId
      );

      // Link spouse back to primary member
      if (spouseMemberId) {
        db.prepare('UPDATE members SET spouse_member_id = ? WHERE id = ?').run(result.lastInsertRowid, spouseMemberId);
      }

      // Create contribution for primary member
      const fee = parseFloat(registration_fee || 0);
      if (fee > 0) {
        db.prepare(`INSERT INTO contributions (member_id, type, amount, description, status) VALUES (?, ?, ?, ?, 0)`).run(
          result.lastInsertRowid, 'Registration Fee', fee, 'Initial registration fee'
        );
      }

      return { memberId: result.lastInsertRowid, membershipNo: String(nextNo), spouseMemberId };
    });

    const { memberId, membershipNo, spouseMemberId } = txn();

    const token = generateToken(memberId);
    res.status(201).json({
      token, member_id: memberId, membership_no: membershipNo,
      spouse_member_id: spouseMemberId
    });
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
