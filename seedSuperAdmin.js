/**
	* Seed Super Admin Script
	* Sets the first super admin for the platform
	* 
	* Usage: node seedSuperAdmin.js
	*/

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function seedSuperAdmin() {
	try {
		// Connect to database
		await mongoose.connect(process.env.MONGODB_URI);
		console.log('✅ Connected to MongoDB');

		// Super admin details
		const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'campusagent.app@gmail.com';
		const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Campusagent2025.com';
		const superAdminName = process.env.SUPER_ADMIN_NAME || 'CampusAgent';

		// Check if super admin already exists
		let superAdmin = await User.findOne({ email: superAdminEmail });

		if (superAdmin) {
			console.log('⚠️  Super admin already exists');

			// Update to super admin if not already
			if (superAdmin.role !== 'admin' || superAdmin.adminRole !== 'super') {
				superAdmin.role = 'admin';
				superAdmin.adminRole = 'super';
				superAdmin.emailVerified = true;
				await superAdmin.save();
				console.log('✅ Updated existing user to super admin');
			} else {
				console.log('✅ User is already a super admin');
			}
		} else {
			// Create new super admin
			// const hashedPassword = await bcrypt.hash(superAdminPassword, 12);

			superAdmin = await User.create({
				name: superAdminName,
				email: superAdminEmail,
				password: superAdminPassword,
				role: 'admin',
				adminRole: 'super',
				emailVerified: true,
				status: 'active',
			});

			console.log('✅ Super admin created successfully');
		}

		console.log('\n📋 Super Admin Details:');
		console.log(`   Email: ${superAdminEmail}`);
		console.log(`   Password: ${superAdminPassword}`);
		console.log(`   Role: ${superAdmin.role}`);
		console.log(`   Admin Role: ${superAdmin.adminRole}`);
		console.log('\n⚠️  IMPORTANT: Change the password after first login!');

		process.exit(0);
	} catch (error) {
		console.error('❌ Error seeding super admin:', error);
		process.exit(1);
	}
}

// Run the seed function
seedSuperAdmin();
