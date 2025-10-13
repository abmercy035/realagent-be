/**
	* Comment Model
	* Handles comments and nested replies on properties
	*/

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
	{
		// ===========================
		// CONTENT
		// ===========================
		content: {
			type: String,
			required: [true, 'Comment content is required'],
			trim: true,
			minlength: [2, 'Comment must be at least 2 characters'],
			maxlength: [1000, 'Comment cannot exceed 1000 characters'],
		},

		// ===========================
		// RELATIONSHIPS
		// ===========================
		property: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Property',
			required: [true, 'Property reference is required'],
			index: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'User reference is required'],
			index: true,
		},

		// ===========================
		// NESTED REPLIES
		// ===========================
		parentComment: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Comment',
			default: null,
			index: true,
		},
		// Track all replies to this comment
		replies: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Comment',
			},
		],
		replyCount: {
			type: Number,
			default: 0,
		},

		// ===========================
		// MODERATION
		// ===========================
		status: {
			type: String,
			enum: {
				values: ['active', 'hidden', 'flagged', 'deleted'],
				message: 'Invalid status',
			},
			default: 'active',
			index: true,
		},
		isFlagged: {
			type: Boolean,
			default: false,
		},
		flaggedReason: {
			type: String,
			maxlength: [500, 'Flagged reason cannot exceed 500 characters'],
		},
		flaggedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},
		flaggedAt: {
			type: Date,
		},

		// ===========================
		// EDITING
		// ===========================
		isEdited: {
			type: Boolean,
			default: false,
		},
		editedAt: {
			type: Date,
		},
		editHistory: [
			{
				content: String,
				editedAt: {
					type: Date,
					default: Date.now,
				},
			},
		],

		// ===========================
		// ENGAGEMENT
		// ===========================
		likes: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User',
			},
		],
		likeCount: {
			type: Number,
			default: 0,
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
commentSchema.index({ property: 1, status: 1, createdAt: -1 });
commentSchema.index({ user: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1, createdAt: 1 });

// ===========================
// VIRTUAL FIELDS
// ===========================

// Check if comment is a reply
commentSchema.virtual('isReply').get(function () {
	return this.parentComment !== null;
});

// ===========================
// METHODS
// ===========================

/**
	* Check if user has liked this comment
	*/
commentSchema.methods.isLikedBy = function (userId) {
	return this.likes.some((like) => like.toString() === userId.toString());
};

/**
	* Toggle like on comment
	*/
commentSchema.methods.toggleLike = async function (userId) {
	const index = this.likes.indexOf(userId);

	if (index > -1) {
		// Unlike
		this.likes.splice(index, 1);
		this.likeCount = Math.max(0, this.likeCount - 1);
	} else {
		// Like
		this.likes.push(userId);
		this.likeCount += 1;
	}

	await this.save();
	return index === -1; // Return true if liked, false if unliked
};

/**
	* Edit comment content
	*/
commentSchema.methods.editContent = async function (newContent) {
	// Save to edit history
	this.editHistory.push({
		content: this.content,
		editedAt: Date.now(),
	});

	this.content = newContent;
	this.isEdited = true;
	this.editedAt = Date.now();

	await this.save();
};

/**
	* Flag comment
	*/
commentSchema.methods.flag = async function (userId, reason) {
	this.isFlagged = true;
	this.flaggedBy = userId;
	this.flaggedReason = reason;
	this.flaggedAt = Date.now();
	this.status = 'flagged';

	await this.save();
};

/**
	* Soft delete comment
	*/
commentSchema.methods.softDelete = async function () {
	this.status = 'deleted';
	this.content = '[This comment has been deleted]';
	await this.save();

	// Also update parent comment's reply count
	if (this.parentComment) {
		await Comment.findByIdAndUpdate(this.parentComment, {
			$inc: { replyCount: -1 },
		});
	}

	// Update property comment count
	const Property = mongoose.model('Property');
	await Property.findByIdAndUpdate(this.property, {
		$inc: { 'metrics.comments': -1 },
	});
};

// ===========================
// MIDDLEWARE
// ===========================

// Update parent comment's reply count and replies array
commentSchema.pre('save', async function (next) {
	if (this.isNew && this.parentComment) {
		await Comment.findByIdAndUpdate(this.parentComment, {
			$inc: { replyCount: 1 },
			$push: { replies: this._id },
		});
	}
	next();
});

// Update property comment count
commentSchema.post('save', async function (doc) {
	if (doc.status === 'active' && !doc.parentComment) {
		// Only count top-level comments
		const Property = mongoose.model('Property');
		await Property.findByIdAndUpdate(doc.property, {
			$inc: { 'metrics.comments': 1 },
		});
	}
});

// ===========================
// STATIC METHODS
// ===========================

/**
	* Get comments for a property with pagination
	*/
commentSchema.statics.getPropertyComments = async function (propertyId, page = 1, limit = 10) {
	const skip = (page - 1) * limit;

	const comments = await this.find({
		property: propertyId,
		parentComment: null, // Only top-level comments
		status: 'active',
	})
		.populate('user', 'name email profilePicture role')
		.populate({
			path: 'replies',
			match: { status: 'active' },
			options: { sort: { createdAt: 1 } },
			populate: {
				path: 'user',
				select: 'name email profilePicture role',
			},
		})
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);

	const total = await this.countDocuments({
		property: propertyId,
		parentComment: null,
		status: 'active',
	});

	return {
		comments,
		pagination: {
			page,
			limit,
			total,
			pages: Math.ceil(total / limit),
		},
	};
};

/**
	* Get user's comments
	*/
commentSchema.statics.getUserComments = async function (userId, page = 1, limit = 10) {
	const skip = (page - 1) * limit;

	const comments = await this.find({
		user: userId,
		status: 'active',
	})
		.populate('property', 'title primaryImage')
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);

	const total = await this.countDocuments({ user: userId, status: 'active' });

	return {
		comments,
		pagination: {
			page,
			limit,
			total,
			pages: Math.ceil(total / limit),
		},
	};
};

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
