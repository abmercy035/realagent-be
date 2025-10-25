const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { requireAgentOrAdmin } = require('../middleware/roleCheck');
const controller = require('../controllers/viewingRequestController');

// Create a viewing request (authenticated users)
router.post('/', auth, controller.createViewingRequest);

// List viewing requests (agent -> their requests, user -> their requests)
router.get('/', auth, controller.listViewingRequests);

// Update a viewing request (agent/admin can update; users can cancel their own)
router.patch('/:id', auth, controller.updateViewingRequest);

module.exports = router;
