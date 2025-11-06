const { rateLimit } = require('express-rate-limit');

/**
	* Rate limiter for comment creation
	* Prevents comment spam and abuse
	*/
const commentCreateLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 10, // 10 comments per window
	message: {
		status: 'error',
		message: 'Too many comments. Please try again in 30 minutes.',
		code: 'COMMENT_RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
	// Key by user ID if authenticated, otherwise IP (with proper IPv6 handling)
	keyGenerator: (req, res) => {
		// Use user ID for authenticated requests
		if (req.user?.id) {
			return req.user.id;
		}
		// Fallback to IP - no need to manually call ipKeyGenerator
		// express-rate-limit will handle it automatically
		return req.ip;
	},
});

/**
	* Rate limiter for comment updates
	*/
const commentUpdateLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 20, // 20 comment edits per window
	message: {
		status: 'error',
		message: 'Too many comment updates. Please try again in 30 minutes.',
		code: 'COMMENT_UPDATE_RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req, res) => {
		// Use user ID for authenticated requests
		if (req.user?.id) {
			return req.user.id;
		}
		// Fallback to IP - no need to manually call ipKeyGenerator
		// express-rate-limit will handle it automatically
		return req.ip;
	},
});

module.exports = {
	commentCreateLimiter,
	commentUpdateLimiter,
};
