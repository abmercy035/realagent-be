/**
	* Fraud Report Routes
	* Handles public fraud reporting
	*/

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { submitFraudReport, getFraudReportStatus } = require('../controllers/fraudReportController');

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

/**
	* @route   POST /api/reports/fraud
	* @desc    Submit a fraud report
	* @access  Public
	*/
router.post('/', upload.array('evidence', 5), submitFraudReport);

/**
	* @route   GET /api/reports/fraud/:reportId
	* @desc    Get fraud report status
	* @access  Public (with report ID)
	*/
router.get('/:reportId', getFraudReportStatus);

module.exports = router;
