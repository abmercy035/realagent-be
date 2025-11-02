const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

/**
	* Script to assign usernames to existing agents who don't have one
	* Generates username from name or email, ensuring uniqueness
	*/

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/realagent', {
	useNewUrlParser: true,
	useUnifiedTopology: true,
})
	.then(() => console.log('✅ Connected to MongoDB'))
	.catch(err => {
		console.error('❌ MongoDB connection error:', err);
		process.exit(1);
	});

/**
	* Generate a clean username from a string
	*/
function generateBaseUsername(str) {
	if (!str) return 'agent';

	return str
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
		.slice(0, 20); // Limit length
}

/**
	* Ensure username is unique by appending numbers if needed
	*/
async function ensureUniqueUsername(baseUsername) {
	let username = baseUsername;
	let counter = 1;

	while (true) {
		const existing = await User.findOne({ username });
		if (!existing) {
			return username;
		}
		username = `${baseUsername}${counter}`;
		counter++;

		// Safety limit
		if (counter > 9999) {
			throw new Error(`Could not generate unique username for base: ${baseUsername}`);
		}
	}
}

/**
	* Main function to assign usernames
	*/
async function assignUsernames() {
	try {
		console.log('\n🔍 Finding agents without usernames...\n');

		// Find all agents without username or with empty username
		const agentsWithoutUsername = await User.find({
			role: 'agent',
			$or: [
				{ username: { $exists: false } },
				{ username: null },
				{ username: '' }
			]
		});

		if (agentsWithoutUsername.length === 0) {
			console.log('✅ All agents already have usernames!');
			return;
		}

		console.log(`📊 Found ${agentsWithoutUsername.length} agents without usernames\n`);

		let successCount = 0;
		let errorCount = 0;

		for (const agent of agentsWithoutUsername) {
			try {
				// Generate base username from name or email
				let baseUsername;

				if (agent.name) {
					baseUsername = generateBaseUsername(agent.name);
				} else if (agent.fullName) {
					baseUsername = generateBaseUsername(agent.fullName);
				} else if (agent.firstName && agent.lastName) {
					baseUsername = generateBaseUsername(`${agent.firstName}${agent.lastName}`);
				} else if (agent.email) {
					const emailPrefix = agent.email.split('@')[0];
					baseUsername = generateBaseUsername(emailPrefix);
				} else {
					baseUsername = `agent${agent._id.toString().slice(-6)}`;
				}

				// Ensure it's unique
				const uniqueUsername = await ensureUniqueUsername(baseUsername);

				// Update the agent
				agent.username = uniqueUsername;
				await agent.save();

				console.log(`✅ ${agent.name || agent.email || agent._id}: ${uniqueUsername}`);
				successCount++;

			} catch (err) {
				console.error(`❌ Failed for agent ${agent._id}:`, err.message);
				errorCount++;
			}
		}

		console.log('\n' + '='.repeat(50));
		console.log(`✅ Successfully assigned: ${successCount}`);
		if (errorCount > 0) {
			console.log(`❌ Failed: ${errorCount}`);
		}
		console.log('='.repeat(50) + '\n');

	} catch (error) {
		console.error('❌ Script error:', error);
	} finally {
		await mongoose.connection.close();
		console.log('👋 Database connection closed');
		process.exit(0);
	}
}

// Run the script
assignUsernames();
