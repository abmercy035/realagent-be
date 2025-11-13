const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const RoommatePostSchema = new Schema(
	{
	title: {
		type: String,
		required: true,
			trim: true,
			maxlength: [200, 'Title cannot exceed 200 characters']
		},
		description: {
			type: String,
			required: true,
			trim: true,
			maxlength: [5000, 'Description cannot exceed 5000 characters']
		},
		price: {
			amount: { type: Number, required: false },
			currency: { type: String, default: '₦' },
			period: { type: String }
		},
		property: {
			type: Schema.Types.ObjectId,
			ref: 'Property',
			required: false,
			index: true
		},
		external: {
			type: Boolean,
			default: false,
		},
		externalDetails: {
			address: String,
			city: String,
			state: String,
			contactPhone: String,
		},
		occupant: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		status: {
			type: String,
			enum: ['active', 'closed', 'deleted'],
			default: 'active',
			index: true
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
		tags: [String],
		roommatePreferences: { type: String },
		contact: {
			name: String,
			phone: String,
			email: String,
			website: String
		},
		// Privacy / contact sharing: occupant can control which methods are advertised on the post
		contactMethods: {
			inApp: { type: Boolean, default: true },
			whatsapp: { type: Boolean, default: false },
			phone: { type: Boolean, default: false }
		},
		preferredContact: { type: String, enum: ['in-app', 'whatsapp', 'phone', 'none'], default: 'in-app' },
		availableRooms: { type: Number, default: 1 },
		viewCount: {
			type: Number,
			default: 0
		},
		// Interests: users who expressed interest in this post
		interests: [
			{
				fromUser: { type: Schema.Types.ObjectId, ref: 'User' },
				message: { type: String },
				contactPref: { type: String, enum: ['in-app', 'whatsapp', 'phone', 'none'], default: 'in-app' },
				handled: { type: Boolean, default: false },
				handledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
				handledAt: { type: Date, default: null },
				createdAt: { type: Date, default: Date.now }
			}
		],
		suspiciousReports: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Report',
				default: []
			}
		]
	},
	{ timestamps: true }
);

// Ensure only the occupant of the property can create/manage posts
RoommatePostSchema.pre('validate', async function (next) {
	try {
		if (!this.property || !this.occupant) return next();

		const PropertyModel = mongoose.model('Property');
		const prop = await PropertyModel.findById(this.property).select('occupiedBy').exec();
		if (!prop) return next(new Error('Property not found'));
		if (!prop.occupiedBy) return next(new Error('Property has no registered occupant'));
		if (prop.occupiedBy.toString() !== this.occupant.toString()) {
			return next(new Error('Only the occupant may create or manage roommate posts for this property'));
		}

		next();
	} catch (err) {
		return next(err);
	}
});

RoommatePostSchema.index({ property: 1, occupant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RoommatePost', RoommatePostSchema);
