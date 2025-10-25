const ViewingRequest = require('../models/ViewingRequest');
const Property = require('../models/Property');
const User = require('../models/User');
const { sendViewingRequestCreatedEmail, sendViewingRequestStatusEmail } = require('../utils/email');

/**
	* Create a new viewing request
	* POST /api/viewing-requests
	*/
const createViewingRequest = async (req, res) => {
	try {
		const user = req.user;
		const {
			propertyId,
			requestedDate,
			requestedTime,
			message,
			contactMethod,
			agent: providedAgent,
		} = req.body;

		if (!propertyId) {
			return res.status(400).json({ status: 'error', message: 'propertyId is required' });
		}

		// Ensure property exists (also fetch title for emails)
		const property = await Property.findById(propertyId).select('agent title location');
		if (!property) {
			return res.status(404).json({ status: 'error', message: 'Property not found' });
		}

		const agent = providedAgent || property.agent;

		const viewing = new ViewingRequest({
			user: user._id,
			agent,
			propertyId,
			requestedDate: requestedDate ? new Date(requestedDate) : undefined,
			requestedTime: requestedTime || undefined,
			message: message || undefined,
			contactMethod: contactMethod || undefined,
		});

		await viewing.save();

		// fetch property title for status-update notifications
		let notifProperty = null;
		try {
			notifProperty = await Property.findById(viewing.propertyId).select('title').lean();
		} catch (e) {
			console.error('Failed to fetch property for notifications', e);
		}


		// Notify agent and user (best-effort) via email only
		try {
			// Resolve agent email from User model if possible
			let agentEmail = null;
			if (viewing.agent) {
				try {
					const agentUser = await User.findById(viewing.agent).select('email name').lean();
					if (agentUser && agentUser.email) agentEmail = agentUser.email;
				} catch (e) {
					console.error('Failed to fetch agent user for notification', e);
				}
			}

			if (agentEmail) {
				// Send tailored email to agent
				const payload = {
					recipientName: agentEmail, // ideally agent name; we have email here — fine for now
					requesterName: user.name || user._id,
					propertyTitle: property.title || String(viewing.propertyId),
					requestedDate: viewing.requestedDate ? new Date(viewing.requestedDate).toDateString() : '',
					requestedTime: viewing.requestedTime || '',
					message: viewing.message || '',
					dashboardLink: `${process.env.FRONTEND_URL}/dashboard/agent/viewing-requests`,
				};
				sendViewingRequestCreatedEmail(agentEmail, payload, "agent").catch((e) => console.error('Agent email error', e));
			}

			// Notify requester (confirmation)
			const userEmail = user && user.email;
			if (userEmail) {
				const payload = {
					recipientName: user.name || user._id,
					requesterName: user.name || user._id,
					propertyTitle: property.title || String(viewing.propertyId),
					requestedDate: viewing.requestedDate ? new Date(viewing.requestedDate).toDateString() : '',
					requestedTime: viewing.requestedTime || '',
					message: viewing.message || '',
					dashboardLink: `${process.env.FRONTEND_URL}/dashboard/user/viewing-requests`,
				};
				sendViewingRequestCreatedEmail(userEmail, payload, "user").catch((e) => console.error('User email error', e));
			}
		} catch (notifyErr) {
			console.error('Notification error (non-fatal):', notifyErr);
		}

		return res.status(201).json({ status: 'success', data: viewing });
	} catch (err) {
		console.error('Error creating viewing request:', err);
		return res.status(500).json({ status: 'error', message: 'Internal server error' });
	}
};

/**
	* List viewing requests for the current user or agent
	* GET /api/viewing-requests
	*/
const listViewingRequests = async (req, res) => {
	try {
		const user = req.user;
		const { status, page = 1, limit = 20, propertyId } = req.query;

		const query = {};
		// If agent, show requests assigned to them
		if (user.role === 'agent') {
			query.agent = user._id;
		} else {
			// Regular users see their own requests
			query.user = user._id;
		}

		if (status) query.status = status;
		if (propertyId) query.propertyId = propertyId;

		const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
		
		const [total, results] = await Promise.all([
			ViewingRequest.countDocuments(query),
			ViewingRequest.find(query)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(Number(limit))
				.populate('user', 'name email')
				.populate('agent', 'name email')
				.populate('propertyId', 'title location'),
		]);

		return res.json({ status: 'success', total, page: Number(page), limit: Number(limit), results });
	} catch (err) {
		console.error('Error listing viewing requests:', err);
		return res.status(500).json({ status: 'error', message: 'Internal server error' });
	}
};

/**
	* Update a viewing request (status or details)
	* PATCH /api/viewing-requests/:id
	*/
const updateViewingRequest = async (req, res) => {
	try {
		const user = req.user;
		const { id } = req.params;
		const { status, requestedDate, requestedTime, message, contactMethod } = req.body;

		const viewing = await ViewingRequest.findById(id);
		if (!viewing) {
			return res.status(404).json({ status: 'error', message: 'Viewing request not found' });
		}

		// Authorization: agents (for their requests) and admins can change any status.
		// Users can cancel their own pending requests.
		const isAgentOrAdmin = user.role === 'agent' || user.role === 'admin';
		const isOwner = viewing.user.toString() === user._id.toString();

		if (!isAgentOrAdmin && !isOwner) {
			return res.status(403).json({ status: 'error', message: 'Not authorized to modify this request' });
		}

		const previousStatus = viewing.status;

		if (status) {
			// If user is owner, only allow cancelling
			if (!isAgentOrAdmin && status !== 'cancelled') {
				return res.status(403).json({ status: 'error', message: 'Users may only cancel requests' });
			}
			viewing.status = status;
		}

		if (requestedDate) viewing.requestedDate = new Date(requestedDate);
		if (requestedTime) viewing.requestedTime = requestedTime;
		if (typeof message !== 'undefined') viewing.message = message;
		if (contactMethod) viewing.contactMethod = contactMethod;

		await viewing.save();

		// If status changed, notify requester and agent
		try {
			if (typeof status !== 'undefined' && previousStatus !== status) {
				// Notify user
				const requester = viewing.user;
				// If populated, requester may be an object; otherwise it is an id. Try to safely get email/phone
				let userEmail = null;
				let userPhone = null;
				if (requester && typeof requester === 'object') {
					userEmail = requester.email;
					userPhone = requester.phone;
				}
				// Fallback to req.user if same user
				if (!userEmail && req.user && req.user._id && viewing.user.toString() === req.user._id.toString()) {
					userEmail = req.user.email;
					userPhone = req.user.phone;
				}

				if (userEmail) {
					const payload = {
						recipientName: user.name || user._id,
						propertyTitle: notifProperty?.title || String(viewing.propertyId),
						requestedDate: viewing.requestedDate ? new Date(viewing.requestedDate).toDateString() : '',
						requestedTime: viewing.requestedTime || '',
						status: viewing.status,
						dashboardLink: `${process.env.FRONTEND_URL}/dashboard/user/viewing-requests`,
					};
					sendViewingRequestStatusEmail(userEmail, payload).catch((e) => console.error('Email notify error', e));
				}

				// Notify agent by resolving email
				try {
					let agentEmailResolved = null;
					if (viewing.agent) {
						const agentUser = await User.findById(viewing.agent).select('email name').lean();
						if (agentUser && agentUser.email) agentEmailResolved = agentUser.email;
					}
					if (agentEmailResolved) {
						const payload = {
							recipientName: agentEmailResolved,
							propertyTitle: notifProperty?.title || String(viewing.propertyId),
							requestedDate: viewing.requestedDate ? new Date(viewing.requestedDate).toDateString() : '',
							requestedTime: viewing.requestedTime || '',
							status: viewing.status,
							dashboardLink: `${process.env.FRONTEND_URL}/dashboard/agent/viewing-requests`,
						};
						sendViewingRequestStatusEmail(agentEmailResolved, payload).catch((e) => console.error('Agent email notify error', e));
					}
				} catch (e) {
					console.error('Failed to resolve agent email on update notification', e);
				}
			}
		} catch (notifyErr) {
			console.error('Notification error on update (non-fatal):', notifyErr);
		}

		return res.json({ status: 'success', data: viewing });
	} catch (err) {
		console.error('Error updating viewing request:', err);
		return res.status(500).json({ status: 'error', message: 'Internal server error' });
	}
};

module.exports = {
	createViewingRequest,
	listViewingRequests,
	updateViewingRequest,
};
