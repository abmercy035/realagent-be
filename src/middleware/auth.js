/**
	* Authentication Middleware
	* Verify JWT tokens and attach user to request
	*/

const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

/**
	* Middleware to verify JWT token and attach user to request
	*/
const auth = async (req, res, next) => {
	try {
		let token;

		// First, check for token in cookies (preferred method)
		if (req.cookies && req.cookies.token) {
			token = req.cookies.token;
		}
		// Fallback to Authorization header (Bearer token)
		else {
			const authHeader = req.headers.authorization;
			if (authHeader && authHeader.startsWith('Bearer ')) {
				token = authHeader.split(' ')[1];
			}
		}

		// If no token found in either location
		if (!token) {
			return res.status(401).json({
				status: 'error',
				message: 'No authentication token provided',
			});
		}

		// Verify token
		const decoded = verifyToken(token);

		// Find user
		const user = await User.findById(decoded.userId);

		if (!user) {
			return res.status(401).json({
				status: 'error',
				message: 'User not found',
			});
		}

		// Check if user is active
		if (user.status !== 'active') {
			return res.status(403).json({
				status: 'error',
				message: `Account is ${user.status}`,
			});
		}

		// Attach user to request
		req.user = user;
		next();
	} catch (error) {
		console.error('Authentication error:', error);
		return res.status(401).json({
			status: 'error',
			message: 'Invalid or expired token',
		});
	}
};

/**
	* Optional auth - doesn't fail if no token provided
	* Useful for routes that work differently for authenticated users
	*/
const optionalAuth = async (req, res, next) => {
	try {
		let token;

		// Check for token in cookies first
		if (req.cookies && req.cookies.token) {
			token = req.cookies.token;
		}
		// Fallback to Authorization header
		else {
			const authHeader = req.headers.authorization;
			if (authHeader && authHeader.startsWith('Bearer ')) {
				token = authHeader.split(' ')[1];
			}
		}

		// If no token, continue without user
		if (!token) {
			req.user = null;
			return next();
		}

		const decoded = verifyToken(token);
		const user = await User.findById(decoded.userId);

		req.user = user || null;
		next();
	} catch (error) {
		req.user = null;
		next();
	}
};

module.exports = {
	auth,
	optionalAuth,
};
