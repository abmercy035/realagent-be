/**
	* Comment Controller
	* Handles property comments and replies
	*/

const Comment = require('../models/Comment');
const Property = require('../models/Property');

/**
	* @route   GET /api/comments/property/:propertyId
	* @desc    Get all comments for a property
	* @access  Public
	*/
exports.getPropertyComments = async (req, res) => {
	try {
		const { propertyId } = req.params;
		const { page = 1, limit = 10 } = req.query;

		const result = await Comment.getPropertyComments(propertyId, Number(page), Number(limit));

		res.status(200).json({
			success: true,
			...result,
		});
	} catch (error) {
		console.error('Get property comments error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch comments',
		});
	}
};

/**
	* @route   POST /api/comments
	* @desc    Create a new comment or reply
	* @access  Private
	*/
exports.createComment = async (req, res) => {
	try {
		const { content, propertyId, parentCommentId } = req.body;
		const userId = req.user._id;

		// Validation
		if (!content || !propertyId) {
			return res.status(400).json({
				success: false,
				error: 'Content and property ID are required',
			});
		}

		if (content.length < 2 || content.length > 1000) {
			return res.status(400).json({
				success: false,
				error: 'Comment must be between 2 and 1000 characters',
			});
		}

		// Check if property exists
		const property = await Property.findById(propertyId);
		if (!property) {
			return res.status(404).json({
				success: false,
				error: 'Property not found',
			});
		}

		// Check if parent comment exists (for replies)
		if (parentCommentId) {
			const parentComment = await Comment.findById(parentCommentId);
			if (!parentComment) {
				return res.status(404).json({
					success: false,
					error: 'Parent comment not found',
				});
			}
		}

		// Create comment
		const comment = await Comment.create({
			content,
			property: propertyId,
			user: userId,
			parentComment: parentCommentId || null,
		});

		// Populate user data
		await comment.populate('user', 'name email profilePicture role');

		res.status(201).json({
			success: true,
			message: 'Comment created successfully',
			data: comment,
		});
	} catch (error) {
		console.error('Create comment error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to create comment',
		});
	}
};

/**
	* @route   PUT /api/comments/:id
	* @desc    Edit a comment
	* @access  Private (Owner only)
	*/
exports.editComment = async (req, res) => {
	try {
		const { id } = req.params;
		const { content } = req.body;
		const userId = req.user._id;

		if (!content || content.length < 2 || content.length > 1000) {
			return res.status(400).json({
				success: false,
				error: 'Content must be between 2 and 1000 characters',
			});
		}

		const comment = await Comment.findById(id);
		if (!comment) {
			return res.status(404).json({
				success: false,
				error: 'Comment not found',
			});
		}

		// Check ownership
		if (comment.user.toString() !== userId.toString()) {
			return res.status(403).json({
				success: false,
				error: 'You can only edit your own comments',
			});
		}

		// Edit comment
		await comment.editContent(content);
		await comment.populate('user', 'name email profilePicture role');

		res.status(200).json({
			success: true,
			message: 'Comment updated successfully',
			data: comment,
		});
	} catch (error) {
		console.error('Edit comment error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to edit comment',
		});
	}
};

/**
	* @route   DELETE /api/comments/:id
	* @desc    Delete a comment
	* @access  Private (Owner/Admin)
	*/
exports.deleteComment = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;
		const isAdmin = req.user.role === 'admin';

		const comment = await Comment.findById(id);
		if (!comment) {
			return res.status(404).json({
				success: false,
				error: 'Comment not found',
			});
		}

		// Check permissions
		if (comment.user.toString() !== userId.toString() && !isAdmin) {
			return res.status(403).json({
				success: false,
				error: 'You can only delete your own comments',
			});
		}

		// Soft delete
		await comment.softDelete();

		res.status(200).json({
			success: true,
			message: 'Comment deleted successfully',
		});
	} catch (error) {
		console.error('Delete comment error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to delete comment',
		});
	}
};

/**
	* @route   POST /api/comments/:id/like
	* @desc    Toggle like on a comment
	* @access  Private
	*/
exports.toggleLike = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;

		const comment = await Comment.findById(id);
		if (!comment) {
			return res.status(404).json({
				success: false,
				error: 'Comment not found',
			});
		}

		const isLiked = await comment.toggleLike(userId);

		res.status(200).json({
			success: true,
			message: isLiked ? 'Comment liked' : 'Comment unliked',
			data: {
				isLiked,
				likeCount: comment.likeCount,
			},
		});
	} catch (error) {
		console.error('Toggle like error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to toggle like',
		});
	}
};

/**
	* @route   POST /api/comments/:id/flag
	* @desc    Flag a comment for moderation
	* @access  Private
	*/
exports.flagComment = async (req, res) => {
	try {
		const { id } = req.params;
		const { reason } = req.body;
		const userId = req.user._id;

		if (!reason || reason.length < 10) {
			return res.status(400).json({
				success: false,
				error: 'Flag reason must be at least 10 characters',
			});
		}

		const comment = await Comment.findById(id);
		if (!comment) {
			return res.status(404).json({
				success: false,
				error: 'Comment not found',
			});
		}

		await comment.flag(userId, reason);

		res.status(200).json({
			success: true,
			message: 'Comment flagged for review',
		});
	} catch (error) {
		console.error('Flag comment error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to flag comment',
		});
	}
};

/**
	* @route   GET /api/comments/user/my-comments
	* @desc    Get user's comments
	* @access  Private
	*/
exports.getUserComments = async (req, res) => {
	try {
		const userId = req.user._id;
		const { page = 1, limit = 10 } = req.query;

		const result = await Comment.getUserComments(userId, Number(page), Number(limit));

		res.status(200).json({
			success: true,
			...result,
		});
	} catch (error) {
		console.error('Get user comments error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch user comments',
		});
	}
};

module.exports = exports;
