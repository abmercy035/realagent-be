/**
	* Property Routes
	* Public routes for property discovery and interaction
	*/

const express = require('express');
const router = express.Router();
const {
	getAllProperties,
	getPropertyById,
	getPropertiesByAgent,
	getFeaturedProperties,
	getRecentlyViewed,
	getSimilarProperties,
	shareProperty,
	getPropertyStats,
	trackPropertyView,
	getPropertiesOccupiedByUser,
} = require('../controllers/propertyController');
const { auth } = require('../middleware/auth');


/**
	* @route   POST /api/properties
	* @desc    Create new property listing (agent only)
	* @access  Private (Agent)
	*/
const { requireRole } = require('../middleware/roleCheck');
router.post('/', auth, requireRole('agent'), require('../controllers/propertyController').createProperty);

/**
	* @route   GET /api/properties
	* @desc    Get all properties with filters
	* @access  Public
	*/
router.get('/', getAllProperties);

/**
	* @route   GET /api/properties/featured
	* @desc    Get featured properties
	* @access  Public
	*/
router.get('/featured', getFeaturedProperties);

/**
	* @route   GET /api/properties/recently-viewed
	* @desc    Get user's recently viewed properties
	* @access  Private
	*/
router.get('/recently-viewed', auth, getRecentlyViewed);

/**
	* @route   GET /api/properties/stats/overview
	* @desc    Get property statistics
	* @access  Private (Agent/Admin)
	*/
router.get('/stats/overview', auth, getPropertyStats);

/**
	* @route   GET /api/properties/agent/:agentId
	* @desc    Get properties by agent
	* @access  Public
	*/
router.get('/agent/:agentId', getPropertiesByAgent);

/**
	* @route   GET /api/properties/similar/:id
	* @desc    Get similar properties
	* @access  Public
	*/
router.get('/similar/:id', getSimilarProperties);

/**
	* @route   GET /api/properties/:id
	* @desc    Get single property
	* @access  Public
	*/
router.get('/:id', getPropertyById);

/**
	* @route   POST /api/properties/:id/share
	* @desc    Increment share count
	* @access  Public
	*/
router.post('/:id/share', shareProperty);

/**
	* @route   POST /api/properties/:id/view
	* @desc    Track property view
	* @access  Public
	*/
router.post('/:id/view', trackPropertyView);

/**
	* @route   GET /api/properties/occupied-by/:userId
	* @desc    Get properties occupied by user
	* @access  Private
	*/
router.get('/occupied-by/:userId', auth, getPropertiesOccupiedByUser);

module.exports = router;
