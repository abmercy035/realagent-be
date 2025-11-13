/**
	* Seed featured market items
	* Usage: node backend/scripts/seed-market-featured.js
	*/

require('dotenv').config();
const mongoose = require('mongoose');
const MarketItem = require('../src/models/MarketItem');
const User = require('../src/models/User');

async function seed() {
	const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/realagent';
	await mongoose.connect(mongoUri, { autoIndex: true });
	console.log('Connected to MongoDB for seeding');

	// If there are already market items, don't create duplicates
	const existingCount = await MarketItem.countDocuments();
	if (existingCount >= 3) {
		console.log(`Found ${existingCount} market items — skipping seed.`);
		process.exit(0);
	}

	// Choose an owner: prefer an admin, otherwise any user, otherwise create one
	let owner = await User.findOne({ role: 'admin' });
	if (!owner) owner = await User.findOne({});
	if (!owner) {
		owner = await User.create({
			name: 'Seed User',
			email: `seed+market@campusagent.test`,
			password: 'SeedPass123!',
			role: 'user',
			verified: true,
			status: 'active',
		});
		console.log('Created seed owner user', owner.email);
	}

	const samples = [
		{
			title: 'Introductory Physics Textbook (2nd ed.)',
			description: 'Slightly used physics textbook, great condition. Ideal for first-year students.',
			price: { amount: 2500, currency: 'NGN' },
			images: [{ url: '/uploads/sample/physics.jpg' }],
			thumbnail: '/uploads/sample/physics.jpg',
			category: 'books',
			tags: ['textbook', 'physics', 'education'],
			contact: { phone: '08000000001' },
			owner: owner._id,
			school: 'University of Lagos',
		},
		{
			title: 'Compact Study Desk with Chair',
			description: 'Wooden desk + chair set. Foldable, easy to move. Minor scuffs but fully functional.',
			price: { amount: 8500, currency: 'NGN' },
			images: [{ url: '/uploads/sample/desk.jpg' }],
			thumbnail: '/uploads/sample/desk.jpg',
			category: 'furniture',
			tags: ['desk', 'furniture'],
			contact: { phone: '08000000002' },
			owner: owner._id,
			school: 'University of Lagos',
		},
		{
			title: 'Used Laptop - Core i5, 8GB RAM',
			description: 'Good working condition laptop. Comes with charger. Perfect for coursework and presentations.',
			price: { amount: 45000, currency: 'NGN' },
			images: [{ url: '/uploads/sample/laptop.jpg' }],
			thumbnail: '/uploads/sample/laptop.jpg',
			category: 'electronics',
			tags: ['laptop', 'electronics', 'computing'],
			contact: { phone: '08000000003' },
			owner: owner._id,
			school: 'University of Lagos',
		},
	];

	for (const s of samples) {
		try {
			await MarketItem.create(s);
			console.log('Inserted sample:', s.title);
		} catch (err) {
			console.error('Failed to insert sample', s.title, err && err.message);
		}
	}

	console.log('Seeding completed');
	process.exit(0);
}

seed().catch((err) => {
	console.error('Seeding error:', err);
	process.exit(1);
});
