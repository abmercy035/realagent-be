/**
	* Bookmark Routes
	* Routes for user bookmarks/favorites
	*/

const express = require('express');
const router = express.Router();
const {
	getUserBookmarks,
	toggleBookmark,
	checkBookmark,
	updateBookmark,
	deleteBookmark,
	getBookmarksByTag,
} = require('../controllers/bookmarkController');
const { auth } = require('../middleware/auth');

// All bookmark routes require authentication
router.use(auth);

/**
	* @route   GET /api/bookmarks
	* @desc    Get user's bookmarks
	* @access  Private
	*/
router.get('/', getUserBookmarks);

/**
	* @route   POST /api/bookmarks
	* @desc    Add bookmark (alias for toggle)
	* @access  Private
	*/
router.post('/', toggleBookmark);

/**
	* @route   POST /api/bookmarks/toggle
	* @desc    Add or remove bookmark
	* @access  Private
	*/
router.post('/toggle', toggleBookmark);

/**
	* @route   GET /api/bookmarks/check/:propertyId
	* @desc    Check if property is bookmarked
	* @access  Private
	*/
router.get('/check/:propertyId', checkBookmark);

/**
	* @route   GET /api/bookmarks/tags/:tag
	* @desc    Get bookmarks by tag
	* @access  Private
	*/
router.get('/tags/:tag', getBookmarksByTag);

/**
	* @route   PUT /api/bookmarks/:id
	* @desc    Update bookmark
	* @access  Private
	*/
router.put('/:id', updateBookmark);

/**
	* @route   DELETE /api/bookmarks/:id
	* @desc    Delete bookmark by bookmark ID or property ID
	* @access  Private
	*/
router.delete('/:id', deleteBookmark);

/**
	* @route   DELETE /api/bookmarks/property/:propertyId
	* @desc    Delete bookmark by property ID
	* @access  Private
	*/
router.delete('/property/:propertyId', async (req, res) => {
	const { propertyId } = req.params;
	const userId = req.user._id;

	try {
		const Bookmark = require('../models/Bookmark');
		const bookmark = await Bookmark.findOneAndDelete({ user: userId, property: propertyId });

		if (!bookmark) {
			return res.status(404).json({
				success: false,
				error: 'Bookmark not found',
			});
		}

		res.status(200).json({
			success: true,
			message: 'Bookmark deleted successfully',
		});
	} catch (error) {
		console.error('Delete bookmark by property error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to delete bookmark',
		});
	}
});

module.exports = router;
