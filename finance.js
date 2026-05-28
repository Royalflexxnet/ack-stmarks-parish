const { Router } = require('express');
const db = require('../database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'church-secret-key-finance';

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, source: user.source || 'finance' }, JWT_SECRET, { expiresIn: '24h' });
}

function loadPermissions(user) {
  if (user.source === 'admin') {
    const admin = db.prepare('SELECT role FROM admins WHERE id = ?').get(user.id);
    if (!admin) return user;
    if (admin.role === 'superadmin') {
      user.can_manage_entries = 1; user.can_manage_petty_cash = 1; user.can_manage_development = 1; user.can_manage_users = 1; user.can_view_reports = 1;
    } else if (admin.role === 'treasurer') {
      user.can_manage_entries = 1; user.can_manage_petty_cash = 1; user.can_manage_development = 1; user.can_manage_users = 1; user.can_view_reports = 1;
    } else if (admin.role === 'vice_chairman') {
      user.can_view_reports = 1;
    } else if (admin.role === 'vicar') {
      user.can_view_reports = 1;
    }
  } else {
    const perms = db.prepare('SELECT can_manage_entries, can_manage_petty_cash, can_manage_development, can_manage_users, can_view_reports FROM finance_users WHERE id = ?').get(user.id);
    if (perms) Object.assign(user, perms);
  }
  return user;
}

function authenticateFinance(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Authorization header required' });
  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.source === 'admin') {
      const admin = db.prepare('SELECT id, username, full_name, role FROM admins WHERE id = ?').get(decoded.id);
      if (!admin) return res.status(403).json({ error: 'Admin account not found' });
      if (!['superadmin','vicar','treasurer','vice_chairman'].includes(admin.role)) return res.status(403).json({ error: 'You do not have finance portal access' });
      const roleMap = { treasurer: 'finance_admin', vice_chairman: 'finance_manager', superadmin: 'finance_superadmin', vicar: 'finance_viewer' };
      req.financeUser = loadPermissions({ id: admin.id, username: admin.username, full_name: admin.full_name, role: roleMap[admin.role] || 'finance_viewer', source: 'admin' });
      return next();
    }
    const user = db.prepare('SELECT id, username, full_name, role FROM finance_users WHERE id = ? AND active = 1').get(decoded.id);
    if (!user) return res.status(403).json({ error: 'Account not found or inactive' });
    req.financeUser = loadPermissions({ ...user, source: 'finance' });
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (req.financeUser[perm]) return next();
    res.status(403).json({ error: 'You do not have permission for this action' });
  };
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const cleanUser = username.trim();
  let user = db.prepare('SELECT * FROM finance_users WHERE username = ? AND active = 1').get(cleanUser);
  if (user && bcrypt.compareSync(password, user.password)) {
    const token = generateToken({ id: user.id, username: user.username, role: user.role, source: 'finance' });
    const perms = db.prepare('SELECT can_manage_entries, can_manage_petty_cash, can_manage_development, can_manage_users, can_view_reports FROM finance_users WHERE id = ?').get(user.id);
    return res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, ...perms } });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(cleanUser);
  if (admin && (admin.role === 'superadmin' || admin.role === 'vicar' || admin.role === 'treasurer' || admin.role === 'vice_chairman') && bcrypt.compareSync(password, admin.password)) {
    const roleMap = { treasurer: 'finance_admin', vice_chairman: 'finance_manager', superadmin: 'finance_superadmin', vicar: 'finance_viewer' };
    const mappedRole = roleMap[admin.role] || 'finance_viewer';
    const token = generateToken({ id: admin.id, username: admin.username, role: mappedRole, source: 'admin' });
    const user = loadPermissions({ id: admin.id, username: admin.username, full_name: admin.full_name, role: mappedRole, source: 'admin' });
    return res.json({ token, user });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

router.use(authenticateFinance);

router.get('/profile', (req, res) => res.json(req.financeUser));

router.put('/password', (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password required' });
  if (new_password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const source = req.financeUser.source || 'finance';
  if (source === 'finance') {
    const user = db.prepare('SELECT password FROM finance_users WHERE id = ?').get(req.financeUser.id);
    if (!user) return res.status(400).json({ error: 'User not found' });
    if (!bcrypt.compareSync(current_password, user.password)) return res.status(403).json({ error: 'Current password is incorrect' });
    db.prepare('UPDATE finance_users SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.financeUser.id);
  } else {
    const admin = db.prepare('SELECT password FROM admins WHERE id = ?').get(req.financeUser.id);
    if (!admin) return res.status(400).json({ error: 'User not found' });
    if (!bcrypt.compareSync(current_password, admin.password)) return res.status(403).json({ error: 'Current password is incorrect' });
    db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.financeUser.id);
  }
  res.json({ success: true });
});

router.get('/entries', (req, res) => {
  const { type, start_date, end_date } = req.query;
  let sql = `SELECT e.*, u.full_name AS created_by_name, CASE WHEN e.edited_at IS NOT NULL THEN 1 ELSE 0 END AS edited FROM finance_entries e LEFT JOIN finance_users u ON e.created_by = u.id WHERE 1=1`;
  const params = [];
  if (type) { sql += ' AND e.type = ?'; params.push(type); }
  if (start_date) { sql += ' AND e.entry_date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND e.entry_date <= ?'; params.push(end_date); }
  sql += ' ORDER BY e.entry_date DESC, e.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/entries', requirePerm('can_manage_entries'), (req, res) => {
  const { type, category, amount, description, entry_date, cheque_no } = req.body;
  if (!type || !['collection', 'income', 'expense'].includes(type)) return res.status(400).json({ error: 'Type must be collection, income, or expense' });
  if (!amount) return res.status(400).json({ error: 'Amount is required' });
  const result = db.prepare('INSERT INTO finance_entries (type, category, amount, description, entry_date, created_by, cheque_no) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    type, category || '', parseFloat(amount), description || '', entry_date || new Date().toISOString().split('T')[0], req.financeUser.id, cheque_no || ''
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/entries/:id', (req, res) => {
  if (req.financeUser.role !== 'finance_superadmin') return res.status(403).json({ error: 'Only superadmin can edit entries' });
  const entry = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const { type, category, amount, description, entry_date } = req.body;
  db.prepare('UPDATE finance_entries SET type=?, category=?, amount=?, description=?, entry_date=?, edited_at=CURRENT_TIMESTAMP WHERE id=?').run(
    type || entry.type, category !== undefined ? category : entry.category, amount !== undefined ? parseFloat(amount) : entry.amount, description !== undefined ? description : entry.description, entry_date || entry.entry_date, req.params.id
  );
  res.json({ success: true, edited: true });
});

router.delete('/entries/:id', (req, res) => {
  if (req.financeUser.role !== 'finance_superadmin') return res.status(403).json({ error: 'Only superadmin can delete entries' });
  const entry = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  db.prepare('DELETE FROM finance_entries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/summary', (req, res) => {
  const { start_date, end_date } = req.query;
  let dateFilter = '';
  const params = [];
  if (start_date) { dateFilter += ' AND entry_date >= ?'; params.push(start_date); }
  if (end_date) { dateFilter += ' AND entry_date <= ?'; params.push(end_date); }
  const collection = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries WHERE type = 'collection'${dateFilter}`).get(...params);
  const income = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries WHERE type = 'income'${dateFilter}`).get(...params);
  const expense = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries WHERE type = 'expense'${dateFilter}`).get(...params);
  res.json({ total_collection: collection.total, total_income: income.total, total_expense: expense.total, balance: collection.total + income.total - expense.total });
});

router.get('/collection-categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM collection_categories ORDER BY name').all());
});

router.post('/collection-categories', requirePerm('can_manage_entries'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare('INSERT INTO collection_categories (name) VALUES (?)').run(name);
    res.status(201).json({ id: result.lastInsertRowid, name });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Category already exists' });
    throw e;
  }
});

router.delete('/collection-categories/:id', requirePerm('can_manage_entries'), (req, res) => {
  const result = db.prepare('DELETE FROM collection_categories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

router.get('/expenditure-items', (req, res) => {
  res.json(db.prepare('SELECT * FROM expenditure_items ORDER BY name').all());
});

router.post('/entries/bulk', requirePerm('can_manage_entries'), (req, res) => {
  const { type, entry_date, items, cheque_no } = req.body;
  if (!type || !entry_date || !items || !Array.isArray(items)) return res.status(400).json({ error: 'Type, date, and items array required' });
  const insert = db.prepare('INSERT INTO finance_entries (type, category, amount, description, entry_date, created_by, cheque_no) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const txn = db.transaction((items) => {
    for (const item of items) {
      if (item.amount > 0) insert.run(type, item.category || '', item.amount, item.description || '', entry_date, req.financeUser.id, cheque_no || '');
    }
  });
  txn(items);
  res.status(201).json({ success: true, count: items.filter(i => i.amount > 0).length });
});

router.get('/report', requirePerm('can_view_reports'), (req, res) => {
  // Allow token via query param for window.open compatibility
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  const token = authHeader ? authHeader.split(' ')[1] : queryToken;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.source === 'admin') {
      const admin = db.prepare('SELECT id, username, full_name, role FROM admins WHERE id = ?').get(decoded.id);
      if (!admin || !['superadmin','vicar','treasurer','vice_chairman'].includes(admin.role)) return res.status(403).json({ error: 'Access denied' });
    } else {
      const user = db.prepare('SELECT id FROM finance_users WHERE id = ? AND active = 1').get(decoded.id);
      if (!user) return res.status(403).json({ error: 'Account not found' });
    }
  } catch { return res.status(401).json({ error: 'Invalid token' }); }

  const { start_date, end_date } = req.query;
  const sd = start_date || new Date().getFullYear() + '-01-01';
  const ed = end_date || new Date().toISOString().split('T')[0];

  const collections = db.prepare(`SELECT category, SUM(amount) AS total FROM finance_entries WHERE type='collection' AND entry_date >= ? AND entry_date <= ? GROUP BY category ORDER BY category`).all(sd, ed);
  const expenses = db.prepare(`SELECT description, SUM(amount) AS total FROM finance_entries WHERE type='expense' AND entry_date >= ? AND entry_date <= ? GROUP BY description ORDER BY description`).all(sd, ed);
  const totalColl = collections.reduce((s, c) => s + c.total, 0);
  const totalExp = expenses.reduce((s, e) => s + e.total, 0);
  const balance = totalColl - totalExp;

  const fmt = (n) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });
  const esc = (s) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Finance Report — ACK St. Mark's Parish - Malaa</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Segoe UI',sans-serif; padding:2rem; color:#333; }
    .header { text-align:center; margin-bottom:2rem; padding-bottom:1rem; border-bottom:3px double #1a73e8; }
    .header h1 { font-size:1.4rem; color:#1a73e8; }
    .header p { color:#666; font-size:0.9rem; }
    .summary { display:flex; gap:1rem; justify-content:center; margin-bottom:2rem; }
    .summary-box { padding:1rem 2rem; border-radius:8px; text-align:center; }
    .summary-box.income { background:#d4edda; }
    .summary-box.expense { background:#fde8e8; }
    .summary-box.balance { background:#e8f0fe; }
    .summary-box .label { font-size:0.8rem; color:#666; }
    .summary-box .value { font-size:1.5rem; font-weight:700; margin-top:0.3rem; }
    h2 { font-size:1.1rem; margin:1.5rem 0 0.5rem; color:#1a73e8; border-bottom:1px solid #ddd; padding-bottom:0.3rem; }
    table { width:100%; border-collapse:collapse; margin-bottom:1.5rem; }
    th, td { padding:0.6rem 1rem; text-align:left; border-bottom:1px solid #eee; font-size:0.9rem; }
    th { background:#f5f5f5; font-weight:600; }
    .total-row { font-weight:700; background:#f9f9f9; }
    .footer { text-align:center; margin-top:2rem; padding-top:1rem; border-top:1px solid #ddd; color:#999; font-size:0.8rem; }
    @media print { body { padding:1rem; } .no-print { display:none; } }
    .no-print { text-align:center; margin-bottom:1rem; }
    .no-print button { padding:0.6rem 2rem; font-size:1rem; background:#1a73e8; color:white; border:none; border-radius:6px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">Download PDF</button></div>
  <div class="header">
    <h1>ACK St. Mark's Parish - Malaa</h1>
    <p>Finance Report — ${sd} to ${ed}</p>
  </div>
  <div class="summary">
    <div class="summary-box income"><div class="label">Total Income</div><div class="value">${fmt(totalColl)}</div></div>
    <div class="summary-box expense"><div class="label">Total Expenditure</div><div class="value">${fmt(totalExp)}</div></div>
    <div class="summary-box balance"><div class="label">Balance</div><div class="value">${fmt(balance)}</div></div>
  </div>
  <h2>Sunday Collections</h2>
  ${collections.length === 0 ? '<p style="color:#999;font-size:0.9rem">No collections in this period.</p>' :
  '<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>' +
  collections.map(c => '<tr><td>' + esc(c.category) + '</td><td>' + fmt(c.total) + '</td></tr>').join('') +
  '<tr class="total-row"><td>Total Income</td><td>' + fmt(totalColl) + '</td></tr></tbody></table>'}
  <h2>Expenditure</h2>
  ${expenses.length === 0 ? '<p style="color:#999;font-size:0.9rem">No expenses in this period.</p>' :
  '<table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>' +
  expenses.map(e => '<tr><td>' + esc(e.description) + '</td><td>' + fmt(e.total) + '</td></tr>').join('') +
  '<tr class="total-row"><td>Total Expenditure</td><td>' + fmt(totalExp) + '</td></tr></tbody></table>'}
  <div class="footer">
    <p>Generated on ${new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p>ACK St. Mark's Parish - Malaa &copy; ${new Date().getFullYear()}</p>
  </div>
</body>
</html>`);
});

// Petty Cash
router.get('/petty-cash-items', (req, res) => {
  res.json(db.prepare('SELECT * FROM petty_cash_items ORDER BY name').all());
});

router.get('/petty-cash/cheques', (req, res) => {
  const cheques = db.prepare(`SELECT c.*, u.full_name AS created_by_name FROM petty_cash_cheques c LEFT JOIN finance_users u ON c.created_by = u.id ORDER BY c.opened_at DESC`).all();
  for (const c of cheques) {
    const spent = db.prepare('SELECT COALESCE(SUM(amount), 0) AS spent FROM petty_cash WHERE cheque_id = ?').get(c.id);
    c.balance = c.amount - spent.spent;
  }
  res.json(cheques);
});

router.post('/petty-cash/cheques', requirePerm('can_manage_petty_cash'), (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  const txn = db.transaction(() => {
    db.prepare("UPDATE petty_cash_cheques SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE status = 'open'").run();
    const r = db.prepare('INSERT INTO petty_cash_cheques (amount, balance, created_by) VALUES (?, ?, ?)').run(parseFloat(amount), parseFloat(amount), req.financeUser.id);
    return r.lastInsertRowid;
  });
  const id = txn();
  res.status(201).json({ id, amount: parseFloat(amount), balance: parseFloat(amount), status: 'open' });
});

router.patch('/petty-cash/cheques/:id/close', requirePerm('can_manage_petty_cash'), (req, res) => {
  const cheque = db.prepare('SELECT * FROM petty_cash_cheques WHERE id = ?').get(req.params.id);
  if (!cheque) return res.status(404).json({ error: 'Cheque not found' });
  if (cheque.status === 'closed') return res.status(400).json({ error: 'Already closed' });
  db.prepare("UPDATE petty_cash_cheques SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

router.get('/petty-cash/current', (req, res) => {
  const cheque = db.prepare("SELECT * FROM petty_cash_cheques WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();
  if (!cheque) return res.json(null);
  // Recalculate balance from actual entries
  const spent = db.prepare('SELECT COALESCE(SUM(amount), 0) AS spent FROM petty_cash WHERE cheque_id = ?').get(cheque.id);
  cheque.balance = cheque.amount - spent.spent;
  return res.json(cheque);
});

router.get('/petty-cash', (req, res) => {
  const { start_date, end_date, cheque_id } = req.query;
  let sql = `SELECT p.*, u.full_name AS created_by_name FROM petty_cash p LEFT JOIN finance_users u ON p.created_by = u.id WHERE 1=1`;
  const params = [];
  if (cheque_id) { sql += ' AND p.cheque_id = ?'; params.push(cheque_id); }
  if (start_date) { sql += ' AND p.entry_date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND p.entry_date <= ?'; params.push(end_date); }
  sql += ' ORDER BY p.entry_date DESC, p.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/petty-cash', requirePerm('can_manage_petty_cash'), (req, res) => {
  const { description, amount, entry_date } = req.body;
  if (!description || !amount) return res.status(400).json({ error: 'Description and amount are required' });
  const cheque = db.prepare("SELECT * FROM petty_cash_cheques WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();
  if (!cheque) return res.status(400).json({ error: 'No open petty cash cheque. Open one first.' });
  const spent = db.prepare('SELECT COALESCE(SUM(amount), 0) AS spent FROM petty_cash WHERE cheque_id = ?').get(cheque.id);
  const balance = cheque.amount - spent.spent;
  const amt = parseFloat(amount);
  if (amt > balance) return res.status(400).json({ error: 'Insufficient balance. Only ' + balance.toFixed(2) + ' remaining.' });
  const result = db.prepare('INSERT INTO petty_cash (cheque_id, description, amount, entry_date, created_by) VALUES (?, ?, ?, ?, ?)').run(
    cheque.id, description, amt, entry_date || new Date().toISOString().split('T')[0], req.financeUser.id
  );
  res.status(201).json({ id: result.lastInsertRowid, new_balance: balance - amt });
});

router.get('/petty-cash/summary', (req, res) => {
  const { start_date, end_date, cheque_id } = req.query;
  let dateFilter = '';
  const params = [];
  if (cheque_id) { dateFilter += ' AND cheque_id = ?'; params.push(cheque_id); }
  if (start_date) { dateFilter += ' AND entry_date >= ?'; params.push(start_date); }
  if (end_date) { dateFilter += ' AND entry_date <= ?'; params.push(end_date); }
  const total = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM petty_cash WHERE 1=1${dateFilter}`).get(...params);
  res.json({ total: total.total });
});

// Development
router.get('/development', requirePerm('can_view_reports'), (req, res) => {
  const { start_date, end_date } = req.query;
  let sql = `SELECT d.*, u.full_name AS created_by_name FROM development d LEFT JOIN finance_users u ON d.created_by = u.id WHERE 1=1`;
  const params = [];
  if (start_date) { sql += ' AND d.entry_date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND d.entry_date <= ?'; params.push(end_date); }
  sql += ' ORDER BY d.entry_date DESC, d.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/development', requirePerm('can_manage_development'), (req, res) => {
  const { type, description, amount, entry_date } = req.body;
  if (!type || !['income','expense'].includes(type)) return res.status(400).json({ error: 'Type must be income or expense' });
  if (!description || !amount) return res.status(400).json({ error: 'Description and amount are required' });
  const result = db.prepare('INSERT INTO development (type, description, amount, entry_date, created_by) VALUES (?, ?, ?, ?, ?)').run(
    type, description, parseFloat(amount), entry_date || new Date().toISOString().split('T')[0], req.financeUser.id
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/development/:id', requirePerm('can_manage_development'), (req, res) => {
  db.prepare('DELETE FROM development WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Users
router.get('/users', requirePerm('can_manage_users'), (req, res) => {
  res.json(db.prepare('SELECT id, username, full_name, role, active, can_manage_entries, can_manage_petty_cash, can_manage_development, can_manage_users, can_view_reports, created_at FROM finance_users ORDER BY created_at DESC').all());
});

router.post('/users', requirePerm('can_manage_users'), (req, res) => {
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

router.patch('/users/:id/toggle', requirePerm('can_manage_users'), (req, res) => {
  const user = db.prepare('SELECT active FROM finance_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE finance_users SET active = ? WHERE id = ?').run(user.active ? 0 : 1, req.params.id);
  res.json({ success: true, active: !user.active });
});

router.delete('/users/:id', requirePerm('can_manage_users'), (req, res) => {
  const user = db.prepare('SELECT id FROM finance_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM finance_users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Clear all finance data (finance_admin only) ───
router.post('/clear-all', requirePerm('can_manage_users'), (req, res) => {
  try {
    db.pragma('foreign_keys = OFF');
    const txn = db.transaction(() => {
      db.prepare('DELETE FROM petty_cash').run();
      db.prepare('DELETE FROM petty_cash_cheques').run();
      db.prepare('DELETE FROM development').run();
      db.prepare('DELETE FROM finance_entries').run();
      db.prepare('DELETE FROM contributions').run();
    });
    txn();
    db.pragma('foreign_keys = ON');
    res.json({ success: true, message: 'All finance data has been cleared' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

module.exports = router;
