const creditsConfig = require('../config/credits');

/**
	* Middleware to check if user has sufficient credits before creating content
	* @param {string} action - Type of action ('property' or 'item')
	*/
function requireCredits(action) {
	return async (req, res, next) => {
		try {
			const user = req.user;
			if (!user) {
				return res.status(401).json({ success: false, error: 'Unauthorized' });
			}

			// Determine required credits based on action
			let requiredCredits;
			if (action === 'property') {
				requiredCredits = creditsConfig.costs.propertyListing;
			} else if (action === 'item') {
				requiredCredits = creditsConfig.costs.itemListing;
			} else {
				return res.status(400).json({ success: false, error: 'Invalid action type' });
			}

			// Check if user has sufficient credits
			if (!user.hasCredits || !user.hasCredits(requiredCredits)) {
				return res.status(403).json({
					success: false,
					error: `Insufficient credits. You need ${requiredCredits} credits to create ${action === 'property' ? 'a property listing' : 'an item listing'}.`,
					required: requiredCredits,
					current: user.credits || 0,
					code: 'INSUFFICIENT_CREDITS',
				});
			}

			// User has sufficient credits, proceed
			next();
		} catch (err) {
			console.error('Error in requireCredits middleware:', err);
			return res.status(500).json({ success: false, error: 'Server error' });
		}
	};
}

module.exports = {
	requireCredits,
};
