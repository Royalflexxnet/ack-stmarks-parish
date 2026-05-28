const { Router } = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticateAdmin, requirePermission, generateAdminToken } = require('../middleware/adminAuth');

const router = Router();

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.toLowerCase().trim());
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const token = generateAdminToken(admin.id);
    res.json({
      token,
      admin: {
        id: admin.id, username: admin.username, full_name: admin.full_name,
        role: admin.role, target_fellowship: admin.target_fellowship,
        can_manage_members: !!admin.can_manage_members,
        can_manage_contributions: !!admin.can_manage_contributions,
        can_manage_announcements: !!admin.can_manage_announcements,
        can_manage_admins: !!admin.can_manage_admins,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Admin login failed' });
  }
});

router.use(authenticateAdmin);

// ─── Stats ───
router.get('/stats', (req, res) => {
  const fellowshipFilter = req.admin.target_fellowship;
  let memberWhere = '';
  let params = [];
  if (fellowshipFilter) {
    memberWhere = 'WHERE fellowship = ?';
    params.push(fellowshipFilter);
  }

  const memberCount = db.prepare(`SELECT COUNT(*) AS c FROM members ${memberWhere}`).get(...params).c;
  const activeCount = db.prepare(`SELECT COUNT(*) AS c FROM members ${memberWhere ? memberWhere + ' AND active = 1' : 'WHERE active = 1'}`).get(...params).c;
  const contributionTotal = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM contributions`).get().total;
  const contributionCount = db.prepare('SELECT COUNT(*) AS c FROM contributions').get().c;
  const deptCount = db.prepare('SELECT COUNT(*) AS c FROM departments').get().c;
  const annCount = db.prepare('SELECT COUNT(*) AS c FROM announcements').get().c;

  res.json({
    total_members: memberCount,
    active_members: activeCount,
    total_contributions: contributionCount,
    contribution_total: contributionTotal,
    total_departments: deptCount,
    total_announcements: annCount,
    fellowship_filter: fellowshipFilter || null,
  });
});

router.get('/stats/departments', (req, res) => {
  const depts = db.prepare(`
    SELECT d.name, d.description, COUNT(m.id) AS member_count
    FROM departments d LEFT JOIN members m ON m.department = d.name
    GROUP BY d.id ORDER BY d.name
  `).all();
  res.json(depts);
});

router.get('/stats/fellowships', (req, res) => {
  const fells = db.prepare(`
    SELECT fellowship, COUNT(*) AS member_count
    FROM members WHERE fellowship != '' AND fellowship IS NOT NULL
    GROUP BY fellowship ORDER BY fellowship
  `).all();
  res.json(fells);
});

router.put('/password', (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const admin = db.prepare('SELECT password FROM admins WHERE id = ?').get(req.adminId);
  if (!require('bcryptjs').compareSync(current_password, admin.password)) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }

  const hashed = require('bcryptjs').hashSync(new_password, 10);
  db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hashed, req.adminId);
  res.json({ success: true, message: 'Password changed successfully' });
});

// ─── Members ───
router.get('/members', requirePermission('can_manage_members'), (req, res) => {
  const fellowshipFilter = req.admin.target_fellowship;
  let where = '';
  let params = [];
  if (fellowshipFilter) {
    where = 'WHERE fellowship = ?';
    params.push(fellowshipFilter);
  }

  const members = db.prepare(`
    SELECT id, membership_no, username, full_name, gender, phone,
           marital_status, fellowship, department, active, created_at
    FROM members ${where} ORDER BY created_at DESC
  `).all(...params);
  res.json(members);
});

router.post('/members', requirePermission('can_manage_members'), (req, res) => {
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

    if (!mpesa_code || !mpesa_code.trim()) {
      return res.status(400).json({ error: 'MPesa confirmation code is required. The member must pay the registration fee via MPesa Paybill 247247, Account STMARKS-REG.' });
    }

    // Fellowship leader can only create members in their fellowship
    if (req.admin.target_fellowship && fellowship !== req.admin.target_fellowship) {
      return res.status(403).json({ error: `You can only create members in ${req.admin.target_fellowship}` });
    }

    const existing = db.prepare('SELECT id FROM members WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(409).json({ error: 'A member with this phone number already exists' });
    }

    const hashed = require('bcryptjs').hashSync(password, 10);
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

    res.status(201).json({
      success: true,
      member_id: result.lastInsertRowid,
      membership_no: String(nextNo),
      username
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

router.get('/members/:id', requirePermission('can_manage_members'), (req, res) => {
  const member = db.prepare(`
    SELECT id, membership_no, username, full_name, gender, phone,
           marital_status, spouse_name, spouse_phone, children_info,
           fellowship, department, active, registration_fee, mpesa_code, created_at
    FROM members WHERE id = ?
  `).get(req.params.id);

  if (!member) return res.status(404).json({ error: 'Member not found' });

  // Fellowship leader can only view their own fellowship
  if (req.admin.target_fellowship && member.fellowship !== req.admin.target_fellowship) {
    return res.status(403).json({ error: 'You can only view members in your fellowship' });
  }

  member.children_info = JSON.parse(member.children_info || '[]');
  res.json(member);
});

router.patch('/members/:id/status', requirePermission('can_manage_members'), (req, res) => {
  if (req.admin.role === 'fellowship_leader') {
    return res.status(403).json({ error: 'Fellowship leaders cannot activate/deactivate members' });
  }
  const { active } = req.body;
  if (active === undefined || (active !== 0 && active !== 1)) {
    return res.status(400).json({ error: 'Active status must be 0 or 1' });
  }

  const member = db.prepare('SELECT id, fellowship FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (req.admin.target_fellowship && member.fellowship !== req.admin.target_fellowship) {
    return res.status(403).json({ error: 'You can only manage members in your fellowship' });
  }

  db.prepare('UPDATE members SET active = ? WHERE id = ?').run(active, req.params.id);
  res.json({ success: true, active: !!active });
});

router.post('/members/:id/reset-password', requirePermission('can_manage_members'), (req, res) => {
  const member = db.prepare('SELECT id, fellowship FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (req.admin.target_fellowship && member.fellowship !== req.admin.target_fellowship) {
    return res.status(403).json({ error: 'You can only manage members in your fellowship' });
  }

  const newPassword = 'reset123';
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE members SET password = ? WHERE id = ?').run(hashed, req.params.id);
  res.json({ success: true, new_password: newPassword });
});

router.delete('/members/:id', requirePermission('can_manage_members'), (req, res) => {
  const member = db.prepare('SELECT id, fellowship FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (req.admin.target_fellowship && member.fellowship !== req.admin.target_fellowship) {
    return res.status(403).json({ error: 'You can only manage members in your fellowship' });
  }

  db.prepare('DELETE FROM contributions WHERE member_id = ?').run(req.params.id);
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Contributions ───
router.get('/contributions', requirePermission('can_manage_contributions'), (req, res) => {
  const { member_id } = req.query;
  let where = '';
  let params = [];

  if (req.admin.target_fellowship) {
    where = 'WHERE m.fellowship = ?';
    params.push(req.admin.target_fellowship);
  }

  if (member_id) {
    where = where ? `${where} AND c.member_id = ?` : 'WHERE c.member_id = ?';
    params.push(member_id);
  }

  const contributions = db.prepare(`
    SELECT c.*, m.full_name, m.membership_no, m.fellowship
    FROM contributions c JOIN members m ON c.member_id = m.id
    ${where} ORDER BY c.date DESC
  `).all(...params);
  res.json(contributions);
});

router.post('/contributions', requirePermission('can_manage_contributions'), (req, res) => {
  try {
    const { member_id, type, amount, description } = req.body;
    if (!member_id || !type || !amount) {
      return res.status(400).json({ error: 'Member, type, and amount are required' });
    }

    const member = db.prepare('SELECT id FROM members WHERE id = ?').get(member_id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    if (req.admin.target_fellowship) {
      const m = db.prepare('SELECT fellowship FROM members WHERE id = ?').get(member_id);
      if (m.fellowship !== req.admin.target_fellowship) {
        return res.status(403).json({ error: `You can only add contributions for ${req.admin.target_fellowship} members` });
      }
    }

    const result = db.prepare(`
      INSERT INTO contributions (member_id, type, amount, description, status) VALUES (?, ?, ?, ?, 0)
    `).run(member_id, type, parseFloat(amount), description || '');

    res.status(201).json({ id: result.lastInsertRowid, status: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create contribution' });
  }
});

router.patch('/contributions/:id/approve', requirePermission('can_manage_contributions'), (req, res) => {
  const result = db.prepare('UPDATE contributions SET status = 1 WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Contribution not found' });
  res.json({ success: true });
});

// ─── Announcements ───
router.get('/announcements', (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.json(announcements);
});

router.post('/announcements', requirePermission('can_manage_announcements'), (req, res) => {
  const { title, body, department } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }
  const result = db.prepare(
    'INSERT INTO announcements (title, body, department) VALUES (?, ?, ?)'
  ).run(title, body, department || '');
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/announcements/:id', requirePermission('can_manage_announcements'), (req, res) => {
  const { title, body, department } = req.body;
  const result = db.prepare(
    'UPDATE announcements SET title=?, body=?, department=? WHERE id=?'
  ).run(title, body, department || '', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Announcement not found' });
  res.json({ success: true });
});

router.delete('/announcements/:id', requirePermission('can_manage_announcements'), (req, res) => {
  const result = db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Announcement not found' });
  res.json({ success: true });
});

// ─── Admin Management (superadmin/vicar only) ───
router.get('/admins', requirePermission('can_manage_admins'), (req, res) => {
  const admins = db.prepare(`
    SELECT id, username, full_name, role, target_fellowship,
           can_manage_members, can_manage_contributions,
           can_manage_announcements, can_manage_admins, created_at
    FROM admins ORDER BY created_at ASC
  `).all();
  res.json(admins);
});

router.get('/admins/roles', (req, res) => {
  const roles = [
    { id: 'superadmin', label: 'Super Admin', permissions: { can_manage_members: 1, can_manage_contributions: 1, can_manage_announcements: 1, can_manage_admins: 1 } },
    { id: 'vicar', label: 'Vicar', permissions: { can_manage_members: 1, can_manage_contributions: 1, can_manage_announcements: 1, can_manage_admins: 1 } },
    { id: 'treasurer', label: 'Treasurer', permissions: { can_manage_members: 1, can_manage_contributions: 1, can_manage_announcements: 0, can_manage_admins: 0 } },
    { id: 'secretary', label: 'Secretary', permissions: { can_manage_members: 1, can_manage_contributions: 0, can_manage_announcements: 1, can_manage_admins: 0 } },
    { id: 'vice_chairman', label: 'Vice Chairman', permissions: { can_manage_members: 1, can_manage_contributions: 1, can_manage_announcements: 1, can_manage_admins: 0 } },
    { id: 'peoples_warden', label: "People's Warden", permissions: { can_manage_members: 1, can_manage_contributions: 0, can_manage_announcements: 1, can_manage_admins: 0 } },
    { id: 'vicars_warden', label: "Vicar's Warden", permissions: { can_manage_members: 1, can_manage_contributions: 0, can_manage_announcements: 1, can_manage_admins: 0 } },
    { id: 'fellowship_leader', label: 'Fellowship Leader', permissions: { can_manage_members: 1, can_manage_contributions: 0, can_manage_announcements: 1, can_manage_admins: 0 }, requires_fellowship: true },
    { id: 'sunday_school_leader', label: 'Sunday School Leader', permissions: { can_manage_members: 1, can_manage_contributions: 0, can_manage_announcements: 1, can_manage_admins: 0 } },
  ];
  res.json(roles);
});

router.post('/admins', requirePermission('can_manage_admins'), (req, res) => {
  const { username, password, full_name, role, target_fellowship, permissions } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Username, password, full name, and role are required' });
  }

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const hashed = bcrypt.hashSync(password, 10);
  const p = permissions || {};
  db.prepare(`
    INSERT INTO admins (username, password, full_name, role, target_fellowship,
      can_manage_members, can_manage_contributions, can_manage_announcements, can_manage_admins)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    username.toLowerCase().trim(), hashed, full_name, role,
    target_fellowship || '',
    p.can_manage_members ? 1 : 0,
    p.can_manage_contributions ? 1 : 0,
    p.can_manage_announcements ? 1 : 0,
    p.can_manage_admins ? 1 : 0,
  );

  res.status(201).json({ success: true });
});

router.put('/admins/:id', requirePermission('can_manage_admins'), (req, res) => {
  const { full_name, role, target_fellowship, password, permissions } = req.body;

  let sets = [];
  let params = [];

  if (full_name !== undefined) { sets.push('full_name = ?'); params.push(full_name); }
  if (role !== undefined) { sets.push('role = ?'); params.push(role); }
  if (target_fellowship !== undefined) { sets.push('target_fellowship = ?'); params.push(target_fellowship); }
  if (password) {
    sets.push('password = ?');
    params.push(bcrypt.hashSync(password, 10));
  }
  if (permissions) {
    if (permissions.can_manage_members !== undefined) { sets.push('can_manage_members = ?'); params.push(permissions.can_manage_members ? 1 : 0); }
    if (permissions.can_manage_contributions !== undefined) { sets.push('can_manage_contributions = ?'); params.push(permissions.can_manage_contributions ? 1 : 0); }
    if (permissions.can_manage_announcements !== undefined) { sets.push('can_manage_announcements = ?'); params.push(permissions.can_manage_announcements ? 1 : 0); }
    if (permissions.can_manage_admins !== undefined) { sets.push('can_manage_admins = ?'); params.push(permissions.can_manage_admins ? 1 : 0); }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  const result = db.prepare(`UPDATE admins SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  if (result.changes === 0) return res.status(404).json({ error: 'Admin not found' });
  res.json({ success: true });
});

router.delete('/admins/:id', requirePermission('can_manage_admins'), (req, res) => {
  if (parseInt(req.params.id) === req.adminId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const result = db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Admin not found' });
  res.json({ success: true });
});

// ─── Finance Users Management ───
router.get('/finance-users', requirePermission('can_manage_admins'), (req, res) => {
  res.json(db.prepare('SELECT id, username, full_name, role, active, can_manage_entries, can_manage_petty_cash, can_manage_development, can_manage_users, can_view_reports, created_at FROM finance_users ORDER BY created_at DESC').all());
});

router.post('/finance-users', requirePermission('can_manage_admins'), (req, res) => {
  const { username, password, full_name, role, can_manage_entries, can_manage_petty_cash, can_manage_development, can_manage_users, can_view_reports } = req.body;
  if (!username || !password || !full_name) return res.status(400).json({ error: 'Username, password, and full name are required' });
  const cleanUser = username.trim();
  const existing = db.prepare('SELECT id FROM finance_users WHERE username = ?').get(cleanUser);
  if (existing) return res.status(409).json({ error: 'Username already exists' });
  db.prepare('INSERT INTO finance_users (username, password, full_name, role, can_manage_entries, can_manage_petty_cash, can_manage_development, can_manage_users, can_view_reports) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    cleanUser, bcrypt.hashSync(password, 10), full_name, role || 'finance_user',
    can_manage_entries ? 1 : 0, can_manage_petty_cash ? 1 : 0, can_manage_development ? 1 : 0, can_manage_users ? 1 : 0, can_view_reports ? 1 : 0
  );
  res.status(201).json({ success: true });
});

router.patch('/finance-users/:id/toggle', requirePermission('can_manage_admins'), (req, res) => {
  const user = db.prepare('SELECT active FROM finance_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE finance_users SET active = ? WHERE id = ?').run(user.active ? 0 : 1, req.params.id);
  res.json({ success: true, active: !user.active });
});

router.delete('/finance-users/:id', requirePermission('can_manage_admins'), (req, res) => {
  const user = db.prepare('SELECT id FROM finance_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM finance_users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Page Content Management ───
router.get('/content/:page', requirePermission('can_manage_announcements'), (req, res) => {
  const rows = db.prepare('SELECT field, content FROM page_content WHERE page = ?').all(req.params.page);
  const result = {};
  for (const r of rows) result[r.field] = r.content;
  res.json(result);
});

router.put('/content', requirePermission('can_manage_announcements'), (req, res) => {
  const { page, fields } = req.body;
  if (!page || !fields) return res.status(400).json({ error: 'Page and fields are required' });
  const upsert = db.prepare('INSERT INTO page_content (page, field, content) VALUES (?, ?, ?) ON CONFLICT(page, field) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP');
  const txn = db.transaction(() => {
    for (const [field, content] of Object.entries(fields)) {
      upsert.run(page, field, content);
    }
  });
  txn();
  res.json({ success: true });
});

// ─── Events Management ───
router.get('/events', (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY date ASC, time ASC').all());
});

router.post('/events', requirePermission('can_manage_announcements'), (req, res) => {
  const { title, description, location, date, time } = req.body;
  if (!title || !description || !date) return res.status(400).json({ error: 'Title, description, and date are required' });
  const result = db.prepare('INSERT INTO events (title, description, location, date, time, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
    title, description, location || '', date, time || '', req.adminId
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/events/:id', requirePermission('can_manage_announcements'), (req, res) => {
  const { title, description, location, date, time } = req.body;
  const entry = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Event not found' });
  db.prepare('UPDATE events SET title=?, description=?, location=?, date=?, time=? WHERE id=?').run(
    title || entry.title, description || entry.description, location !== undefined ? location : entry.location,
    date || entry.date, time !== undefined ? time : entry.time, req.params.id
  );
  res.json({ success: true });
});

router.delete('/events/:id', requirePermission('can_manage_announcements'), (req, res) => {
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Event not found' });
  res.json({ success: true });
});

// ─── Change Requests (vicar/superadmin only) ───
router.get('/change-requests', (req, res) => {
  if (req.admin.role !== 'superadmin' && req.admin.role !== 'vicar') {
    return res.status(403).json({ error: 'Only the Vicar can manage change requests' });
  }

  const requests = db.prepare(`
    SELECT cr.*, m.full_name, m.membership_no
    FROM change_requests cr
    JOIN members m ON cr.member_id = m.id
    ORDER BY cr.created_at DESC
  `).all();
  res.json(requests);
});

router.post('/change-requests/:id/approve', (req, res) => {
  if (req.admin.role !== 'superadmin' && req.admin.role !== 'vicar') {
    return res.status(403).json({ error: 'Only the Vicar can approve change requests' });
  }

  const cr = db.prepare('SELECT * FROM change_requests WHERE id = ? AND status = ?').get(req.params.id, 'pending');
  if (!cr) return res.status(404).json({ error: 'Pending change request not found' });

  db.prepare(`UPDATE members SET ${cr.field} = ? WHERE id = ?`).run(cr.requested_value, cr.member_id);
  db.prepare('UPDATE change_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime(?) WHERE id = ?')
    .run('approved', req.adminId, new Date().toISOString(), req.params.id);

  res.json({ success: true, message: `${cr.field} changed from "${cr.current_value}" to "${cr.requested_value}"` });
});

router.post('/change-requests/:id/reject', (req, res) => {
  if (req.admin.role !== 'superadmin' && req.admin.role !== 'vicar') {
    return res.status(403).json({ error: 'Only the Vicar can reject change requests' });
  }

  const cr = db.prepare('SELECT * FROM change_requests WHERE id = ? AND status = ?').get(req.params.id, 'pending');
  if (!cr) return res.status(404).json({ error: 'Pending change request not found' });

  db.prepare('UPDATE change_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime(?) WHERE id = ?')
    .run('rejected', req.adminId, new Date().toISOString(), req.params.id);

  res.json({ success: true, message: 'Change request rejected' });
});

// ─── Fellowships list ───
router.get('/fellowships', (req, res) => {
  const fellowships = db.prepare("SELECT DISTINCT fellowship FROM members WHERE fellowship != '' AND fellowship IS NOT NULL ORDER BY fellowship").all();
  const defaultFellowships = ['Nazareth', 'Jerusalem', 'Judea', "Vicar's Care"];
  const all = new Set();
  fellowships.forEach(f => all.add(f.fellowship));
  defaultFellowships.forEach(f => all.add(f));
  res.json(Array.from(all).sort());
});

module.exports = router;
