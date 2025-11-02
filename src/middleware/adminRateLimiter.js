const rateLimit = require('express-rate-limit');

// Slightly stricter limits for admin endpoints
const adminLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX, 10) || 50, // max requests per window
	message: { status: 'error', message: 'Too many admin requests, please try again later.' },
});

module.exports = adminLimiter;
