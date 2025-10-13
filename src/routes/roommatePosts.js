const express = require('express');
const router = express.Router();
const roommatePostController = require('../controllers/roommatePostController');
const { auth } = require('../middleware/auth');

// POST /api/roommate-posts - create roommate post (authenticated)
router.post('/', auth, roommatePostController.createRoommatePost);


// GET /api/roommate-posts/:id - get roommate post detail
router.get('/:id', async (req, res) => {
	const RoommatePost = require('../models/RoommatePost');
	try {
		const post = await RoommatePost.findById(req.params.id)
			.populate('property')
			.populate('occupant');
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

module.exports = router;
