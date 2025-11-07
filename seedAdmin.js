/**
	* Seed Script - Create an admin user
	* Usage:
	*   - Configure MONGODB_URI in environment or use default mongodb://localhost:27017/realagent
	*   - Optionally set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME in env
	*   - Run: node seedAdmin.js
	*/

const mongoose = require('mongoose');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@campusagent.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'AdminPass123!';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'CampusAgent Admin';

async function seedAdmin() {
	try {
		const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/realagent';
		await mongoose.connect(mongoUri, { autoIndex: true });
		console.log('✅ Connected to MongoDB');

		// Check if an admin user already exists (by role or email)
		let existingByEmail = await User.findOne({ email: ADMIN_EMAIL });
		let existingAdmin = await User.findOne({ role: 'admin' });

		if (existingByEmail) {
			console.log(`ℹ️  A user with the email ${ADMIN_EMAIL} already exists: (${existingByEmail.role}). Skipping creation.`);
			process.exit(0);
		}

		if (existingAdmin) {
			console.log(`ℹ️  An admin user already exists (${existingAdmin.email}). Skipping creation.`);
			process.exit(0);
		}

		// const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

		const admin = await User.create({
			name: ADMIN_NAME,
			email: ADMIN_EMAIL,
			password: ADMIN_PASSWORD,
			role: 'admin',
			verified: true,
			status: 'active',
		});

		console.log('✅ Admin user created successfully');
		console.log('   Email:', admin.email);
		console.log('   Name:', admin.name);
		console.log('   Role:', admin.role);
		console.log('\n⚠️  The password used for the seeded admin is the one from SEED_ADMIN_PASSWORD env or the default. Change it after first login.');

		process.exit(0);
	} catch (error) {
		console.error('❌ Error creating admin user:', error);
		process.exit(1);
	}
}

seedAdmin();
