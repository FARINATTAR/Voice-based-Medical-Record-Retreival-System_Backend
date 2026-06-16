import express from 'express';
import AuditLog from '../models/AuditLog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { verifyChain } from '../utils/audit.js';

const router = express.Router();

// List recent audit-chain blocks. Hospital admins see their hospital's
// activity; doctors see their own actions.
router.get('/', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const filter = {};
    if (req.user.role === 'hospital') {
      filter.$or = [{ hospitalId: req.user.hospitalId }, { actorId: req.user.id }];
    } else {
      filter.actorId = req.user.id;
    }

    const logs = await AuditLog.find(filter)
      .sort({ index: -1 })
      .limit(Math.min(parseInt(limit, 10) || 100, 500))
      .lean();

    res.json({ count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify the integrity of the whole audit hash chain. Returns whether any
// block was tampered with and where the chain first breaks.
router.get('/verify', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
  try {
    const result = await verifyChain();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Chain statistics for the dashboard.
router.get('/stats', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
  try {
    const total = await AuditLog.countDocuments();
    const byAction = await AuditLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const latest = await AuditLog.findOne().sort({ index: -1 }).lean();
    res.json({ total, byAction, latestHash: latest?.hash || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
