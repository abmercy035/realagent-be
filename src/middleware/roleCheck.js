/**
	* Role-Based Access Control Middleware
	* Check if user has required role(s) to access a route
	*/

/**
	* Middleware to require specific role(s)
	* @param  {...String} roles - Allowed roles (e.g., 'admin', 'agent', 'user')
	* @returns {Function} Middleware function
	*/
const requireRole = (...roles) => {
	return (req, res, next) => {
		// Check if user is authenticated (should be called after auth middleware)
		if (!req.user) {
			return res.status(401).json({
				status: 'error',
				message: 'Authentication required',
			});
		}

		// Check if user has required role
		if (!roles.includes(req.user.role)) {
			return res.status(403).json({
				status: 'error',
				message: 'Insufficient permissions. Required role: ' + roles.join(' or '),
			});
		}

		next();
	};
};

/**
	* Middleware to require admin role
	*/
const requireAdmin = (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({
			status: 'error',
			message: 'Authentication required',
		});
	}

	if (req.user.role !== 'admin') {
		return res.status(403).json({
			status: 'error',
			message: 'Admin access required',
		});
	}

	next();
};

/**
	* Middleware to require agent role
	*/
const requireAgent = (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({
			status: 'error',
			message: 'Authentication required',
		});
	}

	if (req.user.role !== 'agent') {
		return res.status(403).json({
			status: 'error',
			message: 'Agent access required',
		});
	}

	next();
};

/**
	* Middleware to require agent or admin role
	*/
const requireAgentOrAdmin = (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({
			status: 'error',
			message: 'Authentication required',
		});
	}

	if (req.user.role !== 'agent' && req.user.role !== 'admin') {
		return res.status(403).json({
			status: 'error',
			message: 'Agent or Admin access required',
		});
	}

	next();
};

/**
	* Middleware to check if user is owner of resource or admin
	* @param {String} userIdField - Field name in req.params or req.body that contains the user ID to check
	*/
const requireOwnerOrAdmin = (userIdField = 'userId') => {
	return (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({
				status: 'error',
				message: 'Authentication required',
			});
		}

		const resourceUserId = req.params[userIdField] || req.body[userIdField];

		// Allow if admin or owner
		if (req.user.role === 'admin' || req.user._id.toString() === resourceUserId) {
			return next();
		}

		return res.status(403).json({
			status: 'error',
			message: 'You can only access your own resources',
		});
	};
};

module.exports = {
	requireRole,
	requireAdmin,
	requireAgent,
	requireAgentOrAdmin,
	requireOwnerOrAdmin,
};
