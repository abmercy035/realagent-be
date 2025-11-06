const { rateLimit } = require('express-rate-limit');

/**
	* Rate limiter for login attempts
	* Prevents brute force attacks
	*/
const loginLimiter = rateLimit({
	windowMs: 2 * 60 * 1000, // 2 minutes
	max: 5, // 5 attempts per window
	message: {
		status: 'error',
		message: 'Too many login attempts. Please try again in 2 minutes.',
		code: 'RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
	// Use IP + endpoint as key
	skipSuccessfulRequests: false,
});

/**
	* Rate limiter for registration
	* Prevents spam account creation
	*/
const registerLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 3, // 3 registrations per window
	message: {
		status: 'error',
		message: 'Too many registration attempts. Please try again in 30 minutes.',
		code: 'RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
});

/**
	* Rate limiter for password reset requests
	* Prevents email flooding
	*/
const passwordResetLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 3, // 3 reset requests per window
	message: {
		status: 'error',
		message: 'Too many password reset requests. Please try again in 30 minutes.',
		code: 'RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
});

/**
	* General auth limiter for other auth operations
	*/
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 20, // 20 requests per window
	message: {
		status: 'error',
		message: 'Too many authentication requests. Please try again later.',
		code: 'RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
});

module.exports = {
	loginLimiter,
	registerLimiter,
	passwordResetLimiter,
	authLimiter,
};
