const express = require('express');
const router = express.Router();
const roommatePostController = require('../controllers/roommatePostController');
const { auth } = require('../middleware/auth');


// GET /api/roommate-posts - list roommate posts (public, paginated)
router.get('/', roommatePostController.getRoommatePosts);

// POST /api/roommate-posts - create roommate post (authenticated)
router.post('/', auth, roommatePostController.createRoommatePost);


// GET /api/roommate-posts/:id - get roommate post detail
router.get('/:id', async (req, res) => {
	const RoommatePost = require('../models/RoommatePost');
	try {
		const post = await RoommatePost.findById(req.params.id)
			.populate('property')
			.populate('occupant')
			.populate('interests.fromUser', 'name email phone');
		if (!post) {
			return res.status(404).json({ error: 'Roommate post not found.' });
		}
		res.status(200).json({ data: post });
	} catch (err) {
		res.status(500).json({ error: 'Failed to fetch roommate post.' });
	}
});

// PUT /api/roommate-posts/:id - update roommate post (authenticated)
router.put('/:id', auth, roommatePostController.updateRoommatePost);

// DELETE /api/roommate-posts/:id - delete roommate post (authenticated)
router.delete('/:id', auth, roommatePostController.deleteRoommatePost);

// POST /api/roommate-posts/:id/interest - express interest (authenticated)
router.post('/:id/interest', auth, roommatePostController.expressInterest);

// PATCH /api/roommate-posts/:postId/interests/:interestId/handle - mark interest handled
router.patch('/:postId/interests/:interestId/handle', auth, roommatePostController.markInterestHandled);

// GET /api/roommate-posts/:postId/interests/export - export interests CSV (occupant/admin)
router.get('/:postId/interests/export', auth, roommatePostController.exportInterestsCsv);

module.exports = router;
