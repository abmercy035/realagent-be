const Property = require('../models/Property');
			const ViewingRequest = require('../models/ViewingRequest');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const { canCreateProperty } = require('../utils/planUtils');

/**
	* @route   POST /api/properties
	* @desc    Create new property listing (agent only)
	* @access  Private (Agent)
	*/
exports.createProperty = async (req, res) => {
	try {
		const agentId = req.user._id;

		// return
		// Helper function to cleanup uploaded media
		const cleanupUploadedMedia = async (media) => {
			if (!media) return;
			try {
				const deletions = [];
				if (Array.isArray(media.images)) {
					for (const img of media.images) {
						if (img?.publicId) {
							deletions.push(cloudinary.deleteFromCloudinary(img.publicId).catch(err =>
								console.error('Failed to delete image:', img.publicId, err)
							));
						}
					}
				}
				if (Array.isArray(media.videos)) {
					for (const vid of media.videos) {
						if (vid?.publicId) {
							deletions.push(cloudinary.deleteFromCloudinary(vid.publicId).catch(err =>
								console.error('Failed to delete video:', vid.publicId, err)
							));
						}
					}
				}
				if (deletions.length) {
					await Promise.allSettled(deletions);
					console.log(`Cleaned up ${deletions.length} uploaded media files`);
				}
			} catch (cleanupErr) {
				console.error('Failed to cleanup uploaded media:', cleanupErr);
			}
		};


		// Ensure user email is verified before allowing listing
		if (!req.user.emailVerified) {
			// Cleanup any uploaded media before rejecting
			if (req.body.media) {
				await cleanupUploadedMedia(req.body.media);
			}

			// Attempt to send verification email and inform client
			try {
				const { sendVerificationEmail } = require('../utils/email');
				const token = req.user.generateVerificationToken ? req.user.generateVerificationToken() : null;
				if (token) {
					await req.user.save();
					await sendVerificationEmail(req.user.email, req.user.name, token);
				}
			} catch (emailErr) {
				console.warn('Failed to send verification email during property create:', emailErr.message || emailErr);
			}

			return res.status(403).json({ success: false, error: 'Email not verified. Verification email sent.', code: 'EMAIL_NOT_VERIFIED' });
		}

		// Ensure agent has completed document verification before listing
		// if (!req.user.verified) {
		// 	// Cleanup any uploaded media before rejecting
		// 	if (req.body.media) {
		// 		await cleanupUploadedMedia(req.body.media);
		// 	}

		// 	return res.status(403).json({ success: false, error: 'Agent verification required. Please complete document verification to list properties.', code: 'AGENT_NOT_VERIFIED' });
		// }

		const {
			title,
			description,
			propertyType,
			category,
			location,
			pricing,
			listType,
			amenities,
			details,
			media,
			status = 'active',
		} = req.body;

		// Expect media to be already uploaded via /api/uploads/property-media.
		// Accept arrays of objects: { url, publicId?, caption? }
		let images = [];
		let videos = [];

		// Enforce limits and validate that client sent Cloudinary URLs (not data URIs)
		const imageFiles = Array.isArray(media?.images) ? media.images.slice(0, 4) : [];
		const videoFiles = Array.isArray(media?.videos) ? media.videos.slice(0, 1) : [];

		// If client sent data URIs (base64) we reject and ask them to use the uploads endpoint
		for (const img of imageFiles) {
			if (img?.url && typeof img.url === 'string' && img.url.startsWith('data:')) {
				return res.status(400).json({ success: false, error: 'Please upload media using the /api/uploads/property-media endpoint (send files as multipart/form-data).' });
			}
			if (img && img.url) images.push({ url: img.url, publicId: img.publicId || null, caption: img.caption || null });
		}

		for (const vid of videoFiles) {
			if (vid?.url && typeof vid.url === 'string' && vid.url.startsWith('data:')) {
				return res.status(400).json({ success: false, error: 'Please upload media using the /api/uploads/property-media endpoint (send files as multipart/form-data).' });
			}
			if (vid && vid.url) videos.push({ url: vid.url, publicId: vid.publicId || null, caption: vid.caption || null });
		}

		// Server-side validation: description length and minimum media count
		if (!description || String(description).trim().length < 50) {
			// Cleanup uploaded media before rejecting
			await cleanupUploadedMedia(media);
			return res.status(400).json({ success: false, error: 'Description must be at least 50 characters long.' });
		}

		const totalMediaCount = (Array.isArray(media?.images) ? media.images.length : 0) + (Array.isArray(media?.videos) ? media.videos.length : 0);
		if (totalMediaCount < 2) {
			// Cleanup uploaded media before rejecting
			await cleanupUploadedMedia(media);
			return res.status(400).json({ success: false, error: 'Please provide at least 2 media items (images/videos).' });
		}

		// Create property
		const property = await Property.create({
			title,
			description,
			propertyType,
			category,
			location,
			pricing,
			listType,
			amenities,
			details,
			media: { images, videos },
			agent: agentId,
			status,
		});

		// After creation: enforce rule for free-plan grace period. If the user
		// is in a grace window and the new total exceeds their free plan limit,
		// delete the newly created property immediately (product rule).
		try {
			const check = await canCreateProperty(req.user);
			if (check && check.inGrace && check.current > check.limit) {
				// delete the property we just created
				try {
					// cleanup cloudinary media attached to this property
					const deletions = [];
					if (property.media && Array.isArray(property.media.images)) {
						for (const img of property.media.images) {
							if (img && img.publicId) deletions.push(cloudinary.deleteFromCloudinary(img.publicId).catch(() => { }));
						}
					}
					if (property.media && Array.isArray(property.media.videos)) {
						for (const vid of property.media.videos) {
							if (vid && vid.publicId) deletions.push(cloudinary.deleteFromCloudinary(vid.publicId).catch(() => { }));
						}
					}
					if (deletions.length) await Promise.allSettled(deletions);
				} catch (cleanupErr) {
					console.error('Failed to cleanup media after removing property due to grace-limit:', cleanupErr);
				}

				await Property.findByIdAndDelete(property._id);
				return res.status(403).json({
					success: false,
					message: 'Your account is on a free plan grace period — newly created property removed because it would exceed your plan limit',
					current: check.current - 1,
					limit: check.limit,
				});
			}
		} catch (e) {
			// If the check fails for some reason, log and continue returning success
			console.error('Post-create plan check failed:', e);
		}

		res.status(201).json({ success: true, data: property });
	} catch (error) {
		console.error('Create property error:', error.message);

		// Cleanup uploaded media on any error using our helper function
		// Note: cleanupUploadedMedia is defined inside the try block, so we need to redefine it here
		const cleanupMedia = async (media) => {
			if (!media) return;
			try {
				const deletions = [];
				if (Array.isArray(media.images)) {
					for (const img of media.images) {
						if (img?.publicId) {
							deletions.push(cloudinary.deleteFromCloudinary(img.publicId).catch(err =>
								console.error('Failed to delete image:', img.publicId, err)
							));
						}
					}
				}
				if (Array.isArray(media.videos)) {
					for (const vid of media.videos) {
						if (vid?.publicId) {
							deletions.push(cloudinary.deleteFromCloudinary(vid.publicId).catch(err =>
								console.error('Failed to delete video:', vid.publicId, err)
							));
						}
					}
				}
				if (deletions.length) {
					await Promise.allSettled(deletions);
					console.log(`Cleaned up ${deletions.length} uploaded media files after error`);
				}
			} catch (cleanupErr) {
				console.error('Failed to cleanup uploaded media:', cleanupErr);
			}
		};

		// Attempt cleanup
		await cleanupMedia(req.body?.media);

		// Mongoose validation error
		if (error.name === 'ValidationError' && error.errors) {
			const errors = {};
			for (const key in error.errors) {
				errors[key] = error.errors[key].message;
			}
			return res.status(400).json({ success: false, error: error._message || 'Validation failed', errors });
		}

		res.status(500).json({ success: false, error: 'Failed to create property' });
	}
};
/**
	* Property Controller
	* Handles all property-related operations
	*/


/**
	* @route   GET /api/properties
	* @desc    Get all properties with filters and search
	* @access  Public
	*/
exports.getAllProperties = async (req, res) => {
	try {
		const {
			search,
			propertyType,
			city,
			state,
			minPrice,
			maxPrice,
			availability,
			amenities,
			bedrooms,
			page = 1,
			limit = 12,
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = req.query;

		// Build filter query
		const filters = {
			search,
			propertyType,
			city,
			state,
			minPrice: minPrice ? Number(minPrice) : undefined,
			maxPrice: maxPrice ? Number(maxPrice) : undefined,
			availability,
			amenities: amenities ? amenities.split(',') : undefined,
			bedrooms: bedrooms ? Number(bedrooms) : undefined,
		};

		const query = await Property.searchProperties(filters);

		// Pagination
		const skip = (Number(page) - 1) * Number(limit);
		const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

		const properties = await Property.find(query)
			.populate('agent', 'name email phone avatar verificationStatus')
			.sort(sort)
			.skip(skip)
			.limit(Number(limit))
			.select('-paidToView.unlockedBy -metrics.viewedBy'); // Hide sensitive data

		const total = await Property.countDocuments(query);

		res.status(200).json({
			success: true,
			data: properties,
			pagination: {
				page: Number(page),
				limit: Number(limit),
				total,
				pages: Math.ceil(total / Number(limit)),
			},
		});
	} catch (error) {
		console.error('Get all properties error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch properties',
		});
	}
};

/**
	* @route   GET /api/properties/:id
	* @desc    Get single property by ID
	* @access  Public
	*/
exports.getPropertyById = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user ? req.user._id : null;

		const property = await Property.findById(id)
			.populate('agent', 'name email phone avatar agentIdNumber verificationStatus bio')
			.populate({
				path: 'metrics.viewedBy.userId',
				select: 'name',
			});

		if (!property) {
			return res.status(404).json({
				success: false,
				error: 'Property not found',
			});
		}

		// Check if property is active
		if (property.status !== 'active' && (!req.user || req.user.role !== 'admin')) {
			return res.status(403).json({
				success: false,
				error: 'Property is not available',
			});
		}

		// Increment view count
		if (userId) {
			await property.incrementViews(userId);
		} else {
			property.metrics.views += 1;
			await property.save();
		}

		// Check if user has unlocked paid content
		let hasAccess = true;
		if (property.paidToView.enabled) {
			hasAccess = userId ? property.isUnlockedBy(userId) : false;
		}

		// Hide sensitive content if not unlocked
		let responseData = property.toObject();
		if (!hasAccess) {
			responseData.location.address = 'Unlock to view full address';
			responseData.agent.phone = 'Unlock to view contact';
			responseData.agent.email = 'Unlock to view contact';
			// Show only first image
			if (responseData.media.images.length > 1) {
				responseData.media.images = [responseData.media.images[0]];
			}
			responseData.media.videos = [];
		}

		// Remove sensitive fields
		delete responseData.paidToView.unlockedBy;
		delete responseData.metrics.viewedBy;

		res.status(200).json({
			success: true,
			data: responseData,
			hasAccess,
		});
	} catch (error) {
		console.error('Get property by ID error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch property',
		});
	}
};

/**
	* @route   GET /api/properties/:id/stats
	* @desc    Get per-property analytics (last 7 days views, growth, conversion, recent inquiries)
	* @access  Private (Agent owner or Admin)
	*/
exports.getPropertyStatsById = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user ? req.user._id : null;

		const property = await Property.findById(id).lean();
		if (!property) {
			return res.status(404).json({ success: false, error: 'Property not found' });
		}

		// Only allow owner or admin to view detailed stats
		if (!req.user || (req.user.role !== 'admin' && property.agent.toString() !== req.user._id.toString())) {
			return res.status(403).json({ success: false, error: 'Not authorized to view property analytics' });
		}

		// Prepare last 14 days buckets to compute current week and previous week
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const days = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			days.push({ date: d, key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { weekday: 'short' }), views: 0 });
		}

		// Also prepare previous week range for growth calculation
		const prevStart = new Date(today);
		prevStart.setDate(prevStart.getDate() - 14);
		prevStart.setHours(0, 0, 0, 0);

		const prevEnd = new Date(today);
		prevEnd.setDate(prevEnd.getDate() - 7);
		prevEnd.setHours(23, 59, 59, 999);

		const viewedBy = (property.metrics && Array.isArray(property.metrics.viewedBy)) ? property.metrics.viewedBy : [];

		// If we have detailed viewedBy timestamps, bucket them; otherwise we fall back to zeros for daily breakdown
		if (viewedBy.length > 0) {
			// Build 14-day buckets map (keyed by YYYY-MM-DD)
			const buckets = {};
			for (let i = 13; i >= 0; i--) {
				const d = new Date(today);
				d.setDate(d.getDate() - i);
				buckets[d.toISOString().slice(0, 10)] = 0;
			}

			for (const entry of viewedBy) {
				try {
					const viewedAt = entry.viewedAt ? new Date(entry.viewedAt) : null;
					if (!viewedAt) continue;
					const key = viewedAt.toISOString().slice(0, 10);
					const count = typeof entry.viewCount === 'number' ? entry.viewCount : 1;
					if (key in buckets) buckets[key] += count;
				} catch (e) {
					// ignore malformed entries
				}
			}

			// Fill days array from buckets (last 7 days)
			for (const d of days) {
				d.views = buckets[d.key] || 0;
			}

			// compute previous week sum
			let prevWeekSum = 0;
			for (let i = 7; i < 14; i++) {
				const d = new Date(today);
				d.setDate(d.getDate() - i);
				const key = d.toISOString().slice(0, 10);
				prevWeekSum += buckets[key] || 0;
			}

			const currentWeekSum = days.reduce((s, x) => s + x.views, 0);

			const viewsGrowth = prevWeekSum === 0 ? (currentWeekSum > 0 ? 100 : 0) : Number((((currentWeekSum - prevWeekSum) / prevWeekSum) * 100).toFixed(1));

			// Conversion: compute inquiries in the last 7 days
			let inquiriesLast7 = 0;
			try {
				inquiriesLast7 = await ViewingRequest.countDocuments({ property: id, createdAt: { $gte: days[0].date } });
			} catch (e) {
				inquiriesLast7 = 0;
			}

			const conversionRate = (currentWeekSum > 0) ? Number(((inquiriesLast7 / currentWeekSum) * 100).toFixed(1)) : 0;

			// Recent inquiries (latest 5)
			let recentInquiries = [];
			try {
				recentInquiries = await ViewingRequest.find({ property: id }).sort({ createdAt: -1 }).limit(5).lean();
			} catch (e) {
				recentInquiries = [];
			}

			return res.status(200).json({
				success: true,
				data: {
					viewsByDay: days.map((d) => ({ day: d.label, views: d.views })),
					viewsThisWeek: currentWeekSum,
					viewsGrowth,
					conversionRate,
					averageTimeOnPage: property.metrics && property.metrics.averageTimeOnPage ? property.metrics.averageTimeOnPage : null,
					recentInquiries: recentInquiries.map((r) => ({ id: r._id, user: r.user ? (r.user.name || r.user) : (r.userId || null), message: r.message || r.note || '', date: r.createdAt })),
				},
			});
		}

		// Fallback when viewedBy is not present: return totals and zeros for daily
		const fallbackDays = days.map((d) => ({ day: d.label, views: 0 }));
		const totalViews = property.metrics?.views || 0;

		// Try to compute inquiries in last 7 days and conversion against totalViews
		let inquiriesLast7 = 0;
		try {
			inquiriesLast7 = await ViewingRequest.countDocuments({ property: id, createdAt: { $gte: days[0].date } });
		} catch (e) {
			inquiriesLast7 = 0;
		}

		const conversionRate = totalViews > 0 ? Number(((inquiriesLast7 / totalViews) * 100).toFixed(1)) : 0;

		let recentInquiries = [];
		try {
			recentInquiries = await ViewingRequest.find({ property: id }).sort({ createdAt: -1 }).limit(5).lean();
		} catch (e) {
			recentInquiries = [];
		}

		return res.status(200).json({
			success: true,
			data: {
				viewsByDay: fallbackDays,
				viewsThisWeek: 0,
				viewsGrowth: 0,
				conversionRate,
				averageTimeOnPage: property.metrics && property.metrics.averageTimeOnPage ? property.metrics.averageTimeOnPage : null,
				recentInquiries: recentInquiries.map((r) => ({ id: r._id, user: r.user ? (r.user.name || r.user) : (r.userId || null), message: r.message || r.note || '', date: r.createdAt })),
			},
		});
	} catch (error) {
		console.error('Get property stats by id error:', error);
		res.status(500).json({ success: false, error: 'Failed to fetch property statistics' });
	}
};

/**
	* @route   GET /api/properties/agent/:agentId
	* @desc    Get all properties by agent
	* @access  Public
	*/
exports.getPropertiesByAgent = async (req, res) => {
	try {
		const { agentId } = req.params;
		console.log(agentId)
		const { page = 1, limit = 12 } = req.query;

		const skip = (Number(page) - 1) * Number(limit);

		const properties = await Property.find({
			agent: agentId,
			status: 'active',
		})
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(Number(limit))
			.select('-paidToView.unlockedBy -metrics.viewedBy');

		const total = await Property.countDocuments({ agent: agentId, status: 'active' });
		
		res.status(200).json({
			success: true,
			data: properties,
			pagination: {
				page: Number(page),
				limit: Number(limit),
				total,
				pages: Math.ceil(total / Number(limit)),
			},
		});
	} catch (error) {
		console.error('Get properties by agent error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch agent properties',
		});
	}
};

/**
	* @route   GET /api/properties/featured
	* @desc    Get featured properties
	* @access  Public
	*/
exports.getFeaturedProperties = async (req, res) => {
	try {
		const { limit = 6 } = req.query;

		const properties = await Property.find({
			status: 'active',
			isFeatured: true,
		})
			.populate('agent', 'name email verificationStatus')
			.sort({ createdAt: -1 })
			.limit(Number(limit))
			.select('-paidToView.unlockedBy -metrics.viewedBy');

		res.status(200).json({
			success: true,
			data: properties,
		});
	} catch (error) {
		console.error('Get featured properties error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch featured properties',
		});
	}
};

/**
	* @route   GET /api/properties/recently-viewed
	* @desc    Get user's recently viewed properties
	* @access  Private
	*/
exports.getRecentlyViewed = async (req, res) => {
	try {
		const userId = req.user._id;
		const { limit = 10 } = req.query;

		// Find properties where user appears in viewedBy array
		const properties = await Property.find({
			'metrics.viewedBy.userId': userId,
			status: 'active',
		})
			.populate('agent', 'name email verificationStatus')
			.sort({ 'metrics.viewedBy.viewedAt': -1 })
			.limit(Number(limit))
			.select('-paidToView.unlockedBy -metrics.viewedBy');

		res.status(200).json({
			success: true,
			data: properties,
		});
	} catch (error) {
		console.error('Get recently viewed error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch recently viewed properties',
		});
	}
};

/**
	* @route   GET /api/properties/similar/:id
	* @desc    Get similar properties (same type, location, price range)
	* @access  Public
	*/
exports.getSimilarProperties = async (req, res) => {
	try {
		const { id } = req.params;
		const { limit = 6 } = req.query;

		const property = await Property.findById(id);
		if (!property) {
			return res.status(404).json({
				success: false,
				error: 'Property not found',
			});
		}

		// Find similar properties
		const similar = await Property.find({
			_id: { $ne: id }, // Exclude current property
			status: 'active',
			propertyType: property.propertyType,
			'location.city': property.location.city,
			'pricing.amount': {
				$gte: property.pricing.amount * 0.7, // 30% lower
				$lte: property.pricing.amount * 1.3, // 30% higher
			},
		})
			.populate('agent', 'name email verificationStatus')
			.limit(Number(limit))
			.select('-paidToView.unlockedBy -metrics.viewedBy');

		res.status(200).json({
			success: true,
			data: similar,
		});
	} catch (error) {
		console.error('Get similar properties error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch similar properties',
		});
	}
};

/**
	* @route   POST /api/properties/:id/share
	* @desc    Increment share count
	* @access  Public
	*/
exports.shareProperty = async (req, res) => {
	try {
		const { id } = req.params;

		const property = await Property.findByIdAndUpdate(
			id,
			{ $inc: { 'metrics.shares': 1 } },
			{ new: true }
		);

		if (!property) {
			return res.status(404).json({
				success: false,
				error: 'Property not found',
			});
		}

		res.status(200).json({
			success: true,
			message: 'Share count updated',
			data: { shares: property.metrics.shares },
		});
	} catch (error) {
		console.error('Share property error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to update share count',
		});
	}
};

/**
	* @route   GET /api/properties/stats/overview
	* @desc    Get properties overview stats
	* @access  Private (Agent/Admin)
	*/
exports.getPropertyStats = async (req, res) => {
	try {
		const userId = req.user._id;
		const isAdmin = req.user.role === 'admin';

		const query = isAdmin ? {} : { agent: userId };

		// Totals
		const total = await Property.countDocuments({ ...query, status: { $ne: 'deleted' } });
		const active = await Property.countDocuments({ ...query, status: 'active' });
console.log({total, active})
		// Total views (sum across properties)
		const viewsResult = await Property.aggregate([
			{ $match: query },
			{ $group: { _id: null, totalViews: { $sum: '$metrics.views' } } },
		]);
		const totalViews = viewsResult[0]?.totalViews || 0;

		// Views by month (based on metrics.viewedBy.viewedAt timestamps)
		const viewsByMonth = await Property.aggregate([
			{ $match: query },
					{
						$project: {
							// If metrics.viewedBy is a non-empty array use it, otherwise create a synthetic entry
							viewEntries: {
								$cond: [
									{ $and: [{ $isArray: '$metrics.viewedBy' }, { $gt: [{ $size: '$metrics.viewedBy' }, 0] }] },
									'$metrics.viewedBy',
									[
										{
											viewedAt: { $ifNull: ['$publishedAt', '$createdAt'] },
											viewCount: { $ifNull: ['$metrics.views', 0] }
										}
									]
								]
							}
						}
					},
					{ $unwind: { path: '$viewEntries', preserveNullAndEmptyArrays: false } },
					{
						$project: {
							month: {
															$dateToString: {
																format: '%Y-%m',
																date: {
																	$cond: [
																		{ $eq: [{ $type: '$viewEntries.viewedAt' }, 'string'] },
																		{ $toDate: '$viewEntries.viewedAt' },
																		'$viewEntries.viewedAt'
																	]
																}
															}
														},
							viewCount: {
								$cond: [
									{ $and: [{ $ne: ['$viewEntries.viewCount', null] }, { $isNumber: '$viewEntries.viewCount' }] },
									'$viewEntries.viewCount',
									1
								]
							}
						}
					},
					{ $group: { _id: '$month', views: { $sum: '$viewCount' } } },
					{ $sort: { _id: 1 } },
				]);

		// Map aggregation result to a stable shape
		const viewsMonthMetrics = (viewsByMonth || [])
			.filter((r) => r._id) // filter out null months
			.map((r) => ({ month: r._id, views: r.views }));

		// Inquiries / viewing requests: try to use a ViewingRequest model if available
		let totalInquiries = 0;
		let pendingInquiries = 0;
		try {

			const inquiryQuery = isAdmin ? {} : { agent: userId };
			totalInquiries = await ViewingRequest.countDocuments(inquiryQuery);
			pendingInquiries = await ViewingRequest.countDocuments({ ...inquiryQuery, status: 'pending' });
		} catch (e) {
			// No viewing requests model in this repo — return zeros (frontend uses mock data)
			totalInquiries = 0;
			pendingInquiries = 0;
		}

		res.status(200).json({
			success: true,
			data: {
			totals: {
				totalProperties: total,
				activeProperties: active,
			},
			views: {
				totalViews,
				viewsByMonth: viewsMonthMetrics,
			},
			inquiries: {
				totalInquiries,
				pendingInquiries,
			},
		},
	});
	} catch (error) {
		console.error('Get property stats error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to fetch property statistics',
		});
	}
};

/**
	* @route   POST /api/properties/:id/view
	* @desc    Track property view
	* @access  Public
	*/
exports.trackPropertyView = async (req, res) => {
	try {
		const propertyId = req.params.id;

		const property = await Property.findById(propertyId);
		if (!property) {
			return res.status(404).json({
				success: false,
				error: 'Property not found',
			});
		}

		// Increment view count
		property.metrics = property.metrics || {};
		property.metrics.views = (property.metrics.views || 0) + 1;
		await property.save();

		res.status(200).json({
			success: true,
			message: 'View tracked',
			views: property.metrics.views,
		});
	} catch (error) {
		console.error('Track property view error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to track view',
		});
	}
};

/**
	* @route   GET /api/properties/occupied-by/:userId
	* @desc    Get properties occupied by user
	* @access  Private
	*/
exports.getPropertiesOccupiedByUser = async (req, res) => {
	try {
		const { userId } = req.params;
		// Find properties where vacancy.status is 'occupied' and currentTenant exists and matches userId
		const properties = await Property.find({
			'vacancy.status': 'occupied',
			'vacancy.currentTenant': { $exists: true },
			'vacancy.currentTenant.userId': userId
		}).select('_id title location.address');
		res.status(200).json({ data: properties });
	} catch (error) {
		res.status(500).json({ error: 'Failed to fetch occupied properties' });
	}
};

/**
	* @route   POST /api/properties/:id/assign
	* @desc    Assign (occupy) a property to a user (agent or admin)
	* @access  Private (Agent owner OR Admin)
	*/
exports.assignProperty = async (req, res) => {
	try {
		const propertyId = req.params.id;
		const { occupantId, moveInDate, leaseDurationMonths, hideFromListings = true, force = false } = req.body;

		const property = await Property.findById(propertyId);
		if (!property) return res.status(404).json({ success: false, error: 'Property not found' });

		// Only listing agent or admin can assign
		if (req.user.role !== 'admin' && property.agent.toString() !== req.user._id.toString()) {
			return res.status(403).json({ success: false, error: 'Not authorized to assign this property' });
		}

		// Prevent accidental overwrite unless admin forces
		if (property.vacancy && property.vacancy.status === 'occupied' && !((req.user.role === 'admin') && force)) {
			return res.status(409).json({ success: false, error: 'Property is already occupied' });
		}

		// Validate occupant
		if (!occupantId) return res.status(400).json({ success: false, error: 'occupantId is required' });
		const occupant = await User.findById(occupantId);
		if (!occupant) return res.status(404).json({ success: false, error: 'Occupant user not found' });

		// Update occupancy fields
		property.vacancy = property.vacancy || {};
		property.vacancy.status = 'occupied';
		property.vacancy.currentTenant = property.vacancy.currentTenant || {};
		if (moveInDate) property.vacancy.currentTenant.moveInDate = new Date(moveInDate);
		if (leaseDurationMonths) property.vacancy.currentTenant.leaseDuration = Number(leaseDurationMonths);
		// Backfill a userId in currentTenant to support existing queries that expect it
		property.vacancy.currentTenant.userId = occupantId;

		property.occupiedBy = occupantId;
		property.hideFromListings = !!hideFromListings;
		property.occupiedAssignedBy = req.user._id;
		property.occupiedAt = new Date();

		await property.save();

		// Return sanitized property summary
		const updated = await Property.findById(propertyId).select('-paidToView.unlockedBy -metrics.viewedBy');
		res.status(200).json({ success: true, data: updated });
	} catch (error) {
		console.error('Assign property error:', error);
		res.status(500).json({ success: false, error: 'Failed to assign property' });
	}
};

/**
	* @route   POST /api/properties/:id/unassign
	* @desc    Unassign (vacate) a property so it becomes available again
	* @access  Private (Agent owner OR Admin)
	*/
exports.unassignProperty = async (req, res) => {
	try {
		const propertyId = req.params.id;

		const property = await Property.findById(propertyId);
		if (!property) return res.status(404).json({ success: false, error: 'Property not found' });

		// Only listing agent or admin can unassign
		if (req.user.role !== 'admin' && property.agent.toString() !== req.user._id.toString()) {
			return res.status(403).json({ success: false, error: 'Not authorized to unassign this property' });
		}

		if (!property.occupiedBy && (!property.vacancy || property.vacancy.status !== 'occupied')) {
			return res.status(400).json({ success: false, error: 'Property is not currently occupied' });
		}

		// Clear occupancy
		property.occupiedBy = null;
		property.occupiedAssignedBy = null;
		property.occupiedAt = null;
		property.hideFromListings = false;
		property.occupantContactShared = false;

		// Reset vacancy details
		property.vacancy = property.vacancy || {};
		property.vacancy.status = 'vacant';
		property.vacancy.currentTenant = {};

		await property.save();

		const updated = await Property.findById(propertyId).select('-paidToView.unlockedBy -metrics.viewedBy');
		res.status(200).json({ success: true, data: updated });
	} catch (error) {
		console.error('Unassign property error:', error);
		res.status(500).json({ success: false, error: 'Failed to unassign property' });
	}
};

/**
	* @route   PUT /api/properties/:id
	* @desc    Update property listing
	* @access  Private (Agent - Owner only)
	*/
exports.updateProperty = async (req, res) => {
	try {
		const propertyId = req.params.id;
		const userId = req.user.id;

		// Find property and check ownership
		const property = await Property.findById(propertyId);
		if (!property) {
			return res.status(404).json({
				success: false,
				error: 'Property not found',
			});
		}


		// Check if user is the owner
		if (property.agent.toString() !== userId) {
			return res.status(403).json({
				success: false,
				error: 'Not authorized to update this property',
			});
		}

		console.log(req.body)
		// Update property
		const updatedProperty = await Property.findByIdAndUpdate(
			propertyId,
			{ $set: req.body },
			{ new: true, runValidators: true }
		).populate('agent', 'firstName lastName email username avatar id _id phone');
		console.log({ updatedProperty })

		res.status(200).json({
			success: true,
			message: 'Property updated successfully',
			data: updatedProperty,
		});
	} catch (error) {
		console.error('Update property error:', error);
		console.error('Update property error:', error.message);
		res.status(500).json({
			success: false,
			error: 'Failed to update property',
		});
	}
};

/**
	* @route   DELETE /api/properties/:id
	* @desc    Delete property listing
	* @access  Private (Agent - Owner only)
	*/
exports.deleteProperty = async (req, res) => {
	try {
		const propertyId = req.params.id;
		const userId = req.user.id;

		// Find property and check ownership
		const property = await Property.findById(propertyId);
		if (!property) {
			return res.status(404).json({
				success: false,
				error: 'Property not found',
			});
		}

		// Check if user is the owner
		if (property.agent.toString() !== userId) {
			return res.status(403).json({
				success: false,
				error: 'Not authorized to delete this property',
			});
		}

		// Delete property
		await Property.findByIdAndDelete(propertyId);

		res.status(200).json({
			success: true,
			message: 'Property deleted successfully',
		});
	} catch (error) {
		console.error('Delete property error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to delete property',
		});
	}
};

module.exports = exports;
