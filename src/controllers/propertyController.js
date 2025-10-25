/**
	* @route   POST /api/properties
	* @desc    Create new property listing (agent only)
	* @access  Private (Agent)
	*/
exports.createProperty = async (req, res) => {
	try {
		const agentId = req.user._id;
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
			return res.status(400).json({ success: false, error: 'Description must be at least 50 characters long.' });
		}

		const totalMediaCount = (Array.isArray(media?.images) ? media.images.length : 0) + (Array.isArray(media?.videos) ? media.videos.length : 0);
		if (totalMediaCount < 2) {
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

		res.status(201).json({ success: true, data: property });
	} catch (error) {
		console.error('Create property error:', error);
		// If we have uploaded media in the request body, attempt cleanup to avoid orphaned cloud files
		try {
			const mediaForCleanup = req.body?.media;
			const imageFiles = Array.isArray(mediaForCleanup?.images) ? mediaForCleanup.images : [];
			const videoFiles = Array.isArray(mediaForCleanup?.videos) ? mediaForCleanup.videos : [];
			const deletions = [];
			for (const img of imageFiles) {
				if (img?.publicId) {
					deletions.push(cloudinary.deleteFromCloudinary(img.publicId).catch((e) => console.error('Failed to delete image on create failure', e)));
				}
			}
			for (const vid of videoFiles) {
				if (vid?.publicId) {
					deletions.push(cloudinary.deleteFromCloudinary(vid.publicId).catch((e) => console.error('Failed to delete video on create failure', e)));
				}
			}
			if (deletions.length > 0) await Promise.allSettled(deletions);
		} catch (cleanupError) {
			console.error('Media cleanup error after create failure:', cleanupError);
		}

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

const Property = require('../models/Property');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');

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
			.populate('agent', 'name email phone profilePicture verificationStatus')
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
			.populate('agent', 'name email phone profilePicture verificationStatus bio')
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
			{ $unwind: { path: '$metrics.viewedBy', preserveNullAndEmptyArrays: true } },
			{
				$project: {
					month: {
						$dateToString: { format: '%Y-%m', date: '$metrics.viewedBy.viewedAt' },
					},
					viewCount: { $ifNull: ['$metrics.viewedBy.viewCount', 0] },
				},
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
			// Require lazily; if the model/file doesn't exist this will throw and we fall back to zeros
			// eslint-disable-next-line global-require, import/no-dynamic-require
			const ViewingRequest = require('../models/ViewingRequest');
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

module.exports = exports;
