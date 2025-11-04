const { canCreateProperty } = require('../utils/planUtils');

/**
	* Middleware to prevent agents from creating more properties than their plan allows.
	* Expects auth middleware to have set req.user (user document or id).
	*/
async function enforcePostLimit(req, res, next) {
	try {
		const user = req.user;
		if (!user) {
			return res.status(401).json({ success: false, message: 'Unauthorized' });
		}
		const result = await canCreateProperty(user);
		// controller will delete the newly created property if it causes the
		// total to exceed the allowed limit during grace (per product rule).
		if (!result.allowed) {
			return res.status(403).json({
				success: false,
				message: 'Property creation limit reached for your plan',
				reason: result.reason || 'limit_reached',
				current: result.current,
				limit: result.limit,
			});
		}

		// allowed -> proceed
		next();
	} catch (err) {
		// If something unexpected happened, allow the main controller to run but log the error.
		// Alternatively, you could block creation as a safer default. Here we block to be safe.
		console.error('Error in enforcePostLimit middleware:', err);
		return res.status(500).json({ success: false, message: 'Server error' });
	}
}

module.exports = {
	enforcePostLimit,
};
