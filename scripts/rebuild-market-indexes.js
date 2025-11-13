/**
	* Rebuild MarketItem indexes:
	* - Drops any existing compound/text index that mixes text and array fields
		* - Creates a text index on { title, description, tags }
		* - Creates single-field indexes for tags, category and school
	*
	* Usage: node backend/scripts/rebuild-market-indexes.js
	*/

const mongoose = require('mongoose');
const MarketItem = require('../src/models/MarketItem');

async function run() {
	const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/realagent';
	console.log('Connecting to', MONGO_URI);
	await mongoose.connect(MONGO_URI, {});
	const coll = mongoose.connection.collection('marketitems');

	try {
		// List existing indexes
		const indexes = await coll.indexes();
		console.log('Existing indexes:', indexes.map(i => i.name));

		// Attempt to drop any index that appears to mix text and other fields
		for (const idx of indexes) {
			// heuristic: index name contains 'text' and also other field names joined with '_' -> drop it
			if (/text/.test(idx.name) && /tags|category|school/.test(idx.name)) {
				console.log('Dropping index:', idx.name);
				try {
					await coll.dropIndex(idx.name);
				} catch (err) {
					console.warn('Failed to drop index', idx.name, err.message);
				}
			}
		}

		// Create desired indexes
		console.log('Creating text index { title: "text", description: "text", tags: "text" }');
		// Note: only one text index is allowed per collection.
		await coll.createIndex({ title: 'text', description: 'text', tags: 'text' });

		console.log('Creating single-field indexes: tags, category, school');
		// It's okay to have a separate b-tree index on tags for equality/containment queries
		// alongside the text index; keep it if you rely on equality filters on tags.
		await coll.createIndex({ tags: 1 });
		await coll.createIndex({ category: 1 });
		await coll.createIndex({ school: 1 });

		console.log('Index rebuild complete.');
	} catch (err) {
		console.error('Index rebuild failed:', err);
	} finally {
		await mongoose.connection.close();
		process.exit(0);
	}
}

run();
