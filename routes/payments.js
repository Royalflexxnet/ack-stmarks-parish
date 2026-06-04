const { Router } = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const contributions = db.prepare(`
    SELECT * FROM contributions WHERE member_id = ? AND status = 1 ORDER BY date DESC
  `).all(req.memberId);
  res.json(contributions);
});

router.get('/summary', (req, res) => {
  const total = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM contributions WHERE member_id = ? AND status = 1
  `).get(req.memberId).total;

  const byType = db.prepare(`
    SELECT type, COALESCE(SUM(amount), 0) AS total FROM contributions
    WHERE member_id = ? AND status = 1 GROUP BY type
  `).all(req.memberId);

  res.json({ total, by_type: byType });
});

module.exports = router;
