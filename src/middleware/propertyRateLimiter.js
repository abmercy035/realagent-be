const { rateLimit } = require('express-rate-limit');

/**
	* Rate limiter for property creation
	* Prevents spam listings
	*/
const propertyCreateLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 5, // 5 property posts per window
	message: {
		status: 'error',
		message: 'Too many property listings. Please try again in 30 minutes.',
		code: 'PROPERTY_RATE_LIMIT_EXCEEDED',
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
	* Rate limiter for property updates
	* Prevents excessive update spam
	*/
const propertyUpdateLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 10, // 10 property updates per window
	message: {
		status: 'error',
		message: 'Too many property updates. Please try again in 30 minutes.',
		code: 'PROPERTY_UPDATE_RATE_LIMIT_EXCEEDED',
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
	propertyCreateLimiter,
	propertyUpdateLimiter,
};
