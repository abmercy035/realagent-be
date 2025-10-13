const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RoommatePostSchema = new Schema({
	title: {
		type: String,
		required: true,
		trim: true
	},
	description: {
		type: String,
		required: true,
		trim: true
	},
	price: {
		amount: { type: Number, required: true },
		currency: { type: String, default: '₦' },
		period: { type: String }
	},
	property: {
		type: Schema.Types.ObjectId,
		ref: 'Property',
		required: true
	},
	occupant: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	status: {
		type: String,
		enum: ['active', 'closed', 'deleted'],
		default: 'active'
	},
	media: {
		images: [
			{
				url: String,
				publicId: String,
				caption: String
			}
		],
		videos: [
			{
				url: String,
				publicId: String,
				caption: String
			}
		]
	},
	roommatePreferences: { type: String },
	contact: {
		name: String,
		phone: String,
		email: String,
		website: String
	},
	viewCount: {
		type: Number,
		default: 0
	},
	suspiciousReports: [{
		type: Schema.Types.ObjectId,
		ref: 'Report',
		default: []
	}]
}, { timestamps: true });

module.exports = mongoose.model('RoommatePost', RoommatePostSchema);
