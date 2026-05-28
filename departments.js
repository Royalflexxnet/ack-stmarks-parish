const { Router } = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/', (req, res) => {
  const departments = db.prepare('SELECT * FROM departments ORDER BY name').all();
  res.json(departments);
});

router.post('/join', authenticate, (req, res) => {
  const { department } = req.body;
  if (!department) {
    return res.status(400).json({ error: 'Department name is required' });
  }

  const dept = db.prepare('SELECT id FROM departments WHERE name = ?').get(department);
  if (!dept) {
    return res.status(404).json({ error: 'Department not found' });
  }

  db.prepare('UPDATE members SET department = ? WHERE id = ?').run(department, req.memberId);
  res.json({ success: true, department });
});

module.exports = router;
