/**
	* Seed Script - Add Sample Properties
	* Run this to populate the database with sample properties for testing
	*/

const mongoose = require('mongoose');
const Property = require('./src/models/Property');
const User = require('./src/models/User');
require('dotenv').config();

// Sample property data
const sampleProperties = [
	{
		title: 'Spacious Self-Contained Apartment Near Campus',
		description: 'A well-furnished self-contained apartment perfect for students. Located just 5 minutes walk from the university gate. Features include: own bathroom, kitchenette, wardrobe, reading desk, and 24/7 electricity supply. The compound is secure with gated access and a dedicated security guard. Water runs daily and the environment is very quiet, ideal for studying.',
		location: {
			address: 'Ifite Road, Near Unizik Main Gate',
			city: 'Awka',
			state: 'Anambra',
			landmark: 'Opposite First Bank Ifite Branch',
		},
		propertyType: 'self-con',
		category: 'student',
		pricing: {
			amount: 180000,
			period: 'per-year',
			negotiable: true,
		},
		details: {
			bedrooms: 1,
			bathrooms: 1,
			toilets: 1,
			furnishingStatus: 'semi-furnished',
		},
		media: {
			images: [
				{ url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', publicId: 'sample_1', caption: 'Exterior View' },
				{ url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', publicId: 'sample_2', caption: 'Interior' },
			],
			videos: [],
		},
		amenities: ['electricity', 'water', 'water-supply', 'security', 'parking', 'generator'],
	},
	{
		title: 'Affordable Single Room for Students',
		description: 'Budget-friendly single room in a shared compound. Perfect for students looking for affordable accommodation. The room comes with a bed space, and you will share bathroom and kitchen facilities with 3 other students. Very close to campus (10 minutes walk), mini-mart nearby, and good transport links. The landlord is student-friendly and understanding.',
		location: {
			address: 'Odim Street, University Road',
			city: 'Nsukka',
			state: 'Enugu',
			landmark: 'Near UNN Business School',
		},
		propertyType: 'a-room',
		category: 'student',
		pricing: {
			amount: 85000,
			period: 'per-year',
			negotiable: false,
		},
		details: {
			bedrooms: 1,
			bathrooms: 0,
			toilets: 0,
			furnishingStatus: 'unfurnished',
		},
		media: {
			images: [
				{ url: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800', publicId: 'sample_3', caption: 'Room View' },
				{ url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800', publicId: 'sample_4', caption: 'Compound' },
			],
			videos: [],
		},
		amenities: ['water', 'water-supply', 'security'],
	},
	{
		title: 'Modern 2-Bedroom Flat with Parking',
		description: 'Beautiful 2-bedroom and parlour flat in a serene estate. This property features a spacious living room, modern kitchen with cabinets, two bedrooms with wardrobes, guest toilet, and a main bathroom. The estate has constant electricity, good road network, and ample parking space. Perfect for small families or students who want to share. The compound is well-maintained with beautiful flowers and a clean environment.',
		location: {
			address: 'Ekosodin Road, GRA',
			city: 'Benin City',
			state: 'Edo',
			landmark: 'Near UNIBEN Campus',
		},
		propertyType: '2-bed-flat',
		category: 'family',
		pricing: {
			amount: 420000,
			period: 'per-year',
			negotiable: true,
		},
		details: {
			bedrooms: 2,
			bathrooms: 1,
			toilets: 2,
			furnishingStatus: 'semi-furnished',
		},
		media: {
			images: [
				{ url: 'https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800', publicId: 'sample_5', caption: 'Living Room' },
				{ url: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800', publicId: 'sample_6', caption: 'Bedroom' },
				{ url: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800', publicId: 'sample_7', caption: 'Kitchen' },
			],
			videos: [],
		},
		amenities: ['electricity', 'water', 'generator', 'water-supply', 'security', 'parking', 'kitchen'],
	},
	{
		title: 'Cozy Room and Parlour - Student Friendly',
		description: 'Neat and affordable room and parlour flat suitable for 2-3 students sharing. Features a bedroom, small parlour/sitting area, kitchen, and bathroom. The property is located in a safe neighborhood with easy access to campus (15 minutes by bike). Landlord allows flexible payment terms for students and the rent is very affordable. The area has shops, eateries, and good network coverage.',
		location: {
			address: 'Samaru Road, Gaskiya',
			city: 'Zaria',
			state: 'Kaduna',
			landmark: 'Near ABU Main Gate',
		},
		propertyType: 'room-parlour',
		category: 'student',
		pricing: {
			amount: 195000,
			period: 'per-year',
			negotiable: true,
		},
		details: {
			bedrooms: 1,
			bathrooms: 1,
			toilets: 1,
			furnishingStatus: 'unfurnished',
		},
		media: {
			images: [
				{ url: 'https://images.unsplash.com/photo-1556912173-46c336c7fd55?w=800', publicId: 'sample_8', caption: 'Parlour' },
				{ url: 'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?w=800', publicId: 'sample_9', caption: 'Bedroom' },
			],
			videos: [],
		},
		amenities: ['water', 'water-supply', 'security', 'kitchen'],
		occupancy: {
			isOccupied: true,
			tenantDuration: 8,
		},
	},
	{
		title: 'Luxury 3-Bedroom Flat in Gated Estate',
		description: 'Premium 3-bedroom and parlour flat located in an exclusive gated estate. This luxury apartment features a large living room with modern furniture, 3 spacious bedrooms (all en-suite), fully fitted kitchen with appliances, dining area, balcony, and guest toilet. The estate provides 24-hour security, constant power supply, treated water, children\'s playground, and dedicated parking. Perfect for families or group of professionals. Swimming pool and gym access included.',
		location: {
			address: 'Bodija Estate, UI Road',
			city: 'Ibadan',
			state: 'Oyo',
			landmark: 'Opposite University of Ibadan Main Gate',
		},
		propertyType: '3-bed-flat',
		category: 'professional',
		pricing: {
			amount: 750000,
			period: 'per-year',
			negotiable: false,
		},
		details: {
			bedrooms: 3,
			bathrooms: 4,
			toilets: 4,
			furnishingStatus: 'furnished',
		},
		media: {
			images: [
				{ url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800', publicId: 'sample_10', caption: 'Living Area' },
				{ url: 'https://images.unsplash.com/photo-1556912167-f556f1f39faa?w=800', publicId: 'sample_11', caption: 'Master Bedroom' },
				{ url: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=800', publicId: 'sample_12', caption: 'Kitchen' },
				{ url: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800', publicId: 'sample_13', caption: 'Bathroom' },
			],
			videos: [],
		},
		amenities: ['electricity', 'water', 'generator', 'water-supply', 'security', 'parking', 'kitchen', 'gym', 'pool', 'air-conditioning'],
		paidContent: {
			isPaidToView: true,
			unlockPrice: 5000,
		},
	},
	{
		title: 'Shared Apartment for Female Students',
		description: 'Safe and secure shared apartment exclusively for female students. This 4-bedroom flat is designed for sharing - each tenant gets their own room while sharing common facilities (kitchen, living room, bathrooms). The property has reliable security with gates that lock at 10pm. Located in a female-dominated area with very good security record. Close to campus, markets, and transport. The landlady is a retired teacher who lives on the compound and ensures everyone\'s safety.',
		location: {
			address: 'Ekpo Abasi Street, Big Qua',
			city: 'Calabar',
			state: 'Cross River',
			landmark: 'Near UNICAL Main Campus',
		},
		propertyType: 'shared-apartment',
		category: 'student',
		pricing: {
			amount: 125000,
			period: 'per-year',
			negotiable: false,
		},
		details: {
			bedrooms: 1,
			bathrooms: 1,
			toilets: 1,
			furnishingStatus: 'unfurnished',
		},
		media: {
			images: [
				{ url: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800', publicId: 'sample_14', caption: 'Shared Living Area' },
				{ url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800', publicId: 'sample_15', caption: 'Private Room' },
			],
			videos: [],
		},
		amenities: ['water', 'water-supply', 'security', 'kitchen', 'gate'],
	},
];

async function seedProperties() {
	try {
		// Connect to MongoDB
		await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/realagent');
		console.log('✅ Connected to MongoDB');

		// Find a verified agent to assign properties to
		// If no agent exists, create a dummy agent
		let agent = await User.findOne({ role: 'agent', verified: true });

		if (!agent) {
			console.log('No verified agent found, creating a sample agent...');
			const bcrypt = require('bcryptjs');
			agent = await User.create({
				name: 'Sample Agent',
				email: 'agent@campusagent.com',
				phone: '08012345678',
				password: await bcrypt.hash('password123', 10),
				role: 'agent',
				verified: true,
				status: 'active',
			});
			console.log('✅ Sample agent created');
		}

		// Clear existing properties (optional - comment out if you want to keep existing data)
		// await Property.deleteMany({});
		// console.log('🗑️  Cleared existing properties');

		// Add sample properties
		const propertiesWithAgent = sampleProperties.map((prop) => ({
			...prop,
			agent: agent._id,
			status: 'active',
			metrics: {
				views: Math.floor(Math.random() * 100) + 10, // Random views between 10-110
				bookmarks: 0,
				shares: 0,
			},
		}));

		const createdProperties = await Property.insertMany(propertiesWithAgent);
		console.log(`✅ Successfully added ${createdProperties.length} properties to the database`);

		// Display summary
		console.log('\n📊 Properties Summary:');
		createdProperties.forEach((prop, index) => {
			console.log(`${index + 1}. ${prop.title}`);
			console.log(`   Type: ${prop.propertyType}`);
			console.log(`   Location: ${prop.location.city}, ${prop.location.state}`);
			console.log(`   Price: ₦${prop.pricing.amount.toLocaleString()}`);
			console.log(`   Status: ${prop.occupancy?.isOccupied ? 'Occupied' : 'Vacant'}`);
			console.log('');
		});

		console.log('✨ Database seeding completed successfully!');
		process.exit(0);
	} catch (error) {
		console.error('❌ Error seeding database:', error);
		process.exit(1);
	}
}

// Run the seed function
seedProperties();
