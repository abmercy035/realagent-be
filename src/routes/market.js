const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { auth, optionalAuth } = require('../middleware/auth');

// Public list and search
router.get('/', marketController.listMarketItems);

// Featured items (recent)
router.get('/featured', marketController.featuredMarketItems);

// List items for authenticated user (manage listings)
router.get('/mine', auth, marketController.listUserMarketItems);

// Get single item (public)
router.get('/:id', marketController.getMarketItem);

// Create (auth required)
router.post('/', auth, marketController.createMarketItem);

// Update (auth & permission)
router.put('/:id', auth, marketController.updateMarketItem);

// Delete (auth & permission) - soft delete
router.delete('/:id', auth, marketController.deleteMarketItem);

module.exports = router;
