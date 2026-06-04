const { Router } = require('express');
const db = require('../database');

const router = Router();

router.get('/', (req, res) => {
  const { department } = req.query;
  let announcements;
  if (department) {
    announcements = db.prepare(`
      SELECT * FROM announcements WHERE department = ? OR department = '' ORDER BY created_at DESC
    `).all(department);
  } else {
    announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  }
  res.json(announcements);
});

module.exports = router;
