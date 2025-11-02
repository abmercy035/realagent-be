/**
	* Agent Card Generation Routes
	* Routes for generating promotional cards for agents
	*/

const express = require('express');
const router = express.Router();
const { generateAgentCard } = require('../controllers/agentCardController');
const { protect } = require('../middleware/auth');

/**
	* @route   POST /api/agent-card
	* @desc    Generate promotional card for agent
	* @access  Private
	*/
router.post('/', protect, generateAgentCard);

module.exports = router;
