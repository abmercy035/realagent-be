/**
	* Migration Script: Subscription to Credit System
	* 
	* This script migrates users from the subscription-based model to the credit-based system.
	* 
	* What it does:
	* 1. Adds initial credits (10) to all users who don't have credits set
	* 2. Removes subscription fields from user documents
	* 3. Creates initial credit transaction records
	* 
	* Usage:
	* node backend/scripts/migrate-subscription-to-credits.js
	*/

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const CreditTransaction = require('../src/models/CreditTransaction');
const creditsConfig = require('../src/config/credits');

async function migrateToCredits() {
	try {
		console.log('🚀 Starting migration from subscription to credit system...\n');

		// Connect to database
		const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campusagent';
		await mongoose.connect(dbUri);
		console.log('✅ Connected to database\n');

		// Get all users
		const users = await User.find({});
		console.log(`📊 Found ${users.length} users to migrate\n`);

		let migratedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const user of users) {
			try {
				let needsUpdate = false;
				const updates = {};

				// Add credits if not set
				if (typeof user.credits !== 'number') {
					updates.credits = creditsConfig.initialCredits;
					updates.totalCreditsEarned = creditsConfig.initialCredits;
					updates.totalCreditsSpent = 0;
					needsUpdate = true;

					// Create initial credit transaction
					await CreditTransaction.create({
						user: user._id,
						type: 'initial',
						amount: creditsConfig.initialCredits,
						balanceBefore: 0,
						balanceAfter: creditsConfig.initialCredits,
						description: 'Initial credits on account creation',
					});

					console.log(`✅ Added ${creditsConfig.initialCredits} initial credits to user: ${user.email}`);
				}

				// Remove subscription field
				if (user.subscription) {
					updates.$unset = { subscription: 1 };
					needsUpdate = true;
					console.log(`🗑️  Removed subscription data from user: ${user.email}`);
				}

				if (needsUpdate) {
					await User.updateOne({ _id: user._id }, updates);
					migratedCount++;
				} else {
					skippedCount++;
				}
			} catch (error) {
				console.error(`❌ Error migrating user ${user.email}:`, error.message);
				errorCount++;
			}
		}

		console.log('\n📈 Migration Summary:');
		console.log(`   ✅ Migrated: ${migratedCount}`);
		console.log(`   ⏭️  Skipped (already migrated): ${skippedCount}`);
		console.log(`   ❌ Errors: ${errorCount}`);
		console.log('\n✨ Migration completed!\n');

		// Disconnect
		await mongoose.disconnect();
		console.log('👋 Disconnected from database');
		process.exit(0);
	} catch (error) {
		console.error('💥 Migration failed:', error);
		process.exit(1);
	}
}

// Run migration
migrateToCredits();
