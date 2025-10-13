/**
	* Bookmark Model
	* Handles user's saved/favorited properties
	*/

const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema(
	{
		// ===========================
		// RELATIONSHIPS
		// ===========================
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'User reference is required'],
			index: true,
		},
		property: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Property',
			required: [true, 'Property reference is required'],
			index: true,
		},

		// ===========================
		// ADDITIONAL INFO
		// ===========================
		note: {
			type: String,
			trim: true,
			maxlength: [500, 'Note cannot exceed 500 characters'],
		},
		tags: [
			{
				type: String,
				trim: true,
				maxlength: [50, 'Tag cannot exceed 50 characters'],
			},
		],

		// ===========================
		// NOTIFICATION PREFERENCES
		// ===========================
		notifyOnPriceChange: {
			type: Boolean,
			default: true,
		},
		notifyOnAvailability: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true, // createdAt, updatedAt
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// ===========================
// INDEXES
// ===========================
// Ensure user cannot bookmark same property twice
bookmarkSchema.index({ user: 1, property: 1 }, { unique: true });
bookmarkSchema.index({ user: 1, createdAt: -1 });

// ===========================
// MIDDLEWARE
// ===========================

// Update property bookmark count on save
bookmarkSchema.post('save', async function (doc) {
	const Property = mongoose.model('Property');
	await Property.findByIdAndUpdate(doc.property, {
		$inc: { 'metrics.bookmarks': 1 },
	});
});

// Update property bookmark count on delete
bookmarkSchema.pre('remove', async function (next) {
	const Property = mongoose.model('Property');
	await Property.findByIdAndUpdate(this.property, {
		$inc: { 'metrics.bookmarks': -1 },
	});
	next();
});

// Alternative: Handle findOneAndDelete
bookmarkSchema.post('findOneAndDelete', async function (doc) {
	if (doc) {
		const Property = mongoose.model('Property');
		await Property.findByIdAndUpdate(doc.property, {
			$inc: { 'metrics.bookmarks': -1 },
		});
	}
});

// ===========================
// STATIC METHODS
// ===========================

/**
	* Get user's bookmarks with pagination
	*/
bookmarkSchema.statics.getUserBookmarks = async function (userId, page = 1, limit = 12) {
	const skip = (page - 1) * limit;

	const bookmarks = await this.find({ user: userId })
		.populate({
			path: 'property',
			select: 'title description location pricing media propertyType details occupancy paidContent status ratings agent',
			populate: {
				path: 'agent',
				select: 'name email phone verificationStatus',
			},
		})
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);

	const total = await this.countDocuments({ user: userId });

	return {
		bookmarks,
		pagination: {
			page,
			limit,
			total,
			pages: Math.ceil(total / limit),
		},
	};
};

/**
	* Check if user has bookmarked a property
	*/
bookmarkSchema.statics.isBookmarkedBy = async function (userId, propertyId) {
	const bookmark = await this.findOne({ user: userId, property: propertyId });
	return !!bookmark;
};

/**
	* Toggle bookmark (add or remove)
	*/
bookmarkSchema.statics.toggleBookmark = async function (userId, propertyId, note = '') {
	const existingBookmark = await this.findOne({ user: userId, property: propertyId });

	if (existingBookmark) {
		// Remove bookmark
		await this.findOneAndDelete({ user: userId, property: propertyId });
		return { action: 'removed', bookmark: null };
	} else {
		// Add bookmark
		const bookmark = await this.create({
			user: userId,
			property: propertyId,
			note,
		});
		return { action: 'added', bookmark };
	}
};

/**
	* Get bookmarks by tag
	*/
bookmarkSchema.statics.getBookmarksByTag = async function (userId, tag) {
	return await this.find({ user: userId, tags: tag })
		.populate('property')
		.sort({ createdAt: -1 });
};

const Bookmark = mongoose.model('Bookmark', bookmarkSchema);

module.exports = Bookmark;
