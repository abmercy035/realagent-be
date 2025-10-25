const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const verificationRoutes = require('./verification');
const agentsRoutes = require('./agents');
const fraudRoutes = require('./fraud');
const contactRoutes = require('./contact');
const propertyRoutes = require('./properties');
const commentRoutes = require('./comments');
const bookmarkRoutes = require('./bookmarks');
const ratingRoutes = require('./ratings');
const roommatePostRoutes = require('./roommatePosts');
const feeRoutes = require('./fees');
const uploadsRoutes = require('./uploads');
const viewingRequestsRoutes = require('./viewingRequests');
// const paymentRoutes = require('./payments');

// Mount routes
router.use('/auth', authRoutes);
router.use('/agents', agentsRoutes); // Agent search & verification routes
router.use('/agents', verificationRoutes); // Agent verification routes
router.use('/admin', verificationRoutes); // Admin verification routes
router.use('/reports', fraudRoutes); // User fraud reporting
router.use('/admin', fraudRoutes); // Admin fraud management
router.use('/contact', contactRoutes); // Contact form
router.use('/properties', propertyRoutes); // Property discovery
router.use('/comments', commentRoutes); // Comments and replies
router.use('/bookmarks', bookmarkRoutes); // User bookmarks
router.use('/ratings', ratingRoutes); // Agent ratings and reviews
router.use('/roommate-posts', roommatePostRoutes); // Roommate post creation
router.use('/fees', feeRoutes); // Listing and roommate post fees
router.use('/uploads', uploadsRoutes); // Media uploads (images/videos)
router.use('/viewing-requests', viewingRequestsRoutes); // Viewing / inquiry requests
// router.use('/payments', paymentRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
	res.json({
		status: 'success',
		message: 'RealAgent API is running',
		timestamp: new Date().toISOString(),
		environment: process.env.NODE_ENV || 'development',
	});
});

// Test route
router.get('/test', (req, res) => {
	res.json({
		status: 'success',
		message: 'API routes are working!',
		timestamp: new Date().toISOString(),
	});
});

module.exports = router;
