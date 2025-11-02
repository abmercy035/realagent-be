const express = require('express');
const router = express.Router();
const { listUsers, getUser, updateUser, analytics, triggerVerificationEmail, listContacts, deleteUser } = require('../controllers/adminController');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const adminLimiter = require('../middleware/adminRateLimiter');

// Users management
// Apply admin limiter to all routes in this router
router.use(adminLimiter);

router.get('/users', auth, requireAdmin, listUsers);
router.get('/users/:id', auth, requireAdmin, getUser);
router.patch('/users/:id', auth, requireAdmin, updateUser);
router.post('/users/:id/trigger-verification', auth, requireAdmin, triggerVerificationEmail);
router.delete('/users/:id', auth, requireAdmin, deleteUser);

// Basic analytics
router.get('/analytics', auth, requireAdmin, analytics);
// Detailed metrics endpoint: /api/admin/analytics/metrics?metric=users&from=...&to=...&groupBy=day
router.get('/analytics/metrics', auth, requireAdmin, require('../controllers/adminController').analyticsMetric);
// Contacts listing & export (admin)
router.get('/contacts', auth, requireAdmin, listContacts);

module.exports = router;
