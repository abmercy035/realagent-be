/**
	* Comment Routes
	* Routes for property comments and replies
	*/

const express = require('express');
const router = express.Router();
const {
	getPropertyComments,
	createComment,
	editComment,
	deleteComment,
	toggleLike,
	flagComment,
	getUserComments,
} = require('../controllers/commentController');
const { auth } = require('../middleware/auth');
const { commentCreateLimiter, commentUpdateLimiter } = require('../middleware/commentRateLimiter');

/**
	* @route   GET /api/comments/property/:propertyId
	* @desc    Get comments for a property
	* @access  Public
	*/
router.get('/property/:propertyId', getPropertyComments);

/**
	* @route   GET /api/comments/user/my-comments
	* @desc    Get user's comments
	* @access  Private
	*/
router.get('/user/my-comments', auth, getUserComments);

/**
	* @route   POST /api/comments
	* @desc    Create a comment or reply
	* @access  Private
	*/
router.post('/', auth, commentCreateLimiter, createComment);

/**
	* @route   PUT /api/comments/:id
	* @desc    Edit a comment
	* @access  Private
	*/
router.put('/:id', auth, commentUpdateLimiter, editComment);

/**
	* @route   DELETE /api/comments/:id
	* @desc    Delete a comment
	* @access  Private
	*/
router.delete('/:id', auth, deleteComment);

/**
	* @route   POST /api/comments/:id/like
	* @desc    Toggle like on comment
	* @access  Private
	*/
router.post('/:id/like', auth, toggleLike);

/**
	* @route   POST /api/comments/:id/flag
	* @desc    Flag comment for moderation
	* @access  Private
	*/
router.post('/:id/flag', auth, flagComment);

module.exports = router;
