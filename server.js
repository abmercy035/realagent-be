require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Start server
const server = app.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
	console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
	// Start background pinger to hit /health periodically (keeps app warm / reachable)
	try {
		const { startPinger } = require('./src/utils/pinger');
		// Use environment variables if provided, otherwise defaults inside pinger
		startPinger();
	} catch (err) {
		console.warn('Pinger utility failed to start:', err.message || err);
	}

	// Start periodic grace cleanup (runs hourly). This will delete properties
	// that were created during a grace window if the user's grace has expired
	// and their total properties exceed the free plan limit.
	try {
		// Ensure default plans exist in DB (seed) so admin UI / plan lookups work
		const seedDefaultPlans = async () => {
			try {
				const Plan = require('./src/models/Plan');
				const defaults = [
					{ name: 'free', displayName: 'Free', price: 0, currency: 'NGN', postLimit: 5, description: 'Free plan' },
					{ name: 'trial', displayName: 'Trial', price: 0, currency: 'NGN', postLimit: 15, description: 'Trial plan' },
					{ name: 'pro', displayName: 'Pro', price: 5000, currency: 'NGN', postLimit: 15, description: 'Pro plan' },
					{ name: 'premium', displayName: 'Premium', price: 15000, currency: 'NGN', postLimit: 50, description: 'Premium plan' },
				];

				for (const p of defaults) {
					await Plan.updateOne({ name: p.name }, { $setOnInsert: p }, { upsert: true }).exec();
				}
				console.log('✅ Default plans seeded or already exist');
			} catch (err) {
				console.warn('Failed to seed default plans', err.message || err);
			}
		};

		// Seed plans before running cleanup
		// seedDefaultPlans().catch((e) => console.error('Seeding default plans failed', e));

		const { runGraceCleanup } = require('./src/services/graceCleanup');
		// Run once on startup
		runGraceCleanup().catch((e) => console.error('Initial grace cleanup failed', e));
		// Schedule hourly
		setInterval(() => {
			runGraceCleanup().catch((e) => console.error('Scheduled grace cleanup failed', e));
		}, 1000 * 60 * 60);
	} catch (err) {
		console.warn('Grace cleanup scheduler failed to start:', err.message || err);
	}
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
	console.error('❌ Unhandled Promise Rejection:', err);
	server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
	console.error('❌ Uncaught Exception:', err);
	process.exit(1);
});
