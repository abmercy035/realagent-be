/**
	* Admin Role-Based Access Control Middleware
	* Enforces permissions based on admin hierarchy: basic, mid, super
	*/

/**
	* Check if user has required admin role level
	* @param {String|Array} requiredRoles - Required admin role(s): 'basic', 'mid', 'super', or array of roles
	* @returns {Function} Express middleware
	*/
const requireAdminRole = (requiredRoles) => {
	return (req, res, next) => {
		// Ensure user is authenticated
		if (!req.user) {
			return res.status(401).json({
				status: 'error',
				message: 'Authentication required',
			});
		}

		// Ensure user is an admin
		if (req.user.role !== 'admin') {
			return res.status(403).json({
				status: 'error',
				message: 'Admin access required',
			});
		}

		// If no adminRole is set, deny access (all admins must have a role level)
		if (!req.user.adminRole) {
			return res.status(403).json({
				status: 'error',
				message: 'Admin role level not assigned. Contact super admin.',
			});
		}

		// Super admins have access to everything
		if (req.user.adminRole === 'super') {
			return next();
		}

		// Convert single role to array for easier checking
		const allowedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

		// Check if user's admin role is in the allowed roles
		if (allowedRoles.includes(req.user.adminRole)) {
			return next();
		}

		// Access denied
		return res.status(403).json({
			status: 'error',
			message: 'Insufficient admin permissions',
			requiredRole: requiredRoles,
			currentRole: req.user.adminRole,
		});
	};
};

/**
	* Admin permission levels and their capabilities
	*/
const ADMIN_PERMISSIONS = {
	basic: [
		'view_reports',
		'view_contacts',
		'view_analytics',
		'reply_contact',
		'escalate_report', // Push to mid/super admin
		'send_user_mail',
		'send_promotional_mail',
	],
	mid: [
		'view_reports',
		'view_contacts',
		'view_analytics',
		'reply_contact',
		'escalate_report',
		'send_user_mail',
		'send_promotional_mail',
		'approve_agent',
		'reject_agent',
		'demote_agent', // Change agent to user
		'promote_user_to_agent', // Make user an agent
		'suspend_agent',
		'unsuspend_agent',
		'unverify_agent',
		'view_verifications',
		'manage_properties',
		'send_all_mail_types',
	],
	super: [
		'view_reports',
		'view_contacts',
		'view_analytics',
		'reply_contact',
		'escalate_report',
		'send_user_mail',
		'send_promotional_mail',
		'approve_agent',
		'reject_agent',
		'demote_agent',
		'promote_user_to_agent',
		'suspend_agent',
		'unsuspend_agent',
		'unverify_agent',
		'view_verifications',
		'manage_properties',
		'send_all_mail_types',
		'promote_to_admin', // Make user/agent an admin
		'change_admin_role', // Change admin level (basic/mid)
		'demote_admin', // Remove admin privileges
		'manage_admins',
		'manage_users', // General user management
		'view_all_users',
		'delete_user',
		'system_settings',
	],
};

/**
	* Check if user has specific permission
	* @param {String} permission - Permission to check
	* @returns {Function} Express middleware
	*/
const requirePermission = (permission) => {
	return (req, res, next) => {
		// Ensure user is authenticated and is admin
		if (!req.user || req.user.role !== 'admin') {
			return res.status(403).json({
				status: 'error',
				message: 'Admin access required',
			});
		}

		// Check if user's admin role has the required permission
		const userPermissions = ADMIN_PERMISSIONS[req.user.adminRole] || [];

		if (userPermissions.includes(permission)) {
			return next();
		}

		return res.status(403).json({
			status: 'error',
			message: 'Insufficient permissions',
			requiredPermission: permission,
			adminRole: req.user.adminRole,
		});
	};
};

/**
	* Get permissions for current admin user
	* @param {Object} req - Express request object
	* @returns {Array} Array of permissions
	*/
const getAdminPermissions = (req) => {
	if (!req.user || req.user.role !== 'admin') {
		return [];
	}
	return ADMIN_PERMISSIONS[req.user.adminRole] || [];
};

module.exports = {
	requireAdminRole,
	requirePermission,
	getAdminPermissions,
	ADMIN_PERMISSIONS,
};
