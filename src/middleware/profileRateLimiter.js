const { rateLimit } = require('express-rate-limit');

/**
	* Rate limiter for profile updates
	* Prevents excessive profile modification
	*/
const profileUpdateLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // 5 profile updates per hour
	message: {
		status: 'error',
		message: 'Too many profile updates. Please try again in 1 hour.',
		code: 'PROFILE_RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
	// Key by user ID if authenticated, otherwise use IP (with proper IPv6 handling)
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

module.exports = profileUpdateLimiter;
