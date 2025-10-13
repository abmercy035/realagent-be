/**
	* Verification Routes
	* Routes for agent verification submission and admin review
	*/

const express = require('express');
const router = express.Router();
const {
	submitVerification,
	getVerificationStatus,
	getPendingVerifications,
	getVerificationById,
	approveVerification,
	rejectVerification,
	getVerificationStats,
	uploadVerificationDocument,
} = require('../controllers/verificationController');
const { auth } = require('../middleware/auth');
const { requireRole, requireAdmin } = require('../middleware/roleCheck');
const { preventDuplicateVerification } = require('../middleware/verificationCheck');

// ===========================
// AGENT ROUTES
// ===========================

/**
	* POST /api/agents/verify
	* Submit verification documents
	*/
router.post(
	'/verify',
	auth,
	requireRole('agent'),
	preventDuplicateVerification,
	submitVerification
);

/**
	* GET /api/agents/verify/status
	* Get agent's verification status
	*/
router.get('/verify/status', auth, requireRole('agent'), getVerificationStatus);

/**
	* POST /api/agents/verify/upload
	* Upload verification document
	*/
router.post('/verify/upload', auth, requireRole('agent'), uploadVerificationDocument);

// ===========================
// ADMIN ROUTES
// ===========================

/**
	* GET /api/admin/verifications
	* Get all verifications (with filters)
	*/
router.get('/verifications', auth, requireAdmin, getPendingVerifications);

/**
	* GET /api/admin/verifications/stats
	* Get verification statistics
	*/
router.get('/verifications/stats', auth, requireAdmin, getVerificationStats);

/**
	* GET /api/admin/verifications/:id
	* Get specific verification details
	*/
router.get('/verifications/:id', auth, requireAdmin, getVerificationById);

/**
	* PATCH /api/admin/verifications/:id/approve
	* Approve verification
	*/
router.patch('/verifications/:id/approve', auth, requireAdmin, approveVerification);

/**
	* PATCH /api/admin/verifications/:id/reject
	* Reject verification
	*/
router.patch('/verifications/:id/reject', auth, requireAdmin, rejectVerification);

module.exports = router;
