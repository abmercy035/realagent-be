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
		// Get token from header
		const authHeader = req.headers.authorization;

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({
				status: 'error',
				message: 'No authentication token provided',
			});
		}

		// Extract token
		const token = authHeader.split(' ')[1];

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
		const authHeader = req.headers.authorization;

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			req.user = null;
			return next();
		}

		const token = authHeader.split(' ')[1];
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
