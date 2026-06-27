/**
	* Authentication Middleware
	* Verify JWT tokens and attach user to request
	*
	* MIGRATION (2026-06-26): Added new-auth middleware that reads from
	* the dual-token cookie system (campusagent_access_token). Legacy
	* cookie/header auth preserved for backward compatibility.
	*/

const { verifyToken, verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

// ---------------------------------------------------------------------------
// Cookie names (matching frontend tokens.service.ts)
// ---------------------------------------------------------------------------
const ACCESS_TOKEN_COOKIE = 'campusagent_access_token';
const REFRESH_TOKEN_COOKIE = 'campusagent_refresh_token';
const SESSION_INDICATOR_COOKIE = 'campusagent_session';

/**
	* Middleware to verify JWT token and attach user to request (LEGACY)
	* Checks cookies ('token') first, then Authorization header.
	*/
const auth = async (req, res, next) => {
	try {
		let token;
		let isNewToken = false;

		// First, check for new token in cookies (preferred method)
		if (req.cookies && req.cookies[ACCESS_TOKEN_COOKIE]) {
			token = req.cookies[ACCESS_TOKEN_COOKIE];
			isNewToken = true;
		}
		// Fallback to legacy cookie
		else if (req.cookies && req.cookies.token) {
			token = req.cookies.token;
			isNewToken = false;
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

		let userId;
		let claims;

		if (isNewToken) {
			try {
				claims = verifyAccessToken(token);
				userId = claims.sub;
			} catch (err) {
				return res.status(401).json({
					status: 'error',
					message: 'Session expired. Please log in again.',
				});
			}
		} else {
			try {
				// Try new verifyAccessToken first
				claims = verifyAccessToken(token);
				userId = claims.sub;
			} catch (err) {
				// Fallback to legacy token verification
				try {
					const decoded = verifyToken(token);
					userId = decoded.userId;
				} catch (legacyErr) {
					return res.status(401).json({
						status: 'error',
						message: 'Invalid or expired token',
					});
				}
			}
		}

		if (!userId) {
			return res.status(401).json({
				status: 'error',
				message: 'Invalid token payload',
			});
		}

		// Find user
		const user = await User.findById(userId);

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
		if (claims && claims.sub) {
			req.tokenClaims = claims;
		}
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
 * NEW auth middleware — reads the dual-token cookie (campusagent_access_token),
 * verifies it with the ACCESS secret, and attaches user to req.user.
 *
 * This is the middleware that migrated frontend routes (Google OAuth callback,
 * refresh, push subscribe, market reviews, etc.) will use.
 */
const authNew = async (req, res, next) => {
	try {
		let token = req.cookies?.[ACCESS_TOKEN_COOKIE];

		// Fallback to Authorization header (Bearer token)
		if (!token) {
			const authHeader = req.headers.authorization;
			if (authHeader && authHeader.startsWith('Bearer ')) {
				token = authHeader.split(' ')[1];
			}
		}

		if (!token) {
			return res.status(401).json({
				status: 'error',
				message: 'Authentication required.',
			});
		}

		let claims;
		try {
			claims = verifyAccessToken(token);
		} catch {
			return res.status(401).json({
				status: 'error',
				message: 'Session expired. Please log in again.',
			});
		}

		if (!claims.sub) {
			return res.status(401).json({
				status: 'error',
				message: 'Invalid token.',
			});
		}

		const user = await User.findById(claims.sub);
		if (!user || user.status !== 'active') {
			return res.status(401).json({
				status: 'error',
				message: 'Account not found or inactive.',
			});
		}

		req.user = user;
		req.tokenClaims = claims;
		next();
	} catch (error) {
		console.error('New auth error:', error);
		return res.status(401).json({
			status: 'error',
			message: 'Authentication failed.',
		});
	}
};

/**
	* Optional variant of new auth — doesn't fail if no token is present.
	*/
const authNewOptional = async (req, res, next) => {
	try {
		let token = req.cookies?.[ACCESS_TOKEN_COOKIE];

		// Fallback to Authorization header (Bearer token)
		if (!token) {
			const authHeader = req.headers.authorization;
			if (authHeader && authHeader.startsWith('Bearer ')) {
				token = authHeader.split(' ')[1];
			}
		}

		if (!token) {
			req.user = null;
			return next();
		}

		let claims;
		try {
			claims = verifyAccessToken(token);
		} catch {
			req.user = null;
			return next();
		}

		if (!claims.sub) {
			req.user = null;
			return next();
		}

		const user = await User.findById(claims.sub);
		req.user = user || null;
		req.tokenClaims = user ? claims : null;
		next();
	} catch {
		req.user = null;
		next();
	}
};

/**
	* Optional auth - doesn't fail if no token provided (LEGACY)
	* Useful for routes that work differently for authenticated users
	*/
const optionalAuth = async (req, res, next) => {
	try {
		let token;
		let isNewToken = false;

		// Check for token in cookies first (new token prioritized, then legacy)
		if (req.cookies && req.cookies[ACCESS_TOKEN_COOKIE]) {
			token = req.cookies[ACCESS_TOKEN_COOKIE];
			isNewToken = true;
		} else if (req.cookies && req.cookies.token) {
			token = req.cookies.token;
			isNewToken = false;
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

		let userId;
		let claims;

		if (isNewToken) {
			try {
				claims = verifyAccessToken(token);
				userId = claims.sub;
			} catch (err) {
				req.user = null;
				return next();
			}
		} else {
			try {
				claims = verifyAccessToken(token);
				userId = claims.sub;
			} catch (err) {
				try {
					const decoded = verifyToken(token);
					userId = decoded.userId;
				} catch (legacyErr) {
					req.user = null;
					return next();
				}
			}
		}

		const user = await User.findById(userId);

		req.user = user || null;
		if (user && claims && claims.sub) {
			req.tokenClaims = claims;
		}
		next();
	} catch (error) {
		req.user = null;
		next();
	}
};

module.exports = {
	auth,
	optionalAuth,
	// New dual-token auth
	authNew,
	authNewOptional,
	ACCESS_TOKEN_COOKIE,
	REFRESH_TOKEN_COOKIE,
	SESSION_INDICATOR_COOKIE,
};
