/**
	* Agent Verification Middleware
	* Check if agent has been verified before allowing certain actions
	*/

const AgentVerification = require('../models/AgentVerification');

/**
	* Middleware to require agent to be verified
	* Blocks unverified agents from accessing protected routes
	*/
const requireVerifiedAgent = async (req, res, next) => {
	try {
		// Check if user is authenticated
		if (!req.user) {
			return res.status(401).json({
				status: 'error',
				message: 'Authentication required',
			});
		}

		// Check if user is an agent
		if (req.user.role !== 'agent') {
			return res.status(403).json({
				status: 'error',
				message: 'Only agents can access this resource',
			});
		}

		// Check verification status
		const verification = await AgentVerification.findOne({
			agentId: req.user._id,
			status: 'approved',
		});

		if (!verification) {
			return res.status(403).json({
				status: 'error',
				message: 'Agent verification required',
				code: 'AGENT_NOT_VERIFIED',
				hint: 'Please complete the verification process before creating listings',
			});
		}

		// Attach verification to request for use in controllers
		req.agentVerification = verification;
		next();
	} catch (error) {
		console.error('Verification check error:', error);
		return res.status(500).json({
			status: 'error',
			message: 'Failed to verify agent status',
		});
	}
};

/**
	* Middleware to check verification status (doesn't block)
	* Adds verification info to request but allows unverified agents
	*/
const checkVerificationStatus = async (req, res, next) => {
	try {
		if (!req.user || req.user.role !== 'agent') {
			req.isVerified = false;
			req.agentVerification = null;
			return next();
		}

		const verification = await AgentVerification.findOne({
			agentId: req.user._id,
		}).sort({ createdAt: -1 });

		req.isVerified = verification?.status === 'approved';
		req.agentVerification = verification || null;
		next();
	} catch (error) {
		console.error('Verification status check error:', error);
		req.isVerified = false;
		req.agentVerification = null;
		next();
	}
};

/**
	* Middleware to prevent already verified agents from resubmitting
	*/
const preventDuplicateVerification = async (req, res, next) => {
	try {
		if (!req.user) {
			return res.status(401).json({
				status: 'error',
				message: 'Authentication required',
			});
		}
console.log(req.body)
		// Check for existing approved verification
		const existingVerification = await AgentVerification.findOne({
			agentId: req.user._id,
			status: 'approved',
		});

		if (existingVerification) {
			return res.status(400).json({
				status: 'error',
				message: 'Agent already verified',
				code: 'ALREADY_VERIFIED',
			});
		}

		// Check for pending verification
		const pendingVerification = await AgentVerification.findOne({
			agentId: req.user._id,
			status: 'pending',
		});

		if (pendingVerification) {
			return res.status(400).json({
				status: 'error',
				message: 'Sorry you have a pending Verification request review',
				code: 'PENDING_VERIFICATION',
				data: {
					submittedAt: pendingVerification.createdAt,
				},
			});
		}

		next();
	} catch (error) {
		console.error('Duplicate verification check error:', error);
		return res.status(500).json({
			status: 'error',
			message: 'Failed to check verification status',
		});
	}
};

module.exports = {
	requireVerifiedAgent,
	checkVerificationStatus,
	preventDuplicateVerification,
};
