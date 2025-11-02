const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');

// Search agents with filters
router.get('/search', agentController.searchAgents);
// Get agent by username
router.get('/:username', agentController.getAgentByUsername);

module.exports = router;
