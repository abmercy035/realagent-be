const User = require('../models/User');

/**
	* Get current authenticated user's subscription
	*/
exports.getSubscription = async (req, res) => {
	try {
		const user = req.user;
		if (!user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });

		// Include remaining post allowance and grace info for frontend
		try {
			const { getUserPlanAsync, countPropertiesForAgent, getPlanConfig, isInGrace } = require('../utils/planUtils');
			const plan = await getUserPlanAsync(user);
			const current = await countPropertiesForAgent(user._id);
			const limit = plan.postLimit || 0;
			const inGrace = isInGrace(user);
			const remaining = Math.max(0, limit - current);
			const payload = Object.assign({}, user.subscription || {}, { remaining, current, limit, inGrace });
			return res.json({ status: 'success', data: payload });
		} catch (innerErr) {
			console.error('getSubscription augmentation error', innerErr);
			return res.json({ status: 'success', data: user.subscription || null });
		}
	} catch (error) {
		console.error('getSubscription error:', error);
		return res.status(500).json({ status: 'error', message: 'Failed to fetch subscription' });
	}
};

/**
	* Create/Update a subscription for the authenticated user
	* Expects body to contain subscription fields from provider
	*/
exports.subscribe = async (req, res) => {
	try {
		const user = req.user;
		if (!user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });

		const {
			plan = 'basic',
			provider,
			customerId,
			subscriptionId,
			priceId,
			currentPeriodStart,
			currentPeriodEnd,
			trialEndsAt,
			paymentMethodLast4,
		} = req.body || {};

		const now = new Date();

		const s = {
			plan,
			provider: provider || user.subscription?.provider,
			customerId: customerId || user.subscription?.customerId,
			subscriptionId: subscriptionId || user.subscription?.subscriptionId,
			priceId: priceId || user.subscription?.priceId,
			paymentMethodLast4: paymentMethodLast4 || user.subscription?.paymentMethodLast4,
			startedAt: user.subscription?.startedAt || now,
			currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : user.subscription?.currentPeriodStart,
			currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : user.subscription?.currentPeriodEnd,
			trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : user.subscription?.trialEndsAt,
			cancelAtPeriodEnd: false,
			cancelAt: null,
			canceledAt: null,
			billingEmail: user.email,
		};

		// Determine status: if trialEndsAt in future => trialing, otherwise active
		if (s.trialEndsAt && new Date(s.trialEndsAt) > now) {
			s.status = 'trialing';
		} else {
			s.status = 'active';
		}

		// Clear any grace when a new paid plan is set
		if (s.plan && s.plan !== 'free') {
			s.graceUntil = null;
		}
		user.subscription = s;
		await user.save();

		return res.json({ status: 'success', data: user.subscription });
	} catch (error) {
		console.error('subscribe error:', error);
		return res.status(500).json({ status: 'error', message: 'Failed to create/update subscription' });
	}
};

/**
	* Cancel subscription for authenticated user
	* If immediate=true in body, downgrade immediately; otherwise mark cancelAtPeriodEnd
	*/
exports.cancel = async (req, res) => {
	try {
		const user = req.user;
		if (!user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });

		const { immediate = false } = req.body || {};
		const now = new Date();

		if (!user.subscription || !user.subscription.status || user.subscription.status === 'none') {
			return res.status(400).json({ status: 'error', message: 'No active subscription to cancel' });
		}

		if (immediate) {
			user.subscription.plan = 'free';
			user.subscription.status = 'none';
			user.subscription.canceledAt = now;
			user.subscription.cancelAtPeriodEnd = false;
			user.subscription.cancelAt = null;
			// Give a 7-day grace period to renew/upgrade
			user.subscription.graceUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
		} else {
			// Mark for cancellation at period end
			user.subscription.cancelAtPeriodEnd = true;
			user.subscription.cancelAt = user.subscription.currentPeriodEnd || null;
		}

		await user.save();

		return res.json({ status: 'success', data: user.subscription });
	} catch (error) {
		console.error('cancel subscription error:', error);
		return res.status(500).json({ status: 'error', message: 'Failed to cancel subscription' });
	}
};
