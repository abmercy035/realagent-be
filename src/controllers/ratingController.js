/**
	* Rating Controller
	* Handles agent ratings and reviews
	*/

const Rating = require('../models/Rating');
const User = require('../models/User');

/**
	* @route   POST /api/ratings
	* @desc    Create a new rating/review
	* @access  Private
	*/
exports.createRating = async (req, res) => {
	try {
		const { agentId, rating, review, propertyId } = req.body;

		// Validation
		if (!agentId || !rating) {
			return res.status(400).json({
				success: false,
				message: 'Agent ID and rating are required',
			});
		}

		if (rating < 1 || rating > 5) {
			return res.status(400).json({
				success: false,
				message: 'Rating must be between 1 and 5',
			});
		}

		// Check if agent exists
		const agent = await User.findById(agentId);
		if (!agent) {
			return res.status(404).json({
				success: false,
				message: 'Agent not found',
			});
		}

		// Check if agent role is 'agent'
		if (agent.role !== 'agent') {
			return res.status(400).json({
				success: false,
				message: 'User is not an agent',
			});
		}

		// Prevent self-rating
		if (req.user._id.toString() === agentId) {
			return res.status(400).json({
				success: false,
				message: 'You cannot rate yourself',
			});
		}

		// Check if user already rated this agent
		const existingRating = await Rating.findOne({
			user: req.user._id,
			agent: agentId,
		});

		if (existingRating) {
			return res.status(400).json({
				success: false,
				message: 'You have already rated this agent',
			});
		}

		// Create rating
		const newRating = await Rating.create({
			user: req.user._id,
			agent: agentId,
			rating,
			review,
			property: propertyId || null,
		});

		// Populate user info
		await newRating.populate('user', 'name profilePicture');

		res.status(201).json({
			success: true,
			message: 'Rating created successfully',
			data: newRating,
		});
	} catch (error) {
		console.error('Create rating error:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/ratings/agent/:agentId
	* @desc    Get agent's ratings with pagination
	* @access  Public
	*/
exports.getAgentRatings = async (req, res) => {
	try {
		const { agentId } = req.params;
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;

		// Check if agent exists
		const agent = await User.findById(agentId);
		if (!agent) {
			return res.status(404).json({
				success: false,
				message: 'Agent not found',
			});
		}

		// Get reviews with pagination
		const result = await Rating.getAgentReviews(agentId, page, limit);

		// Get average rating
		const stats = await Rating.getAgentAverageRating(agentId);

		res.status(200).json({
			success: true,
			data: result.reviews,
			pagination: result.pagination,
			stats: {
				averageRating: stats.averageRating,
				totalReviews: stats.totalReviews,
			},
		});
	} catch (error) {
		console.error('Get agent ratings error:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/ratings/check/:agentId
	* @desc    Check if user has rated agent
	* @access  Private
	*/
exports.checkUserRating = async (req, res) => {
	try {
		const { agentId } = req.params;

		const rating = await Rating.findOne({
			user: req.user._id,
			agent: agentId,
		});

		res.status(200).json({
			success: true,
			data: {
				hasRated: !!rating,
				rating: rating || null,
			},
		});
	} catch (error) {
		console.error('Check user rating error:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: error.message,
		});
	}
};

/**
	* @route   PUT /api/ratings/:id
	* @desc    Update rating/review
	* @access  Private
	*/
exports.updateRating = async (req, res) => {
	try {
		const { id } = req.params;
		const { rating, review } = req.body;

		// Find rating
		const existingRating = await Rating.findById(id);
		if (!existingRating) {
			return res.status(404).json({
				success: false,
				message: 'Rating not found',
			});
		}

		// Check ownership
		if (existingRating.user.toString() !== req.user._id.toString()) {
			return res.status(403).json({
				success: false,
				message: 'Not authorized to update this rating',
			});
		}

		// Validate rating
		if (rating && (rating < 1 || rating > 5)) {
			return res.status(400).json({
				success: false,
				message: 'Rating must be between 1 and 5',
			});
		}

		// Update rating
		if (rating) existingRating.rating = rating;
		if (review !== undefined) existingRating.review = review;

		await existingRating.save();
		await existingRating.populate('user', 'name profilePicture');

		res.status(200).json({
			success: true,
			message: 'Rating updated successfully',
			data: existingRating,
		});
	} catch (error) {
		console.error('Update rating error:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: error.message,
		});
	}
};

/**
	* @route   DELETE /api/ratings/:id
	* @desc    Delete rating
	* @access  Private
	*/
exports.deleteRating = async (req, res) => {
	try {
		const { id } = req.params;

		// Find rating
		const rating = await Rating.findById(id);
		if (!rating) {
			return res.status(404).json({
				success: false,
				message: 'Rating not found',
			});
		}

		// Check ownership
		if (rating.user.toString() !== req.user._id.toString()) {
			return res.status(403).json({
				success: false,
				message: 'Not authorized to delete this rating',
			});
		}

		await Rating.findByIdAndDelete(id);

		res.status(200).json({
			success: true,
			message: 'Rating deleted successfully',
		});
	} catch (error) {
		console.error('Delete rating error:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: error.message,
		});
	}
};

/**
	* @route   POST /api/ratings/:id/helpful
	* @desc    Toggle helpful vote on a rating
	* @access  Private
	*/
exports.toggleHelpful = async (req, res) => {
	try {
		const { id } = req.params;

		// Find rating
		const rating = await Rating.findById(id);
		if (!rating) {
			return res.status(404).json({
				success: false,
				message: 'Rating not found',
			});
		}

		// Toggle helpful
		await rating.toggleHelpful(req.user._id);

		res.status(200).json({
			success: true,
			message: 'Helpful vote toggled',
			data: {
				helpful: rating.helpful,
				isHelpful: rating.helpfulBy.some(
					(id) => id.toString() === req.user._id.toString()
				),
			},
		});
	} catch (error) {
		console.error('Toggle helpful error:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/ratings/my-reviews
	* @desc    Get current user's reviews
	* @access  Private
	*/
exports.getMyReviews = async (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const skip = (page - 1) * limit;

		const reviews = await Rating.find({ user: req.user._id, status: 'active' })
			.populate('agent', 'name profilePicture verificationStatus')
			.populate('property', 'title')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit);

		const total = await Rating.countDocuments({ user: req.user._id, status: 'active' });

		res.status(200).json({
			success: true,
			data: reviews,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error('Get my reviews error:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: error.message,
		});
	}
};
