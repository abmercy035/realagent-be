const mongoose = require('mongoose');

const MarketMediaSchema = new mongoose.Schema(
	{
		cloudinaryPublicId: { type: String, required: true },
		secureUrl: { type: String, required: true },
		type: { type: String, enum: ['image', 'video'], required: true },
	},
	{ _id: false }
);

const CreditCostBreakdownSchema = new mongoose.Schema(
	{
		imageCost: { type: Number, required: true },
		videoCost: { type: Number, required: true },
		priceCost: { type: Number, required: true },
		rawTotal: { type: Number, required: true },
		finalCost: { type: Number, required: true },
		capped: { type: Boolean, required: true },
	},
	{ _id: false }
);

const MarketItemSchema = new mongoose.Schema(
	{
		sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		title: { type: String, required: true, trim: true, maxlength: 150 },
		description: { type: String, required: true, maxlength: 3000 },
		price: { type: Number, required: true, min: 0 },
		category: { type: String, required: true, trim: true, index: true },
		campus: { type: String, required: true, trim: true, index: true },
		media: { type: [MarketMediaSchema], default: [] },
		status: { type: String, enum: ['active', 'sold', 'removed'], default: 'active', required: true, index: true },
		creditCostCharged: { type: CreditCostBreakdownSchema, required: true },
		sellerTierAtCreation: { type: String, enum: ['free', 'paid_basic'], required: true },
	},
	{ timestamps: true }
);

// Primary browse index matching frontend
MarketItemSchema.index({ campus: 1, status: 1, createdAt: -1 });
MarketItemSchema.index({ category: 1, status: 1, createdAt: -1 });
MarketItemSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
MarketItemSchema.index({ title: 'text', description: 'text' });

// Ensure we map directly to the 'marketlistings' collection used by the frontend
module.exports = mongoose.model('MarketItem', MarketItemSchema, 'marketlistings');
