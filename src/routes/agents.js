const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { auth } = require('../middleware/auth');

// Search agents with filters
router.get('/search', agentController.searchAgents);
// Upload profile image (protected route)
router.put('/profile/avatar', auth, agentController.uploadProfileImage);
// Get agent by username
router.get('/:username', agentController.getAgentByUsername);

module.exports = router;
