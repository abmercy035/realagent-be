/**
	* JWT Utility Functions
	* Generate and verify JSON Web Tokens
	*/

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
	* Generate JWT token for a user
	* @param {Object} user - User object
	* @returns {String} JWT token
	*/
const generateToken = (user) => {
	const payload = {
		userId: user._id,
		email: user.email,
		role: user.role,
	};

	return jwt.sign(payload, JWT_SECRET, {
		expiresIn: JWT_EXPIRES_IN,
	});
};

/**
	* Verify JWT token
	* @param {String} token - JWT token
	* @returns {Object} Decoded payload
	*/
const verifyToken = (token) => {
	try {
		return jwt.verify(token, JWT_SECRET);
	} catch (error) {
		throw new Error('Invalid or expired token');
	}
};

/**
	* Decode token without verification (for debugging)
	* @param {String} token - JWT token
	* @returns {Object} Decoded payload
	*/
const decodeToken = (token) => {
	return jwt.decode(token);
};

/**
	* Generate refresh token (longer expiry)
	* @param {Object} user - User object
	* @returns {String} Refresh token
	*/
const generateRefreshToken = (user) => {
	const payload = {
		userId: user._id,
		type: 'refresh',
	};

	return jwt.sign(payload, JWT_SECRET, {
		expiresIn: '30d',
	});
};

module.exports = {
	generateToken,
	verifyToken,
	decodeToken,
	generateRefreshToken,
};
