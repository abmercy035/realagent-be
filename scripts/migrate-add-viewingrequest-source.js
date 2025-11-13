/*
	Migration script: add `source` field to existing ViewingRequest documents.
	- Sets `source: 'roommate-post'` if message contains 'roommate post' (case-insensitive)
	- Otherwise sets `source: 'other'`

	Usage: node backend/scripts/migrate-add-viewingrequest-source.js
	Make sure MONGODB_URI is set in env or adjust connection string below.
*/

const mongoose = require('mongoose');
const ViewingRequest = require('../src/models/ViewingRequest');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/realagent';

(async function run() {
	try {
		await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
		console.log('Connected to MongoDB');

		const cursor = ViewingRequest.find({ source: { $exists: false } }).cursor();
		let count = 0;
		for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
			const msg = (doc.message || '').toLowerCase();
			if (msg.includes('roommate post') || msg.includes('roommate')) {
				doc.source = 'roommate-post';
			} else {
				doc.source = 'other';
			}
			await doc.save();
			count++;
			if (count % 100 === 0) console.log(`Updated ${count} documents`);
		}

		console.log(`Migration complete. Updated ${count} ViewingRequest documents.`);
		process.exit(0);
	} catch (err) {
		console.error('Migration error:', err);
		process.exit(1);
	}
})();
