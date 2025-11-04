const express = require('express');
const router = express.Router();
const {
	listUsers,
	getUser,
	updateUser,
	analytics,
	triggerVerificationEmail,
	listContacts,
	deleteUser,
	promoteToAdmin,
	changeAdminRole,
	demoteAdmin,
	promoteToAgent,
	demoteToUser,
	getMyPermissions,
} = require('../controllers/adminController');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const { requireAdminRole, requirePermission } = require('../middleware/adminRoleCheck');
const adminLimiter = require('../middleware/adminRateLimiter');

// Apply admin limiter to all routes in this router
router.use(adminLimiter);

// Get current admin's permissions
router.get('/permissions', auth, requireAdmin, getMyPermissions);

// Users management - Basic admin and above can view
router.get('/users', auth, requireAdmin, listUsers);
router.get('/users/:id', auth, requireAdmin, getUser);

// User updates - Mid admin and above
router.patch('/users/:id', auth, requireAdmin, requirePermission('manage_users'), updateUser);
router.post('/users/:id/trigger-verification', auth, requireAdmin, triggerVerificationEmail);

// User deletion - Super admin only
router.delete('/users/:id', auth, requireAdmin, requirePermission('delete_user'), deleteUser);

// Admin role management - Super admin only
router.post('/users/:id/promote-to-admin', auth, requireAdmin, requirePermission('promote_to_admin'), promoteToAdmin);
router.put('/users/:id/admin-role', auth, requireAdmin, requirePermission('change_admin_role'), changeAdminRole);
router.post('/users/:id/demote-admin', auth, requireAdmin, requirePermission('demote_admin'), demoteAdmin);

// User/Agent role changes - Mid admin and above
router.post('/users/:id/promote-to-agent', auth, requireAdmin, requirePermission('promote_user_to_agent'), promoteToAgent);
router.post('/users/:id/demote-to-user', auth, requireAdmin, requirePermission('demote_agent'), demoteToUser);

// Basic analytics - All admins
router.get('/analytics', auth, requireAdmin, analytics);
router.get('/analytics/metrics', auth, requireAdmin, require('../controllers/adminController').analyticsMetric);

// Contacts listing - All admins
router.get('/contacts', auth, requireAdmin, listContacts);

module.exports = router;
