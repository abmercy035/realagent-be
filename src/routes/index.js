const express = require('express');
const router = express.Router();

// Import route modules
const marketRoutes = require('./market');
  
router.use('/market', marketRoutes); // Campus market listings

// Health check endpoint
router.get('/health', (req, res) => {
	res.json({
		status: 'success',
		message: 'Campus agent API is running',
		timestamp: new Date().toISOString(),
		environment: process.env.NODE_ENV || 'development',
	});
});

module.exports = router;
