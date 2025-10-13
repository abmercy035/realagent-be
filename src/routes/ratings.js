/**
	* Ratings Routes
	* Routes for agent ratings and reviews
	*/

const express = require('express');
const router = express.Router();
const {
	createRating,
	getAgentRatings,
	checkUserRating,
	updateRating,
	deleteRating,
	toggleHelpful,
	getMyReviews,
} = require('../controllers/ratingController');
const { auth } = require('../middleware/auth');

// Public routes
router.get('/agent/:agentId', getAgentRatings);

// Protected routes
router.post('/', auth, createRating);
router.get('/my-reviews', auth, getMyReviews);
router.get('/check/:agentId', auth, checkUserRating);
router.put('/:id', auth, updateRating);
router.delete('/:id', auth, deleteRating);
router.post('/:id/helpful', auth, toggleHelpful);

module.exports = router;
