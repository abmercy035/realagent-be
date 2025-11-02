const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true },
		displayName: { type: String },
		price: { type: Number, default: 0 },
		currency: { type: String, default: 'NGN' },
		postLimit: { type: Number, default: 5 },
		description: { type: String },
		active: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
