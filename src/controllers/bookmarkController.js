/**
	* Bookmark Controller
	* Handles user bookmarks/favorites
	*/

const Bookmark = require('../models/Bookmark');
const Property = require('../models/Property');

/**
	* @route   GET /api/bookmarks
	* @desc    Get user's bookmarks
	* @access  Private
	*/
exports.getUserBookmarks = async (req, res) => {
	try {
		const userId = req.user._id;
		const { page = 1, limit = 12 } = req.query;

		const result = await Bookmark.getUserBookmarks(userId, Number(page), Number(limit));

		res.status(200).json({
			success: true,
			...result,
		});
	} catch (error) {
		console.error('Get user bookmarks error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch bookmarks',
		});
	}
};

/**
	* @route   POST /api/bookmarks/toggle
	* @desc    Add or remove bookmark
	* @access  Private
	*/
exports.toggleBookmark = async (req, res) => {
	try {
		const { propertyId, note } = req.body;
		const userId = req.user._id;

		if (!propertyId) {
			return res.status(400).json({
				success: false,
				error: 'Property ID is required',
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

		const result = await Bookmark.toggleBookmark(userId, propertyId, note);

		res.status(200).json({
			success: true,
			message: result.action === 'added' ? 'Property bookmarked' : 'Bookmark removed',
			data: result,
		});
	} catch (error) {
		console.error('Toggle bookmark error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to toggle bookmark',
		});
	}
};

/**
	* @route   GET /api/bookmarks/check/:propertyId
	* @desc    Check if property is bookmarked
	* @access  Private
	*/
exports.checkBookmark = async (req, res) => {
	try {
		const { propertyId } = req.params;
		const userId = req.user._id;

		const isBookmarked = await Bookmark.isBookmarkedBy(userId, propertyId);

		res.status(200).json({
			success: true,
			data: { isBookmarked },
		});
	} catch (error) {
		console.error('Check bookmark error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to check bookmark status',
		});
	}
};

/**
	* @route   PUT /api/bookmarks/:id
	* @desc    Update bookmark note/tags
	* @access  Private
	*/
exports.updateBookmark = async (req, res) => {
	try {
		const { id } = req.params;
		const { note, tags, notifyOnPriceChange, notifyOnAvailability } = req.body;
		const userId = req.user._id;

		const bookmark = await Bookmark.findOne({ _id: id, user: userId });
		if (!bookmark) {
			return res.status(404).json({
				success: false,
				error: 'Bookmark not found',
			});
		}

		// Update fields
		if (note !== undefined) bookmark.note = note;
		if (tags !== undefined) bookmark.tags = tags;
		if (notifyOnPriceChange !== undefined) bookmark.notifyOnPriceChange = notifyOnPriceChange;
		if (notifyOnAvailability !== undefined) bookmark.notifyOnAvailability = notifyOnAvailability;

		await bookmark.save();
		await bookmark.populate('property');

		res.status(200).json({
			success: true,
			message: 'Bookmark updated successfully',
			data: bookmark,
		});
	} catch (error) {
		console.error('Update bookmark error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to update bookmark',
		});
	}
};

/**
	* @route   DELETE /api/bookmarks/:id
	* @desc    Delete bookmark
	* @access  Private
	*/
exports.deleteBookmark = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;

		const bookmark = await Bookmark.findOneAndDelete({ _id: id, user: userId });
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
		console.error('Delete bookmark error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to delete bookmark',
		});
	}
};

/**
	* @route   GET /api/bookmarks/tags/:tag
	* @desc    Get bookmarks by tag
	* @access  Private
	*/
exports.getBookmarksByTag = async (req, res) => {
	try {
		const { tag } = req.params;
		const userId = req.user._id;

		const bookmarks = await Bookmark.getBookmarksByTag(userId, tag);

		res.status(200).json({
			success: true,
			data: bookmarks,
		});
	} catch (error) {
		console.error('Get bookmarks by tag error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch bookmarks by tag',
		});
	}
};

module.exports = exports;
