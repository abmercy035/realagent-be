const mongoose = require('mongoose');

const MarketItemSchema = new mongoose.Schema(
	{
		title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
		description: { type: String, required: [true, 'Description is required'], trim: true, maxlength: 5000 },
		price: {
			amount: { type: Number, required: [true, 'Price amount is required'], min: 0 },
			currency: { type: String, default: 'NGN' },
		},
		images: [
			{
				url: String,
				publicId: String,
			},
		],
		thumbnail: { type: String },
		// store public id for thumbnail when uploaded to Cloudinary
		thumbnailPublicId: { type: String },
		category: { type: String, trim: true, index: true },
		tags: [{ type: String, index: true }],
		location: {
			address: String,
			city: String,
			state: String,
		},
		contact: {
			phone: String,
			email: String,
		},
		owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		status: { type: String, enum: ['active', 'closed', 'deleted'], default: 'active', index: true },
		school: { type: String, required: [true, 'School is required'], trim: true, index: true },
	},
	{ timestamps: true }
);

// Ensure max 2 images
MarketItemSchema.path('images').validate(function (val) {
	if (!val) return true;
	return val.length <= 2;
}, 'A maximum of 2 images is allowed');

// Text index for full-text search on title, description and tags.
// Including `tags` as a text field allows full-text searches to match tag values.
// We avoid mixing text and non-text keys in the same index (e.g. title:text + tags:1),
// but adding tags as a text field in the text index is valid and desired if you want
// search queries to hit tag values.
MarketItemSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Separate single-field indexes for filters / sorting
MarketItemSchema.index({ tags: 1 });
MarketItemSchema.index({ category: 1 });
MarketItemSchema.index({ school: 1 });

module.exports = mongoose.model('MarketItem', MarketItemSchema);
