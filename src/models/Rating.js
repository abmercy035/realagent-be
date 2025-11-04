/**
	* Rating Model
	* Handles agent ratings and reviews
	*/

const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
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
		agent: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'Agent reference is required'],
			index: true,
		},
		property: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Property',
			index: true,
		},

		// ===========================
		// RATING INFO
		// ===========================
		rating: {
			type: Number,
			required: [true, 'Rating is required'],
			min: [1, 'Rating must be at least 1'],
			max: [5, 'Rating cannot exceed 5'],
		},
		review: {
			type: String,
			trim: true,
			maxlength: [1000, 'Review cannot exceed 1000 characters'],
		},

		// ===========================
		// ENGAGEMENT
		// ===========================
		helpful: {
			type: Number,
			default: 0,
		},
		helpfulBy: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User',
			},
		],

		// ===========================
		// STATUS
		// ===========================
		status: {
			type: String,
			enum: ['active', 'flagged', 'removed'],
			default: 'active',
		},
	},
	{
		timestamps: true,
	}
);

// ===========================
// INDEXES
// ===========================
ratingSchema.index({ agent: 1, user: 1 }, { unique: true }); // One rating per user per agent
ratingSchema.index({ createdAt: -1 });
ratingSchema.index({ rating: -1 });

// ===========================
// STATIC METHODS
// ===========================

/**
	* Get agent's average rating
	*/
ratingSchema.statics.getAgentAverageRating = async function (agentId) {
	const result = await this.aggregate([
		{ $match: { agent: new mongoose.Types.ObjectId(agentId), status: 'active' } },
		{
			$group: {
				_id: '$agent',
				averageRating: { $avg: '$rating' },
				totalReviews: { $sum: 1 },
				ratings: {
					$push: {
						rating: '$rating',
						review: '$review',
						user: '$user',
						createdAt: '$createdAt',
					},
				},
			},
		},
	]);

	if (result.length === 0) {
		return {
			averageRating: 0,
			totalReviews: 0,
			ratings: [],
		};
	}

	return {
		averageRating: Math.round(result[0].averageRating * 10) / 10,
		totalReviews: result[0].totalReviews,
	};
};

/**
	* Get agent's reviews with pagination
	*/
ratingSchema.statics.getAgentReviews = async function (agentId, page = 1, limit = 10) {
	const skip = (page - 1) * limit;

	const reviews = await this.find({ agent: agentId, status: 'active' })
		.populate('user', 'name avatar')
		.populate('property', 'title')
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);

	const total = await this.countDocuments({ agent: agentId, status: 'active' });

	return {
		reviews,
		pagination: {
			page,
			limit,
			total,
			pages: Math.ceil(total / limit),
		},
	};
};

/**
	* Check if user has rated agent
	*/
ratingSchema.statics.hasUserRatedAgent = async function (userId, agentId) {
	const rating = await this.findOne({ user: userId, agent: agentId });
	return !!rating;
};

/**
	* Toggle helpful vote
	*/
ratingSchema.methods.toggleHelpful = async function (userId) {
	const userIdStr = userId.toString();
	const index = this.helpfulBy.findIndex((id) => id.toString() === userIdStr);

	if (index === -1) {
		// Add helpful vote
		this.helpfulBy.push(userId);
		this.helpful += 1;
	} else {
		// Remove helpful vote
		this.helpfulBy.splice(index, 1);
		this.helpful -= 1;
	}

	await this.save();
	return this;
};

// ===========================
// HOOKS
// ===========================

// Update agent's rating when a review is created/updated
ratingSchema.post('save', async function () {
	try {
		const User = mongoose.model('User');
		const stats = await this.constructor.getAgentAverageRating(this.agent);
		await User.findByIdAndUpdate(this.agent, {
			rating: stats.averageRating,
			totalReviews: stats.totalReviews,
		});
	} catch (error) {
		console.error('Error updating agent rating:', error);
	}
});

// Update agent's rating when a review is deleted
ratingSchema.post('findOneAndDelete', async function (doc) {
	if (doc) {
		try {
			const User = mongoose.model('User');
			const stats = await doc.constructor.getAgentAverageRating(doc.agent);
			await User.findByIdAndUpdate(doc.agent, {
				rating: stats.averageRating,
				totalReviews: stats.totalReviews,
			});
		} catch (error) {
			console.error('Error updating agent rating:', error);
		}
	}
});

module.exports = mongoose.model('Rating', ratingSchema);
