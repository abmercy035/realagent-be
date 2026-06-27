/**
	* JWT Utility Functions
	* Generate and verify JSON Web Tokens
	*
	* MIGRATION (2026-06-26): Added dual-token support (access + refresh)
	* matching the frontend's token system. Old single-token functions
	* preserved for backward compatibility with existing controllers.
	*/

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'your-refresh-secret-change-in-production';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ---------------------------------------------------------------------------
// Legacy single-token functions (preserved for backward compatibility)
// ---------------------------------------------------------------------------

/**
	* Generate JWT token for a user (LEGACY — single token, 7d expiry)
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
	* Verify JWT token (LEGACY)
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
	* Generate refresh token (LEGACY — single secret, 30d expiry)
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

// ---------------------------------------------------------------------------
// NEW dual-token functions (migrated from frontend tokens.service.ts)
// ---------------------------------------------------------------------------

/**
	* Signs a fresh access + refresh token pair for the given user.
	* Uses separate secrets for access and refresh tokens.
	*
	* @param {Object} input
	* @param {string} input.userId
	* @param {string} input.globalRole
	* @param {number} input.tokenVersion
	* @returns {{ accessToken: string, refreshToken: string }}
	*/
const issueTokenPair = (input) => {
	const accessToken = jwt.sign(
		{ sub: input.userId, globalRole: input.globalRole, tokenVersion: input.tokenVersion },
		JWT_ACCESS_SECRET,
		{ expiresIn: ACCESS_TOKEN_TTL_SECONDS },
	);

	const refreshToken = jwt.sign(
		{ sub: input.userId, tokenVersion: input.tokenVersion },
		JWT_REFRESH_SECRET,
		{ expiresIn: REFRESH_TOKEN_TTL_SECONDS },
	);

	return { accessToken, refreshToken };
};

/**
	* Verifies an access token and returns the decoded claims.
	* Does NOT check tokenVersion against DB — callers that need
	* revocation checking must do that separately.
	*
	* @param {string} token
	* @returns {{ sub: string, globalRole: string, tokenVersion: number }}
	*/
const verifyAccessToken = (token) => {
	return jwt.verify(token, JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
};

/**
	* Verifies a refresh token and returns the decoded claims.
	*
	* @param {string} token
	* @returns {{ sub: string, tokenVersion: number }}
	*/
const verifyRefreshToken = (token) => {
	return jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
};

module.exports = {
	// Legacy (backward compatible)
	generateToken,
	verifyToken,
	decodeToken,
	generateRefreshToken,
	// New dual-token system
	issueTokenPair,
	verifyAccessToken,
	verifyRefreshToken,
	ACCESS_TOKEN_TTL_SECONDS,
	REFRESH_TOKEN_TTL_SECONDS,
};
