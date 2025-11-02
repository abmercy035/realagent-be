const User = require('../models/User');
const Property = require('../models/Property');
const Plan = require('../models/Plan');
const cloudinary = require('../config/cloudinary');
const PlanConfigFile = require('../config/plans');

/**
	* Cleanup properties for users whose grace window expired.
	* For each user with subscription.plan === 'free' and graceUntil <= now,
	* ensure they have at most the free plan postLimit properties. Delete newest
	* properties (by createdAt desc) until count == limit.
	*/
async function runGraceCleanup() {
	const now = new Date();
	try {
		const users = await User.find({ 'subscription.plan': 'free', 'subscription.graceUntil': { $lte: now } });
		if (!users || users.length === 0) return { handled: 0 };

		let totalRemoved = 0;
		// Fetch plan config from DB; fall back to file config
		const freePlan = await Plan.findOne({ name: 'free' });
		const defaultLimit = (freePlan && freePlan.postLimit) || (PlanConfigFile.plans && PlanConfigFile.plans.free.postLimit) || 5;

		for (const u of users) {
			try {
				const limit = (await Plan.findOne({ name: 'free' }))?.postLimit || defaultLimit;
				const count = await Property.countDocuments({ agent: u._id, status: { $ne: 'deleted' } });
				if (count <= limit) {
					// clear grace window
					if (u.subscription && u.subscription.graceUntil) {
						u.subscription.graceUntil = null;
						await u.save();
					}
					continue;
				}

				const toRemove = count - limit;
				// find newest properties and delete them
				const extras = await Property.find({ agent: u._id, status: { $ne: 'deleted' } })
					.sort({ createdAt: -1 })
					.limit(toRemove);

				for (const p of extras) {
					// cleanup cloudinary
					if (p.media && Array.isArray(p.media.images)) {
						for (const img of p.media.images) {
							if (img && img.publicId) {
								try { await cloudinary.deleteFromCloudinary(img.publicId); } catch (e) { /* ignore */ }
							}
						}
					}
					if (p.media && Array.isArray(p.media.videos)) {
						for (const v of p.media.videos) {
							if (v && v.publicId) {
								try { await cloudinary.deleteFromCloudinary(v.publicId); } catch (e) { /* ignore */ }
							}
						}
					}

					await Property.findByIdAndDelete(p._id);
					totalRemoved += 1;
				}

				// clear grace window after cleanup
				if (u.subscription && u.subscription.graceUntil) {
					u.subscription.graceUntil = null;
					await u.save();
				}
			} catch (userErr) {
				console.error('Error cleaning up for user', u._id, userErr);
			}
		}

		return { handled: users.length, removed: totalRemoved };
	} catch (err) {
		console.error('runGraceCleanup error', err);
		throw err;
	}
}

module.exports = { runGraceCleanup };
