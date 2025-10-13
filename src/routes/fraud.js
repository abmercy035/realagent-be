/**
	* Fraud Routes
	* Routes for fraud reporting and admin fraud management
	*/

const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
	reportFraud,
	getMyReports,
	getAllFraudFlags,
	getFraudFlagById,
	startReview,
	resolveFraudFlag,
	dismissFraudFlag,
	getFraudStats,
	updateSeverity,
} = require('../controllers/fraudController');
const { submitFraudReport, getFraudReportStatus } = require('../controllers/fraudReportController');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

// Configure multer for file uploads
const upload = multer({
	dest: 'uploads/',
	limits: {
		fileSize: 2 * 1024 * 1024, // 2MB per file
		files: 5, // Max 5 files
	},
	fileFilter: (req, file, cb) => {
		// Accept images and PDFs only
		if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
			cb(null, true);
		} else {
			cb(new Error('Only images and PDF files are allowed'));
		}
	},
});

// ===========================
// PUBLIC ROUTES (Fraud Reporting)
// ===========================

/**
	* POST /api/reports/fraud/public
	* Public fraud report submission (no auth required)
	*/
router.post('/fraud/public', upload.array('evidence', 5), submitFraudReport);

/**
	* GET /api/reports/fraud/public/:reportId
	* Get public fraud report status
	*/
router.get('/fraud/public/:reportId', getFraudReportStatus);

// ===========================
// USER ROUTES (Reporting)
// ===========================

/**
	* POST /api/reports/fraud
	* Report suspicious activity or fraud (authenticated users)
	*/
router.post('/fraud', auth, reportFraud);

/**
	* GET /api/reports/fraud/my-reports
	* Get user's submitted fraud reports
	*/
router.get('/fraud/my-reports', auth, getMyReports);

// ===========================
// ADMIN ROUTES (Management)
// ===========================

/**
	* GET /api/admin/fraud
	* Get all fraud flags (with filters)
	*/
router.get('/fraud', auth, requireAdmin, getAllFraudFlags);

/**
	* GET /api/admin/fraud/stats
	* Get fraud statistics
	*/
router.get('/fraud/stats', auth, requireAdmin, getFraudStats);

/**
	* GET /api/admin/fraud/:id
	* Get specific fraud flag details
	*/
router.get('/fraud/:id', auth, requireAdmin, getFraudFlagById);

/**
	* PATCH /api/admin/fraud/:id/review
	* Start reviewing a fraud flag
	*/
router.patch('/fraud/:id/review', auth, requireAdmin, startReview);

/**
	* PATCH /api/admin/fraud/:id/resolve
	* Resolve fraud flag with action
	*/
router.patch('/fraud/:id/resolve', auth, requireAdmin, resolveFraudFlag);

/**
	* PATCH /api/admin/fraud/:id/dismiss
	* Dismiss fraud flag
	*/
router.patch('/fraud/:id/dismiss', auth, requireAdmin, dismissFraudFlag);

/**
	* PATCH /api/admin/fraud/:id/severity
	* Update fraud flag severity
	*/
router.patch('/fraud/:id/severity', auth, requireAdmin, updateSeverity);

module.exports = router;
