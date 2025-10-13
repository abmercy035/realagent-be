/**
	* Fraud Controller
	* Handles fraud reporting and admin fraud management
	*/

const FraudFlag = require('../models/FraudFlag');
const User = require('../models/User');

/**
	* @route   POST /api/reports/fraud
	* @desc    Report suspicious activity or fraud
	* @access  Private (Authenticated users)
	*/
const reportFraud = async (req, res) => {
	try {
		const {
			flaggedUserId,
			fraudType,
			reason,
			description,
			evidence,
			relatedPropertyId,
		} = req.body;

		// Validate required fields
		if (!flaggedUserId || !fraudType || !reason) {
			return res.status(400).json({
				status: 'error',
				message: 'Flagged user, fraud type, and reason are required',
			});
		}

		// Check if flagged user exists
		const flaggedUser = await User.findById(flaggedUserId);
		if (!flaggedUser) {
			return res.status(404).json({
				status: 'error',
				message: 'Flagged user not found',
			});
		}

		// Prevent self-reporting
		if (flaggedUserId === req.user._id.toString()) {
			return res.status(400).json({
				status: 'error',
				message: 'You cannot report yourself',
			});
		}

		// Create fraud flag
		const fraudFlag = new FraudFlag({
			flaggedUserId,
			reportedBy: req.user._id,
			reporterType: 'user',
			fraudType,
			reason,
			description,
			evidence: evidence || [],
			relatedPropertyId,
			severity: 'medium', // Default severity, can be updated by admin
		});

		await fraudFlag.save();

		// TODO: Send notification to admin
		// TODO: Auto-check for patterns (multiple reports, etc.)

		res.status(201).json({
			status: 'success',
			message: 'Fraud report submitted successfully. Our team will review it.',
			data: {
				report: fraudFlag.toPublicData(),
			},
		});
	} catch (error) {
		console.error('Report fraud error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to submit fraud report',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/reports/fraud/my-reports
	* @desc    Get user's submitted fraud reports
	* @access  Private
	*/
const getMyReports = async (req, res) => {
	try {
		const reports = await FraudFlag.find({ reportedBy: req.user._id })
			.populate('flaggedUserId', 'name email role')
			.sort({ createdAt: -1 })
			.limit(50);

		res.status(200).json({
			status: 'success',
			data: {
				reports: reports.map((r) => ({
					...r.toPublicData(),
					flaggedUser: r.flaggedUserId,
				})),
			},
		});
	} catch (error) {
		console.error('Get my reports error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch reports',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/admin/fraud
	* @desc    Get all fraud flags (with filters)
	* @access  Private (Admin only)
	*/
const getAllFraudFlags = async (req, res) => {
	try {
		const {
			status = 'pending',
			fraudType,
			severity,
			limit = 50,
			page = 1,
		} = req.query;

		const query = {};
		if (status && status !== 'all') query.status = status;
		if (fraudType) query.fraudType = fraudType;
		if (severity) query.severity = severity;

		const skip = (parseInt(page) - 1) * parseInt(limit);

		const [flags, total] = await Promise.all([
			FraudFlag.find(query)
				.populate('flaggedUserId', 'name email role phone status')
				.populate('reportedBy', 'name email')
				.populate('reviewedBy', 'name email')
				.sort({ severity: -1, createdAt: 1 })
				.skip(skip)
				.limit(parseInt(limit)),
			FraudFlag.countDocuments(query),
		]);

		res.status(200).json({
			status: 'success',
			data: {
				flags: flags.map((f) => f.toAdminData()),
				pagination: {
					total,
					page: parseInt(page),
					limit: parseInt(limit),
					pages: Math.ceil(total / parseInt(limit)),
				},
			},
		});
	} catch (error) {
		console.error('Get fraud flags error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch fraud flags',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/admin/fraud/:id
	* @desc    Get specific fraud flag details
	* @access  Private (Admin only)
	*/
const getFraudFlagById = async (req, res) => {
	try {
		const { id } = req.params;

		const flag = await FraudFlag.findById(id)
			.populate('flaggedUserId', 'name email role phone status createdAt')
			.populate('reportedBy', 'name email')
			.populate('reviewedBy', 'name email');

		if (!flag) {
			return res.status(404).json({
				status: 'error',
				message: 'Fraud flag not found',
			});
		}

		res.status(200).json({
			status: 'success',
			data: {
				flag: flag.toAdminData(),
			},
		});
	} catch (error) {
		console.error('Get fraud flag by ID error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch fraud flag',
			error: error.message,
		});
	}
};

/**
	* @route   PATCH /api/admin/fraud/:id/review
	* @desc    Start reviewing a fraud flag
	* @access  Private (Admin only)
	*/
const startReview = async (req, res) => {
	try {
		const { id } = req.params;

		const flag = await FraudFlag.findById(id);
		if (!flag) {
			return res.status(404).json({
				status: 'error',
				message: 'Fraud flag not found',
			});
		}

		await flag.startReview(req.user._id);

		res.status(200).json({
			status: 'success',
			message: 'Review started',
			data: {
				flag: flag.toAdminData(),
			},
		});
	} catch (error) {
		console.error('Start review error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to start review',
			error: error.message,
		});
	}
};

/**
	* @route   PATCH /api/admin/fraud/:id/resolve
	* @desc    Resolve fraud flag with action
	* @access  Private (Admin only)
	*/
const resolveFraudFlag = async (req, res) => {
	try {
		const { id } = req.params;
		const { action, notes } = req.body;

		if (!action) {
			return res.status(400).json({
				status: 'error',
				message: 'Action is required',
			});
		}

		const flag = await FraudFlag.findById(id).populate(
			'flaggedUserId',
			'name email'
		);

		if (!flag) {
			return res.status(404).json({
				status: 'error',
				message: 'Fraud flag not found',
			});
		}

		// Take action on the user
		if (action !== 'none') {
			const user = await User.findById(flag.flaggedUserId);
			if (user) {
				switch (action) {
					case 'warning':
						// Just log the warning, user remains active
						break;
					case 'suspended':
						user.status = 'suspended';
						user.suspensionReason = notes || 'Fraud detected';
						await user.save();
						break;
					case 'banned':
						user.status = 'banned';
						user.suspensionReason = notes || 'Banned for fraud';
						await user.save();
						break;
					default:
						break;
				}
			}
		}

		// Resolve the flag
		await flag.resolve(req.user._id, action, notes);

		// TODO: Send notification to flagged user
		// TODO: Send notification to reporter

		res.status(200).json({
			status: 'success',
			message: 'Fraud flag resolved',
			data: {
				flag: flag.toAdminData(),
			},
		});
	} catch (error) {
		console.error('Resolve fraud flag error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to resolve fraud flag',
			error: error.message,
		});
	}
};

/**
	* @route   PATCH /api/admin/fraud/:id/dismiss
	* @desc    Dismiss fraud flag (false report)
	* @access  Private (Admin only)
	*/
const dismissFraudFlag = async (req, res) => {
	try {
		const { id } = req.params;
		const { reason } = req.body;

		if (!reason) {
			return res.status(400).json({
				status: 'error',
				message: 'Dismissal reason is required',
			});
		}

		const flag = await FraudFlag.findById(id);
		if (!flag) {
			return res.status(404).json({
				status: 'error',
				message: 'Fraud flag not found',
			});
		}

		await flag.dismiss(req.user._id, reason);

		res.status(200).json({
			status: 'success',
			message: 'Fraud flag dismissed',
			data: {
				flag: flag.toAdminData(),
			},
		});
	} catch (error) {
		console.error('Dismiss fraud flag error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to dismiss fraud flag',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/admin/fraud/stats
	* @desc    Get fraud statistics
	* @access  Private (Admin only)
	*/
const getFraudStats = async (req, res) => {
	try {
		const stats = await FraudFlag.getStats();

		res.status(200).json({
			status: 'success',
			data: {
				stats,
			},
		});
	} catch (error) {
		console.error('Get fraud stats error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch statistics',
			error: error.message,
		});
	}
};

/**
	* @route   PATCH /api/admin/fraud/:id/severity
	* @desc    Update fraud flag severity
	* @access  Private (Admin only)
	*/
const updateSeverity = async (req, res) => {
	try {
		const { id } = req.params;
		const { severity } = req.body;

		if (!severity) {
			return res.status(400).json({
				status: 'error',
				message: 'Severity is required',
			});
		}

		const flag = await FraudFlag.findById(id);
		if (!flag) {
			return res.status(404).json({
				status: 'error',
				message: 'Fraud flag not found',
			});
		}

		flag.severity = severity;
		await flag.save();

		res.status(200).json({
			status: 'success',
			message: 'Severity updated',
			data: {
				flag: flag.toAdminData(),
			},
		});
	} catch (error) {
		console.error('Update severity error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to update severity',
			error: error.message,
		});
	}
};

module.exports = {
	reportFraud,
	getMyReports,
	getAllFraudFlags,
	getFraudFlagById,
	startReview,
	resolveFraudFlag,
	dismissFraudFlag,
	getFraudStats,
	updateSeverity,
};
