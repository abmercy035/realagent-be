const MarketItem = require('../models/MarketItem');
const User = require('../models/User');
const { deleteFromCloudinary } = require('../config/cloudinary');

// Pricing Formula constants
const CREDIT_COST = {
	IMAGE_BASE: 10,
	IMAGE_INCREMENT: 2.5,
	VIDEO_BASE: 20,
	VIDEO_INCREMENT: 5,
	PRICE_DIVISOR_NGN: 100,
	PRICE_RATE: 0.5,
	MAX_CREDIT_CHARGE_PER_LISTING: 100,
};

function stepCost(count, base, increment) {
	if (count <= 0) return 0;
	return base + (count - 1) * increment;
}

function calculateListingCost(imageCount, videoCount, priceNgn) {
	const imageCost = stepCost(imageCount, CREDIT_COST.IMAGE_BASE, CREDIT_COST.IMAGE_INCREMENT);
	const videoCost = stepCost(videoCount, CREDIT_COST.VIDEO_BASE, CREDIT_COST.VIDEO_INCREMENT);
	const priceCost = (priceNgn / CREDIT_COST.PRICE_DIVISOR_NGN) * CREDIT_COST.PRICE_RATE;

	const rawTotal = imageCost + videoCost + priceCost;
	const finalCost = Math.min(rawTotal, CREDIT_COST.MAX_CREDIT_CHARGE_PER_LISTING);

	return {
		imageCost,
		videoCost,
		priceCost,
		rawTotal,
		finalCost,
		capped: rawTotal > CREDIT_COST.MAX_CREDIT_CHARGE_PER_LISTING,
	};
}

// List market items with pagination and filters
exports.listMarketItems = async (req, res) => {
	try {
		const page = parseInt(req.query.page, 10) || 1;
		const limit = parseInt(req.query.limit, 10) || 12;
		const skip = (page - 1) * limit;

		const filter = { status: 'active' };
		if (req.query.sellerId) filter.sellerId = req.query.sellerId;
		if (req.query.category) filter.category = req.query.category;
		if (req.query.school || req.query.campus) filter.campus = req.query.school || req.query.campus;
		if (req.query.minPrice) filter.price = { ...(filter.price || {}), $gte: Number(req.query.minPrice) };
		if (req.query.maxPrice) filter.price = { ...(filter.price || {}), $lte: Number(req.query.maxPrice) };

		// Text search
		if (req.query.search) {
			filter.$text = { $search: req.query.search };
		}

		const [items, total] = await Promise.all([
			MarketItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('sellerId', 'fullName name avatar school role username phone'),
			MarketItem.countDocuments(filter),
		]);

		const pages = Math.ceil(total / limit) || 1;

		res.json({ data: items, pagination: { page, limit, total, pages } });
	} catch (err) {
		console.error('List market items error:', err);
		res.status(500).json({ error: 'Failed to fetch market items' });
	}
};

// Featured items (recent active items)
exports.featuredMarketItems = async (req, res) => {
	try {
		const limit = Math.min(parseInt(req.query.limit, 10) || 3, 20);
		const items = await MarketItem.find({ status: 'active' })
			.sort({ createdAt: -1 })
			.limit(limit)
			.populate('sellerId', 'fullName name avatar school role username phone');

		res.json({ data: items });
	} catch (err) {
		console.error('Featured market items error:', err);
		res.status(500).json({ error: 'Failed to fetch featured market items' });
	}
};

// List items belonging to the authenticated user
exports.listUserMarketItems = async (req, res) => {
	try {
		const page = parseInt(req.query.page, 10) || 1;
		const limit = parseInt(req.query.limit, 10) || 20;
		const skip = (page - 1) * limit;

		if (!req.user || !req.user._id) return res.status(401).json({ error: 'Authentication required' });

		const filter = { sellerId: req.user._id };

		if (req.query.status) filter.status = req.query.status;

		const [items, total] = await Promise.all([
			MarketItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('sellerId', 'fullName name avatar school role username phone'),
			MarketItem.countDocuments(filter),
		]);

		const pages = Math.ceil(total / limit) || 1;

		res.json({ data: items, pagination: { page, limit, total, pages } });
	} catch (err) {
		console.error('List user market items error:', err);
		res.status(500).json({ error: 'Failed to fetch user market items' });
	}
};

// Get single item
exports.getMarketItem = async (req, res) => {
	try {
		const { id } = req.params;
		const item = await MarketItem.findById(id).populate('sellerId', 'fullName name avatar school role username phone');
		if (!item || item.status === 'removed') return res.status(404).json({ error: 'Item not found' });
		res.json({ data: item });
	} catch (err) {
		console.error('Get market item error:', err);
		res.status(500).json({ error: 'Failed to fetch market item' });
	}
};

// Create item
exports.createMarketItem = async (req, res) => {
	try {
		const userId = req.user && req.user._id;
		if (!userId) return res.status(401).json({ error: 'Authentication required' });

		const {
			title,
			description,
			price,
			category,
			campus,
			media = [],
		} = req.body;

		if (!title || !description || typeof price === 'undefined' || !category || !campus) {
			return res.status(400).json({ error: 'title, description, price, category and campus are required' });
		}

		if (media.length < 1) {
			return res.status(400).json({ error: 'Please add at least one image of the item' });
		}

		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Calculate cost of listing
		const imageCount = media.filter(m => m.type === 'image').length;
		const videoCount = media.filter(m => m.type === 'video').length;
		const costBreakdown = calculateListingCost(imageCount, videoCount, Number(price));
		const cost = costBreakdown.finalCost;

		// Verify marketCreditBalance
		if (user.marketCreditBalance < cost) {
			return res.status(403).json({
				error: `Insufficient credits. You need ${cost} credits to create this listing.`,
				required: cost,
				current: user.marketCreditBalance,
				code: 'INSUFFICIENT_CREDITS',
			});
		}

		// Atomic deduction of credits
		const updatedUser = await User.findOneAndUpdate(
			{ _id: userId, marketCreditBalance: { $gte: cost } },
			{ $inc: { marketCreditBalance: -cost } },
			{ new: true }
		);

		if (!updatedUser) {
			return res.status(409).json({ error: 'Credit balance mismatch, please retry' });
		}

		// Create listing document
		const item = await MarketItem.create({
			sellerId: userId,
			title,
			description,
			price: Number(price),
			category,
			campus,
			media: media.map(m => ({
				cloudinaryPublicId: m.cloudinaryPublicId || m.publicId || m.public_id,
				secureUrl: m.secureUrl || m.url,
				type: m.type || 'image',
			})),
			status: 'active',
			creditCostCharged: costBreakdown,
			sellerTierAtCreation: user.marketSellerTier || 'free',
		});

		res.status(201).json({
			success: true,
			data: item,
			creditsRemaining: updatedUser.marketCreditBalance,
		});
	} catch (err) {
		console.error('Create market item error:', err);
		res.status(500).json({ error: 'Failed to create market item' });
	}
};

// Update item
exports.updateMarketItem = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;
		const item = await MarketItem.findById(id);
		if (!item || item.status === 'removed') return res.status(404).json({ error: 'Item not found' });

		// Only owner (sellerId) or admin/agent can update
		if (item.sellerId.toString() !== user._id.toString() && !(user.role === 'admin' || user.role === 'agent')) {
			return res.status(403).json({ error: 'Not authorized to update this item' });
		}

		const { title, description, price, category, campus, media, status } = req.body;

		if (title !== undefined) item.title = title;
		if (description !== undefined) item.description = description;
		if (price !== undefined) item.price = Number(price);
		if (category !== undefined) item.category = category;
		if (campus !== undefined) item.campus = campus;
		if (status !== undefined) item.status = status;
		if (media !== undefined) {
			item.media = media.map(m => ({
				cloudinaryPublicId: m.cloudinaryPublicId || m.publicId || m.public_id,
				secureUrl: m.secureUrl || m.url,
				type: m.type || 'image',
			}));
		}

		await item.save();
		res.json({ data: item });
	} catch (err) {
		console.error('Update market item error:', err);
		res.status(500).json({ error: 'Failed to update market item' });
	}
};

// Delete item
exports.deleteMarketItem = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;
		const item = await MarketItem.findById(id);
		if (!item) return res.status(404).json({ error: 'Item not found' });

		// Only owner (sellerId) or admin/agent can delete
		if (item.sellerId.toString() !== user._id.toString() && !(user.role === 'admin' || user.role === 'agent')) {
			return res.status(403).json({ error: 'Not authorized to delete this item' });
		}

		// Cleanup media from Cloudinary
		const files = item.media || [];
		for (const f of files) {
			if (f.cloudinaryPublicId) {
				await deleteFromCloudinary(f.cloudinaryPublicId).catch(() => { });
			}
		}

		await MarketItem.findByIdAndDelete(id);
		res.json({ data: { _id: id, deleted: true } });
	} catch (err) {
		console.error('Delete market item error:', err);
		res.status(500).json({ error: 'Failed to delete market item' });
	}
};
