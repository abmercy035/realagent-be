const { rateLimit } = require('express-rate-limit');

/**
	* Rate limiter for media uploads
	* Prevents storage abuse and resource exhaustion
	*/
const uploadLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 30, // 30 upload requests per window
	message: {
		status: 'error',
		message: 'Too many upload requests. Please try again in 30 minutes.',
		code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
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

module.exports = uploadLimiter;
