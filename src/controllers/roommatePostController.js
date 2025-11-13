const Property = require('../models/Property');
const RoommatePost = require('../models/RoommatePost');
const ViewingRequest = require('../models/ViewingRequest');
const { sendViewingRequestCreatedEmail } = require('../utils/email');

// Get all roommate posts (with pagination and optional filters)
exports.getRoommatePosts = async (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 12;
		const skip = (page - 1) * limit;

		// Support filtering by status. Defaults to 'active' if not specified.
		const filter = {};
		if (typeof req.query.status !== 'undefined') {
			// allow status=all to mean no status filter
			if (req.query.status !== 'all') filter.status = req.query.status;
		} else {
			filter.status = 'active';
		}
		if (req.query.property) filter.property = req.query.property;
		if (req.query.occupant) filter.occupant = req.query.occupant;
		if (req.query.tag) filter.tags = req.query.tag;

		const posts = await RoommatePost.find(filter)
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.populate('property occupant');
		const total = await RoommatePost.countDocuments(filter);
		res.json({ data: posts, total, page, limit });
	} catch (err) {
		console.error('Get roommate posts error:', err);
		res.status(500).json({ error: 'Failed to fetch roommate posts.' });
	}
};

// Helper: Check if user is occupant of property. Support both new `occupiedBy` and legacy `vacancy.currentTenant.userId`.
async function isUserOccupant(propertyId, userId) {
	const property = await Property.findById(propertyId).select('occupiedBy vacancy');
	if (!property) return false;
	if (property.occupiedBy && property.occupiedBy.toString() === userId.toString()) return true;
	if (property.vacancy && property.vacancy.currentTenant && property.vacancy.currentTenant.userId && property.vacancy.currentTenant.userId.toString() === userId.toString()) return true;
	return false;
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
			status,
			external = false,
			externalDetails = null,
		} = req.body;
		const userId = req.user._id;

		// If post is not external, verify user is occupant of the referenced property
		if (!external) {
			if (!propertyId) {
				return res.status(400).json({ error: 'Property id is required for non-external roommate posts.' });
			}
			const isOccupant = await isUserOccupant(propertyId, userId);
			if (!isOccupant) {
				return res.status(403).json({ error: 'You must be the current occupant of the property to create a roommate post.' });
			}
		}

		const postPayload = {
			title,
			description,
			price,
			media,
			roommatePreferences,
			contact,
			status,
			external,
			occupant: userId,
		};

		if (!external && propertyId) postPayload.property = propertyId;
		if (external && externalDetails) postPayload.externalDetails = externalDetails;

		const post = await RoommatePost.create(postPayload);
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

// Delete roommate post (occupant or admin)
exports.deleteRoommatePost = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;

		const post = await RoommatePost.findById(id);
		if (!post) return res.status(404).json({ error: 'Post not found' });

		// Allow delete if occupant or admin
		if (post.occupant.toString() !== userId.toString() && req.user.role !== 'admin') {
			return res.status(403).json({ error: 'Not authorized to delete this post' });
		}

		post.status = 'deleted';
		await post.save();
		res.status(200).json({ data: post });
	} catch (err) {
		console.error('Delete roommate post error:', err);
		res.status(500).json({ error: 'Failed to delete roommate post.' });
	}
};

// Mark an interest as handled
exports.markInterestHandled = async (req, res) => {
	try {
		const { postId, interestId } = req.params;
		const userId = req.user._id;

		const post = await RoommatePost.findById(postId);
		if (!post) return res.status(404).json({ error: 'Post not found' });

		// Only occupant or admin can mark handled
		if (post.occupant.toString() !== userId.toString() && req.user.role !== 'admin') {
			return res.status(403).json({ error: 'Not authorized' });
		}

		const interest = post.interests.id(interestId);
		if (!interest) return res.status(404).json({ error: 'Interest not found' });

		interest.handled = true;
		interest.handledBy = userId;
		interest.handledAt = new Date();

		await post.save();
		res.status(200).json({ data: interest });
	} catch (err) {
		console.error('Mark interest handled error:', err);
		res.status(500).json({ error: 'Failed to mark interest as handled' });
	}
};

// Export interests CSV for a post
exports.exportInterestsCsv = async (req, res) => {
	try {
		const { postId } = req.params;
		const post = await RoommatePost.findById(postId).populate('interests.fromUser', 'name email phone');
		if (!post) return res.status(404).json({ error: 'Post not found' });

		// Only occupant or admin
		const userId = req.user._id;
		if (post.occupant.toString() !== userId.toString() && req.user.role !== 'admin') {
			return res.status(403).json({ error: 'Not authorized' });
		}

		// Build CSV
		const rows = [];
		rows.push(['Requester Name', 'Requester Email', 'Phone', 'Message', 'Contact Pref', 'Handled', 'Handled By', 'Handled At', 'Created At']);
		for (const it of post.interests) {
			rows.push([
				it.fromUser ? (it.fromUser.name || '') : '',
				it.fromUser ? (it.fromUser.email || '') : '',
				it.fromUser ? (it.fromUser.phone || '') : '',
				(it.message || '').replace(/\r?\n|,/g, ' '),
				it.contactPref || '',
				it.handled ? 'yes' : 'no',
				it.handledBy ? it.handledBy.toString() : '',
				it.handledAt ? it.handledAt.toISOString() : '',
				it.createdAt ? it.createdAt.toISOString() : '',
			]);
		}

		const csv = rows.map(r => r.join(',')).join('\n');
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', `attachment; filename="roommate-post-${postId}-interests.csv"`);
		res.status(200).send(csv);
	} catch (err) {
		console.error('Export interests CSV error:', err);
		res.status(500).json({ error: 'Failed to export CSV' });
	}
};

// Express interest in a roommate post
// Creates a lightweight interest record (stored on the post as a simple subdocument) and returns contact info where allowed
exports.expressInterest = async (req, res) => {
	try {
		const { id } = req.params; // roommate post id
		const { message = '', contactPref = 'in-app' } = req.body;
		const fromUserId = req.user._id;

		const post = await RoommatePost.findById(id).populate('occupant property');
		if (!post || post.status !== 'active') return res.status(404).json({ error: 'Post not found or not active' });

		// Create a ViewingRequest so occupants (treated like agent here) receive standard notifications
		const contactMethodMap = {
			'in-app': 'in-app',
			whatsapp: 'whatsapp',
			phone: 'phone',
			email: 'email',
			other: 'other',
		};

		const viewing = new ViewingRequest({
			user: fromUserId,
			agent: post.occupant ? post.occupant._id : undefined,
			propertyId: post.property ? post.property._id : undefined,
			message: `Interest in roommate post ${post._id}: ${message}`,
			contactMethod: contactMethodMap[contactPref] || 'in-app',
			source: 'roommate-post',
		});

		await viewing.save();

		// Attach a lightweight interest record to the post for quick reference
		post.interests = post.interests || [];
		post.interests.push({ fromUser: fromUserId, message, contactPref, createdAt: new Date() });
		await post.save();

		// Populate property for notification payload
		let notifProperty = null;
		try {
			notifProperty = await Property.findById(viewing.propertyId).select('title location').lean();
		} catch (e) {
			console.error('Failed to fetch property for roommate interest notification', e);
		}

		// Notify occupant by email if they have an email
		try {
			let occupantEmail = null;
			if (post.occupant && post.occupant.email) occupantEmail = post.occupant.email;
			if (occupantEmail) {
				const payload = {
					recipientName: post.occupant.name || occupantEmail,
					requesterName: req.user.name || req.user._id,
					propertyTitle: notifProperty?.title || String(viewing.propertyId),
					requestedDate: viewing.requestedDate ? new Date(viewing.requestedDate).toDateString() : '',
					requestedTime: viewing.requestedTime || '',
					message: viewing.message || '',
					dashboardLink: `${process.env.FRONTEND_URL}/dashboard/agent/viewing-requests`,
				};
				sendViewingRequestCreatedEmail(occupantEmail, payload, 'agent').catch((e) => console.error('Occupant email error', e));
			}

			// Notify requester as confirmation
			const requesterEmail = req.user && req.user.email;
			if (requesterEmail) {
				const payload = {
					recipientName: req.user.name || req.user._id,
					requesterName: req.user.name || req.user._id,
					propertyTitle: notifProperty?.title || String(viewing.propertyId),
					requestedDate: viewing.requestedDate ? new Date(viewing.requestedDate).toDateString() : '',
					requestedTime: viewing.requestedTime || '',
					message: viewing.message || '',
					dashboardLink: `${process.env.FRONTEND_URL}/dashboard/user/viewing-requests`,
				};
				sendViewingRequestCreatedEmail(requesterEmail, payload, 'user').catch((e) => console.error('Requester email error', e));
			}
		} catch (notifyErr) {
			console.error('Notification error for roommate interest (non-fatal):', notifyErr);
		}

		// Determine contact payload to return (respect occupant privacy)
		const contactPayload = { inApp: true };
		if (contactPref === 'whatsapp' && post.contactMethods && post.contactMethods.whatsapp && post.occupant && post.occupant.phone && post.property && post.property.occupantContactShared) {
			contactPayload.whatsapp = `https://wa.me/${post.occupant.phone.replace(/[^0-9]/g, '')}`;
		}
		if (contactPref === 'phone' && post.contactMethods && post.contactMethods.phone && post.occupant && post.occupant.phone && post.property && post.property.occupantContactShared) {
			contactPayload.phone = post.occupant.phone;
		}

		res.status(201).json({ success: true, data: { viewingRequestId: viewing._id, contact: contactPayload } });
	} catch (err) {
		console.error('Express interest error:', err);
		res.status(500).json({ error: 'Failed to express interest' });
	}
};
