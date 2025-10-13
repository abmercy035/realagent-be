const Property = require('../models/Property');
const RoommatePost = require('../models/RoommatePost');

// Helper: Check if user is occupant of property
async function isUserOccupant(propertyId, userId) {
	const property = await Property.findById(propertyId);
	if (!property) return false;
	// Assuming property.occupant is ObjectId of user
	return property.occupant && property.occupant.toString() === userId.toString();
}

// Create Roommate Post (with occupant verification)
exports.createRoommatePost = async (req, res) => {
	try {
		const {
			title,
			description,
			price,
			property: propertyId,
			media,
			roommatePreferences,
			contact,
			status
		} = req.body;
		const userId = req.user._id;
		// Verify user is occupant
		const isOccupant = await isUserOccupant(propertyId, userId);
		if (!isOccupant) {
			return res.status(403).json({ error: 'You must be the current occupant of the property to create a roommate post.' });
		}
		const post = await RoommatePost.create({
			title,
			description,
			price,
			property: propertyId,
			occupant: userId,
			media,
			roommatePreferences,
			contact,
			status
		});
		res.status(201).json({ data: post });
	} catch (err) {
		res.status(500).json({ error: 'Failed to create roommate post.' });
	}
};

// Update Roommate Post
exports.updateRoommatePost = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;
		const updateFields = (({ title, description, price, media, roommatePreferences, contact, status }) => ({ title, description, price, media, roommatePreferences, contact, status }))(req.body);
		// Only allow occupant to update
		const post = await RoommatePost.findOne({ _id: id, occupant: userId });
		if (!post) {
			return res.status(404).json({ error: 'Roommate post not found or not authorized' });
		}
		Object.assign(post, updateFields);
		await post.save();
		res.status(200).json({ data: post });
	} catch (err) {
		res.status(500).json({ error: 'Failed to update roommate post.' });
	}
};
