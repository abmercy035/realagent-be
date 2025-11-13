/**
	* ViewingRequest Model
	* Stores viewing / inquiry requests made by users for properties.
	* Fields:
	* - user: the user who requested the viewing
	* - agent: agent responsible for the property (for agent-side queries)
	* - propertyId: reference to Property
	* - requestedDate: preferred date (Date)
	* - requestedTime: preferred time (string)
	* - message: optional message from user
	* - status: pending | confirmed | completed | cancelled | closed
	*/

const mongoose = require('mongoose');

const viewingRequestSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		agent: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: false,
			index: true,
		},
		propertyId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Property',
			required: true,
			index: true,
		},
		requestedDate: {
			type: Date,
		},
		requestedTime: {
			type: String,
		},
		message: {
			type: String,
			trim: true,
			maxlength: 2000,
		},
		status: {
			type: String,
			enum: ['pending', 'confirmed', 'completed', 'cancelled', 'closed'],
			default: 'pending',
			index: true,
		},
		contactMethod: {
			type: String,
			enum: ['email', 'phone', 'whatsapp', 'in-app', 'other'],
			default: 'in-app',
		},
		// Source of the request for analytics (e.g., 'roommate-post', 'search', 'listing-page')
		source: {
			type: String,
			enum: ['web', 'mobile', 'roommate-post', 'listing-page', 'other'],
			default: 'other',
			index: true,
		},
	},
	{
		timestamps: true,
	}
);

// Indexes to speed up common queries
viewingRequestSchema.index({ agent: 1, status: 1 });
viewingRequestSchema.index({ user: 1, createdAt: -1 });

const ViewingRequest = mongoose.model('ViewingRequest', viewingRequestSchema);

module.exports = ViewingRequest;
