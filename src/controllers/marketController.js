const MarketItem = require('../models/MarketItem');
const User = require('../models/User');
const { deleteFromCloudinary, uploadToCloudinary } = require('../config/cloudinary');

// List market items with pagination and filters
exports.listMarketItems = async (req, res) => {
	try {
		const page = parseInt(req.query.page, 10) || 1;
		const limit = parseInt(req.query.limit, 10) || 12;
		const skip = (page - 1) * limit;

		const filter = { status: { $ne: 'deleted' } };

		if (req.query.category) filter.category = req.query.category;
		if (req.query.school) filter.school = req.query.school;
		if (req.query.minPrice) filter['price.amount'] = { ...(filter['price.amount'] || {}), $gte: Number(req.query.minPrice) };
		if (req.query.maxPrice) filter['price.amount'] = { ...(filter['price.amount'] || {}), $lte: Number(req.query.maxPrice) };
		if (req.query.tag) filter.tags = req.query.tag;

		// Text search
		if (req.query.search) {
			filter.$text = { $search: req.query.search };
		}

		const [items, total] = await Promise.all([
		MarketItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'name avatar school role username'),
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
		const items = await MarketItem.find({ status: { $ne: 'deleted' } })
			.sort({ createdAt: -1 })
			.limit(limit)
			.populate('owner', 'name avatar school role username');

		res.json({ data: items });
	} catch (err) {
		console.error('Featured market items error:', err);
		res.status(500).json({ error: 'Failed to fetch featured market items' });
	}
};

// List items belonging to the authenticated user (include deleted)
exports.listUserMarketItems = async (req, res) => {
	try {
		const page = parseInt(req.query.page, 10) || 1;
		const limit = parseInt(req.query.limit, 10) || 20;
		const skip = (page - 1) * limit;

		if (!req.user || !req.user._id) return res.status(401).json({ error: 'Authentication required' });

		const filter = { owner: req.user._id }; // include all statuses (active/closed/deleted)

		// optional status filter if requested (e.g., ?status=deleted)
		if (req.query.status) filter.status = req.query.status;

		const [items, total] = await Promise.all([
			MarketItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'name avatar school role username'),
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
		const item = await MarketItem.findById(id).populate('owner', 'name avatar school role username');
		if (!item || item.status === 'deleted') return res.status(404).json({ error: 'Item not found' });
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
			images = [],
			thumbnail,
			category,
			contact,
			tags = [],
			location = {},
			school,
		} = req.body;


		if (!title || !description ||!contact.phone|| !price || typeof price.amount === 'undefined' || !school) {
			return res.status(400).json({ error: 'title, description, price, contact and school are required' });
		}
		if (contact.phone.length < 8 ) {
			return res.status(400).json({ error: 'contact must be a valid phone number' });
		}

		if (images.length < 1) return res.status(400).json({ error: 'Please add atleast one image of the item' });

		if (images && images.length > 2) return res.status(400).json({ error: 'Maximum of 2 images allowed' });

		// If images are provided as base64/data URIs (strings), upload them to Cloudinary
		const processedImages = [];
		let thumbnailUrl = null;
		let thumbnailPublicId = null;

		if (images && images.length) {
			// Strict policy: if any upload fails, abort the request and return an error.
			for (const img of images) {
				if (typeof img === 'string' && img.startsWith && img.startsWith('data:')) {
					// upload to cloudinary (let upload errors bubble up)
					const uploadRes = await uploadToCloudinary(img, { folder: 'campus-market' });
					const imageObj = { url: uploadRes.url, publicId: uploadRes.publicId, format: uploadRes.format };
					processedImages.push(imageObj);
					if (!thumbnailUrl) {
						thumbnailUrl = uploadRes.url;
						thumbnailPublicId = uploadRes.publicId;
					}
				} else if (img && typeof img === 'object' && (img.url || img.publicId || img.public_id)) {
					// already an object (probably uploaded from frontend)
					processedImages.push({ url: img.url || img.url, publicId: img.publicId || img.public_id });
					if (!thumbnailUrl && (img.url || img.publicId || img.public_id)) {
						thumbnailUrl = img.url || null;
						thumbnailPublicId = img.publicId || img.public_id || null;
					}
				} else if (typeof img === 'string') {
					// plain URL string
					processedImages.push({ url: img });
					if (!thumbnailUrl) thumbnailUrl = img;
				} else {
					// unknown image type - fail strict
					throw new Error('Invalid image format in request');
				}
			}
		}

		const itemPayload = {
			title,
			description,
			price,
			images: processedImages,
			thumbnail: thumbnail || thumbnailUrl || (processedImages[0] && processedImages[0].url) || null,
			thumbnailPublicId: thumbnailPublicId || (processedImages[0] && processedImages[0].publicId) || null,
			category,
			tags,
			location,
			contact,
			owner: userId,
			school,
		};

		const item = await MarketItem.create(itemPayload);
		res.status(201).json({ data: item });
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
		// Build updateFields from body but avoid setting undefined values which would
		// overwrite existing required fields unintentionally.
		const updateFields = (({ title, description, price, images, thumbnail, category, tags, location, contact, status, school }) => ({ title, description, price, images, thumbnail, category, tags, location, contact, status, school }))(req.body);

		// Remove keys that are undefined (i.e., not provided) to preserve existing values
		Object.keys(updateFields).forEach((k) => {
			if (typeof updateFields[k] === 'undefined') delete updateFields[k];
		});
		if (!item || item.status === 'deleted') return res.status(404).json({ error: 'Item not found' });

		// Only owner or admin/agent can update
		if (item.owner.toString() !== user._id.toString() && !(user.role === 'admin' || user.role === 'agent')) {
			return res.status(403).json({ error: 'Not authorized to update this item' });
		}

		// Handle nested price merging: only update price if amount provided
		if (updateFields.price) {
			const priceUpdate = updateFields.price;
			if (typeof priceUpdate.amount === 'undefined') {
				// ignore price update if amount isn't provided to avoid validation errors
				delete updateFields.price;
			} else {
				// merge into existing item.price
				item.price = Object.assign({}, item.price || {}, priceUpdate);
				delete updateFields.price;
			}
		}

		// Restrict image updates: only agents or admins may update media.
		if (updateFields.images && Array.isArray(updateFields.images)) {
			if (!(user && (user.role === 'admin'))) {
				// remove media updates from payload for regular users
				delete updateFields.images;
				delete updateFields.thumbnail;
				delete updateFields.thumbnailPublicId;
			} else {
				// agent/admin - strict upload policy: any upload failure should abort
				const newImages = [];
				for (const img of updateFields.images) {
					if (typeof img === 'string' && img.startsWith && img.startsWith('data:')) {
						const uploadRes = await uploadToCloudinary(img, { folder: 'campus-market' });
						newImages.push({ url: uploadRes.url, publicId: uploadRes.publicId, format: uploadRes.format });
					} else if (img && typeof img === 'object' && (img.url || img.publicId || img.public_id)) {
						newImages.push({ url: img.url || img.url, publicId: img.publicId || img.public_id });
					} else if (typeof img === 'string') {
						newImages.push({ url: img });
					} else {
						throw new Error('Invalid image format in update payload');
					}
				}
				updateFields.images = newImages;
				if (!updateFields.thumbnail && newImages[0]) {
					updateFields.thumbnail = newImages[0].url;
					updateFields.thumbnailPublicId = newImages[0].publicId || null;
				}
			}
		}

		// Apply remaining updates
		Object.assign(item, updateFields);
		await item.save();
		res.json({ data: item });
	} catch (err) {
		console.error('Update market item error:', err);
		res.status(500).json({ error: 'Failed to update market item' });
	}
};

// Delete (soft) item
exports.deleteMarketItem = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;
		// HARD delete: permanently remove the document from the database.
		// Note: this is irreversible. We still enforce the same authorization checks.
		const item = await MarketItem.findById(id);
		if (!item) return res.status(404).json({ error: 'Item not found' });

		// Only owner or admin/agent can delete
		if (item.owner.toString() !== user._id.toString() && !(user.role === 'admin' || user.role === 'agent')) {
			return res.status(403).json({ error: 'Not authorized to delete this item' });
		}

		// Attempt to delete associated media from Cloudinary if public IDs are available.
		try {
			const media = item.images || [];
			for (const m of media) {
				try {
					// m can be an object { url, publicId } or a plain string
					const publicId = m && (m.publicId || m.public_id || null);
					if (publicId) {
						await deleteFromCloudinary(publicId);
					}
				} catch (err) {
					console.warn('Failed to delete media from Cloudinary for item', id, err && err.message ? err.message : err);
					// continue deleting other media
				}
			}
			// Also attempt to delete thumbnail public id if present on the item
			const thumbPublicId = item.thumbnailPublicId || item.thumbnail_public_id || null;
			if (thumbPublicId) {
				try {
					await deleteFromCloudinary(thumbPublicId);
				} catch (err) {
					console.warn('Failed to delete thumbnail from Cloudinary for item', id, err && err.message ? err.message : err);
				}
			}
		} catch (e) {
			console.warn('Media cleanup encountered an error for item', id, e && e.message ? e.message : e);
			// proceed with deleting the DB record regardless
		}

		await MarketItem.findByIdAndDelete(id);
		res.json({ data: { _id: id, deleted: true } });
	} catch (err) {
		console.error('Delete market item error:', err);
		res.status(500).json({ error: 'Failed to delete market item' });
	}
};
