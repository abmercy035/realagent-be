const User = require('../models/User');
const Property = require('../models/Property');
const AgentVerification = require('../models/AgentVerification');
const Fraud = require('../models/FraudFlag');
const Payment = require('../models/Payment');
const { sendVerificationEmail } = require('../utils/email');
const Contact = require('../models/Contact');

/**
	* List users (admin)
	* GET /api/admin/users
	*/
const listUsers = async (req, res) => {
	try {
		const { page = 1, limit = 20, role, q } = req.query;
		const skip = (Number(page) - 1) * Number(limit);

		const filter = {};
		if (role) filter.role = role;
		if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];

		const users = await User.find(filter)
			.select('-password')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(Number(limit));

		const total = await User.countDocuments(filter);
		res.json({ status: 'success', data: { users, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
	} catch (err) {
		console.error('Admin listUsers error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to list users', error: err.message });
	}
};

/**
	* Get user by ID (admin)
	*/
const getUser = async (req, res) => {
	try {
		const user = await User.findById(req.params.id).select('-password');
		if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
		res.json({ status: 'success', data: { user } });
	} catch (err) {
		console.error('Admin getUser error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to fetch user', error: err.message });
	}
};

/**
	* Update user (admin) - allow status, role, verified, agentIdNumber updates
	*/
const updateUser = async (req, res) => {
	try {
		const allowed = ['status', 'role', 'verified', 'agentIdNumber', 'name', 'phone', 'school'];
		const updates = {};
		for (const key of allowed) {
			if (Object.prototype.hasOwnProperty.call(req.body, key)) updates[key] = req.body[key];
		}

		const user = await User.findById(req.params.id);
		if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

		Object.assign(user, updates);
		await user.save();

		res.json({ status: 'success', message: 'User updated', data: { user: user.toPublicProfile ? user.toPublicProfile() : user } });
	} catch (err) {
		console.error('Admin updateUser error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to update user', error: err.message });
	}
};

/**
	* Basic analytics summary
	*/
const analytics = async (req, res) => {
	try {
		const usersCount = await User.countDocuments();
		const agentsCount = await User.countDocuments({ role: 'agent' });
		const verifiedAgentsCount = await User.countDocuments({ role: 'agent', verified: true });
		const propertiesCount = await Property.countDocuments();
		const verifications = await AgentVerification.getStats();
		const fraudCount = await Fraud.countDocuments();
		// Viewing requests (inquiries/contact-like actions)
		let viewingRequestsCount = 0;
		try {
			const ViewingRequest = require('../models/ViewingRequest');
			viewingRequestsCount = await ViewingRequest.countDocuments();
		} catch (e) {
			viewingRequestsCount = 0;
		}

		// Daily login metrics for the last 14 days
		const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
		const dailyLoginsAgg = await User.aggregate([
			{ $match: { lastLogin: { $gte: since } } },
			{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastLogin" } }, count: { $sum: 1 } } },
			{ $sort: { _id: 1 } },
		]);
		const dailyLogins = dailyLoginsAgg.map((d) => ({ date: d._id, count: d.count }));

		// Contact requests (persisted contact form submissions)
		let contactRequestsCount = 0;
		try {
			contactRequestsCount = await Contact.countDocuments();
		} catch (e) {
			contactRequestsCount = 0;
		}

		res.json({
			status: 'success',
			data: {
				usersCount,
				agentsCount,
				verifiedAgentsCount,
				propertiesCount,
				verifications,
				fraudCount,
				viewingRequestsCount,
				contactRequestsCount,
				dailyLogins,
			},
		});
	} catch (err) {
		console.error('Admin analytics error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to fetch analytics', error: err.message });
	}
};

/**
	* Trigger verification email for a user (if unverified)
	*/
const triggerVerificationEmail = async (req, res) => {
	try {
		const user = await User.findById(req.params.id);
		if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
		if (user.verified) return res.status(400).json({ status: 'error', message: 'User already verified' });

		const token = user.generateVerificationToken();
		await user.save();
		await sendVerificationEmail(user.email, user.name, token);
		res.json({ status: 'success', message: 'Verification email sent' });
	} catch (err) {
		console.error('Admin triggerVerificationEmail error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to send verification email', error: err.message });
	}
};

/**
	* List contact submissions (admin) with pagination and optional CSV export
	* GET /api/admin/contacts
	*/
const listContacts = async (req, res) => {
	try {
		const { page = 1, limit = 20, q } = req.query;
		const exportCsv = req.query.export === 'csv' || req.query.format === 'csv';
		const skip = (Number(page) - 1) * Number(limit);

		const filter = {};
		if (q) {
			const re = new RegExp(q, 'i');
			filter.$or = [{ name: re }, { email: re }, { subject: re }, { message: re }];
		}

		if (exportCsv) {
			// export all matching (cap at 10k)
			const contacts = await Contact.find(filter).sort({ createdAt: -1 }).limit(10000).lean();
			const headers = ['name', 'email', 'subject', 'message', 'phone', 'ip', 'user', 'createdAt'];
			const rows = contacts.map((c) => headers.map((h) => {
				const val = h === 'user' ? (c.user ? String(c.user) : '') : (c[h] == null ? '' : String(c[h]));
				return `"${val.replace(/"/g, '""')}"`;
			}).join(','));
			const csv = [headers.join(','), ...rows].join('\n');
			res.setHeader('Content-Type', 'text/csv');
			res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
			return res.send(csv);
		}

		const contacts = await Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
		const total = await Contact.countDocuments(filter);
		res.json({ status: 'success', data: { contacts, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
	} catch (err) {
		console.error('Admin listContacts error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to list contacts', error: err.message });
	}
};

/**
	* Delete a user (hard delete) - admin only
	* DELETE /api/admin/users/:id
	*/
const deleteUser = async (req, res) => {
	try {
		const id = req.params.id;
		const user = await User.findByIdAndDelete(id);
		if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
		res.json({ status: 'success', message: 'User deleted', data: { id } });
	} catch (err) {
		console.error('Admin deleteUser error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to delete user', error: err.message });
	}
};

// (exports consolidated at end of file)

/**
	* Detailed metrics endpoint for admin analytics.
	* GET /api/admin/analytics/metrics?metric=users&from=2025-10-01&to=2025-10-30&groupBy=day
	*/
const analyticsMetric = async (req, res) => {
	try {
		const { metric = 'users', from, to, groupBy = 'day' } = req.query;

		const end = to ? new Date(to) : new Date();
		const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			return res.status(400).json({ status: 'error', message: 'Invalid from/to dates' });
		}
		if (start > end) {
			return res.status(400).json({ status: 'error', message: 'from must be before to' });
		}

		let format = '%Y-%m-%d';
		if (groupBy === 'month') format = '%Y-%m';

		// aggregate grouped by day/month depending on metric
		let agg = [];
		const map = {};

		if (metric === 'users') {
			agg = await User.aggregate([
				{ $match: { createdAt: { $gte: start, $lte: end } } },
				{ $group: { _id: { $dateToString: { format: format, date: '$createdAt' } }, count: { $sum: 1 } } },
				{ $sort: { _id: 1 } },
			]);
			agg.forEach((r) => {
				map[r._id] = r.count;
			});
		} else if (metric === 'properties') {
			agg = await Property.aggregate([
				{ $match: { createdAt: { $gte: start, $lte: end } } },
				{ $group: { _id: { $dateToString: { format: format, date: '$createdAt' } }, count: { $sum: 1 } } },
				{ $sort: { _id: 1 } },
			]);
			agg.forEach((r) => {
				map[r._id] = r.count;
			});
		} else if (metric === 'revenue') {
			// Sum successful payments amounts grouped by date/month
			agg = await Payment.aggregate([
				{ $match: { status: 'succeeded', createdAt: { $gte: start, $lte: end } } },
				{ $group: { _id: { $dateToString: { format: format, date: '$createdAt' } }, sum: { $sum: '$amount' }, count: { $sum: 1 } } },
				{ $sort: { _id: 1 } },
			]);
			// Payments.amount stored in smallest currency unit (e.g., kobo) — convert to major unit here
			agg.forEach((r) => {
				// convert to major unit (divide by 100) and ensure number
				const val = (r.sum || 0) / 100;
				map[r._id] = { amount: val, count: r.count || 0 };
			});
		} else {
			return res.status(400).json({ status: 'error', message: 'Unsupported metric' });
		}

		// build a complete timeseries filling missing periods with zeros
		const timeseries = [];
		const cur = new Date(start);
		// normalize start to UTC midnight to match $dateToString behavior
		cur.setUTCHours(0, 0, 0, 0);
		const last = new Date(end);
		last.setUTCHours(0, 0, 0, 0);

		const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
		function fmtDate(d) {
			const y = d.getUTCFullYear();
			const m = pad(d.getUTCMonth() + 1);
			const day = pad(d.getUTCDate());
			return `${y}-${m}-${day}`;
		}

		if (groupBy === 'month') {
			// iterate by month
			const curMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1));
			const endMonth = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
			let m = new Date(curMonth);
			while (m <= endMonth) {
				const key = `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}`;
				// map may contain plain counts (users/properties) or objects for revenue
				const v = map[key] || 0;
				if (metric === 'revenue') {
					const amt = v && typeof v === 'object' ? v.amount || 0 : v || 0;
					timeseries.push({ x: key, y: amt });
				} else {
					timeseries.push({ x: key, y: typeof v === 'object' ? (v.amount || 0) : (v || 0) });
				}
				m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
			}
		} else {
			// daily
			const d = new Date(cur);
			while (d <= last) {
				const key = fmtDate(d);
				const v = map[key] || 0;
				if (metric === 'revenue') {
					const amt = v && typeof v === 'object' ? v.amount || 0 : v || 0;
					timeseries.push({ x: key, y: amt });
				} else {
					timeseries.push({ x: key, y: typeof v === 'object' ? (v.amount || 0) : (v || 0) });
				}
				d.setUTCDate(d.getUTCDate() + 1);
			}
		}

		const total = timeseries.reduce((s, p) => s + p.y, 0);

		// additional metrics per-type
		const extra = {};
		if (metric === 'properties') {
			try {
				// Some apps store a `flagged` boolean on Property; additionally we track fraud reports linking to properties.
				// Count both sources so the UI gets a reliable flagged properties count.
				const propFlaggedCount = await Property.countDocuments({ flagged: true, createdAt: { $gte: start, $lte: end } }).catch(() => 0);
				const fraudFlaggedCount = await Fraud.countDocuments({ relatedPropertyId: { $exists: true }, createdAt: { $gte: start, $lte: end } }).catch(() => 0);
				extra.flaggedCount = (propFlaggedCount || 0) + (fraudFlaggedCount || 0);
			} catch (e) {
				extra.flaggedCount = 0;
			}
		}

		res.json({ status: 'success', data: { timeseries, total, ...extra } });
	} catch (err) {
		console.error('Admin analyticsMetric error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to fetch analytics metric', error: err.message });
	}
};

/**
	* Promote user/agent to admin (super admin only)
	* POST /api/admin/users/:id/promote-to-admin
	*/
const promoteToAdmin = async (req, res) => {
	try {
		const { id } = req.params;
		const { adminRole } = req.body; // basic, mid, or super

		// Validate admin role
		if (!['basic', 'mid', 'super'].includes(adminRole)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid admin role. Must be basic, mid, or super',
			});
		}

		const user = await User.findById(id);
		if (!user) {
			return res.status(404).json({ status: 'error', message: 'User not found' });
		}

		// Prevent promoting already admin (use changeAdminRole instead)
		if (user.role === 'admin') {
			return res.status(400).json({
				status: 'error',
				message: 'User is already an admin. Use change admin role endpoint to modify their level.',
			});
		}

		// Update to admin
		user.role = 'admin';
		user.adminRole = adminRole;
		await user.save();

		res.json({
			status: 'success',
			message: `User promoted to ${adminRole} admin successfully`,
			data: { user: user.toPublicProfile() },
		});
	} catch (err) {
		console.error('promoteToAdmin error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to promote user', error: err.message });
	}
};

/**
	* Change admin role level (super admin only)
	* PUT /api/admin/users/:id/admin-role
	*/
const changeAdminRole = async (req, res) => {
	try {
		const { id } = req.params;
		const { adminRole } = req.body; // basic, mid, or super

		// Validate admin role
		if (!['basic', 'mid', 'super'].includes(adminRole)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid admin role. Must be basic, mid, or super',
			});
		}

		const user = await User.findById(id);
		if (!user) {
			return res.status(404).json({ status: 'error', message: 'User not found' });
		}

		// Ensure user is an admin
		if (user.role !== 'admin') {
			return res.status(400).json({
				status: 'error',
				message: 'User is not an admin. Use promote-to-admin endpoint instead.',
			});
		}

		// Prevent super admin from demoting themselves
		if (user._id.toString() === req.user._id.toString() && adminRole !== 'super') {
			return res.status(403).json({
				status: 'error',
				message: 'You cannot change your own admin role level',
			});
		}

		user.adminRole = adminRole;
		await user.save();

		res.json({
			status: 'success',
			message: `Admin role changed to ${adminRole} successfully`,
			data: { user: user.toPublicProfile() },
		});
	} catch (err) {
		console.error('changeAdminRole error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to change admin role', error: err.message });
	}
};

/**
	* Demote admin to user/agent (super admin only)
	* POST /api/admin/users/:id/demote-admin
	*/
const demoteAdmin = async (req, res) => {
	try {
		const { id } = req.params;
		const { newRole } = req.body; // 'user' or 'agent'

		// Validate new role
		if (!['user', 'agent'].includes(newRole)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid role. Must be user or agent',
			});
		}

		const user = await User.findById(id);
		if (!user) {
			return res.status(404).json({ status: 'error', message: 'User not found' });
		}

		// Ensure user is an admin
		if (user.role !== 'admin') {
			return res.status(400).json({
				status: 'error',
				message: 'User is not an admin',
			});
		}

		// Prevent super admin from demoting themselves
		if (user._id.toString() === req.user._id.toString()) {
			return res.status(403).json({
				status: 'error',
				message: 'You cannot demote yourself',
			});
		}

		// Demote admin
		user.role = newRole;
		user.adminRole = null; // Clear admin role
		await user.save();

		res.json({
			status: 'success',
			message: `Admin demoted to ${newRole} successfully`,
			data: { user: user.toPublicProfile() },
		});
	} catch (err) {
		console.error('demoteAdmin error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to demote admin', error: err.message });
	}
};

/**
	* Promote user to agent (mid/super admin)
	* POST /api/admin/users/:id/promote-to-agent
	*/
const promoteToAgent = async (req, res) => {
	try {
		const { id } = req.params;

		const user = await User.findById(id);
		if (!user) {
			return res.status(404).json({ status: 'error', message: 'User not found' });
		}

		if (user.role === 'agent') {
			return res.status(400).json({
				status: 'error',
				message: 'User is already an agent',
			});
		}

		if (user.role === 'admin') {
			return res.status(400).json({
				status: 'error',
				message: 'Cannot change admin to agent. Demote admin first.',
			});
		}

		user.role = 'agent';
		await user.save();

		res.json({
			status: 'success',
			message: 'User promoted to agent successfully',
			data: { user: user.toPublicProfile() },
		});
	} catch (err) {
		console.error('promoteToAgent error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to promote to agent', error: err.message });
	}
};

/**
	* Demote agent to user (mid/super admin)
	* POST /api/admin/users/:id/demote-to-user
	*/
const demoteToUser = async (req, res) => {
	try {
		const { id } = req.params;

		const user = await User.findById(id);
		if (!user) {
			return res.status(404).json({ status: 'error', message: 'User not found' });
		}

		if (user.role !== 'agent') {
			return res.status(400).json({
				status: 'error',
				message: 'User is not an agent',
			});
		}

		user.role = 'user';
		await user.save();

		res.json({
			status: 'success',
			message: 'Agent demoted to user successfully',
			data: { user: user.toPublicProfile() },
		});
	} catch (err) {
		console.error('demoteToUser error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to demote agent', error: err.message });
	}
};

/**
	* Get current admin's permissions
	* GET /api/admin/permissions
	*/
const getMyPermissions = async (req, res) => {
	try {
		const { getAdminPermissions, ADMIN_PERMISSIONS } = require('../middleware/adminRoleCheck');

		const permissions = getAdminPermissions(req);

		res.json({
			status: 'success',
			data: {
				role: req.user.role,
				adminRole: req.user.adminRole,
				permissions,
				allPermissions: ADMIN_PERMISSIONS,
			},
		});
	} catch (err) {
		console.error('getMyPermissions error:', err);
		res.status(500).json({ status: 'error', message: 'Failed to fetch permissions', error: err.message });
	}
};

// add to exports
module.exports = {
	listUsers,
	getUser,
	updateUser,
	analytics,
	triggerVerificationEmail,
	listContacts,
	analyticsMetric,
	deleteUser,
	promoteToAdmin,
	changeAdminRole,
	demoteAdmin,
	promoteToAgent,
	demoteToUser,
	getMyPermissions,
};
