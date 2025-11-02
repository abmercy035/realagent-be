const Plan = require('../models/Plan');

exports.listPlans = async (req, res) => {
	try {
		const plans = await Plan.find().sort({ price: 1 });
		res.json({ success: true, data: plans });
	} catch (err) {
		console.error('listPlans error', err);
		res.status(500).json({ success: false, message: 'Failed to fetch plans' });
	}
};

exports.getPlan = async (req, res) => {
	try {
		const plan = await Plan.findById(req.params.id);
		if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
		res.json({ success: true, data: plan });
	} catch (err) {
		console.error('getPlan error', err);
		res.status(500).json({ success: false, message: 'Failed to fetch plan' });
	}
};

exports.createPlan = async (req, res) => {
	try {
		const { name, displayName, price, currency, postLimit, description, active } = req.body;
		const plan = new Plan({ name, displayName, price, currency, postLimit, description, active });
		await plan.save();
		res.status(201).json({ success: true, data: plan });
	} catch (err) {
		console.error('createPlan error', err);
		res.status(500).json({ success: false, message: 'Failed to create plan' });
	}
};

exports.updatePlan = async (req, res) => {
	try {
		const updates = req.body || {};
		const plan = await Plan.findByIdAndUpdate(req.params.id, updates, { new: true });
		if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
		res.json({ success: true, data: plan });
	} catch (err) {
		console.error('updatePlan error', err);
		res.status(500).json({ success: false, message: 'Failed to update plan' });
	}
};

exports.deletePlan = async (req, res) => {
	try {
		const plan = await Plan.findByIdAndDelete(req.params.id);
		if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
		res.json({ success: true, message: 'Plan deleted' });
	} catch (err) {
		console.error('deletePlan error', err);
		res.status(500).json({ success: false, message: 'Failed to delete plan' });
	}
};
