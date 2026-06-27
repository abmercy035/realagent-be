const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const authNewRoutes = require('./authNew'); // NEW: Google OAuth, refresh, logout (dual-token)
const verificationRoutes = require('./verification');
const adminRoutes = require('./admin');
const agentsRoutes = require('./agents');
const fraudRoutes = require('./fraud');
const contactRoutes = require('./contact');
const propertyRoutes = require('./properties');
const commentRoutes = require('./comments');
const bookmarkRoutes = require('./bookmarks');
const ratingRoutes = require('./ratings');
const roommatePostRoutes = require('./roommatePosts');
const marketRoutes = require('./market');
const marketReviewsRoutes = require('./marketReviews'); // NEW: market listing reviews
const feeRoutes = require('./fees');
const uploadsRoutes = require('./uploads');
const cloudinarySignatureRoutes = require('./cloudinarySignature'); // NEW: client-side signed uploads
const viewingRequestsRoutes = require('./viewingRequests');
const paymentRoutes = require('./payments');
const creditRoutes = require('./creditRoutes');
const creditRechargeRoutes = require('./creditRecharge'); // NEW: Paystack credit recharge
const webhookRoutes = require('./webhooks'); // NEW: Paystack webhooks (credit-recharge + subscription)
const pushRoutes = require('./push'); // NEW: Web Push subscriptions
const cronRoutes = require('./cron'); // NEW: Cron jobs (notifications + trial expiry)
// const subscriptionRoutes = require('./subscriptions');
// const plansRoutes = require('./plans');
const userRoutes = require('./users');

// Mount routes
router.use('/auth', authNewRoutes); // NEW: Google OAuth, refresh, logout, login, register (dual-token)
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/agents', agentsRoutes); // Agent search & verification routes
router.use('/agents', verificationRoutes); // Agent verification routes
router.use('/admin', verificationRoutes); // Admin verification routes
router.use('/admin', adminRoutes); // Admin general routes (users, analytics)
router.use('/reports', fraudRoutes); // User fraud reporting
router.use('/admin', fraudRoutes); // Admin fraud management
router.use('/contact', contactRoutes); // Contact form
router.use('/properties', propertyRoutes); // Property discovery
router.use('/comments', commentRoutes); // Comments and replies
router.use('/bookmarks', bookmarkRoutes); // User bookmarks
router.use('/ratings', ratingRoutes); // Agent ratings and reviews
router.use('/roommate-posts', roommatePostRoutes); // Roommate post creation
router.use('/market', marketRoutes); // Campus market listings
router.use('/market/:id/reviews', marketReviewsRoutes); // NEW: market listing reviews (uses :id param)
router.use('/market/credits', creditRechargeRoutes); // NEW: Paystack credit recharge
router.use('/fees', feeRoutes); // Listing and roommate post fees
router.use('/uploads', uploadsRoutes); // Media uploads (images/videos)
router.use('/uploads', cloudinarySignatureRoutes); // NEW: client-side signed uploads
router.use('/viewing-requests', viewingRequestsRoutes); // Viewing / inquiry requests
router.use('/payments', paymentRoutes); // Payments (create intent, webhook)
router.use('/credits', creditRoutes); // Credit management and purchases
router.use('/push', pushRoutes); // NEW: Web Push subscriptions
router.use('/cron', cronRoutes); // NEW: Cron jobs (notifications + trial expiry)
router.use('/webhooks', webhookRoutes); // NEW: Paystack webhooks (credit-recharge + subscription)
// router.use('/subscriptions', subscriptionRoutes); // User subscription management
// router.use('/admin/plans', plansRoutes); // Admin plan management

// Health check endpoint
router.get('/health', (req, res) => {
	res.json({
		status: 'success',
		message: 'CampusAgent API is running',
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
