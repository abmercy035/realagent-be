/**
	* Property Model
	* Handles property listings created by verified agents
	*/

const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
	{
		// ===========================
		// BASIC INFORMATION
		// ===========================
		title: {
			type: String,
			required: [true, 'Property title is required'],
			trim: true,
			minlength: [10, 'Title must be at least 10 characters'],
			maxlength: [200, 'Title cannot exceed 200 characters'],
			index: true, // For search functionality
		},
		description: {
			type: String,
			required: [true, 'Property description is required'],
			trim: true,
			minlength: [50, 'Description must be at least 50 characters'],
			maxlength: [5000, 'Description cannot exceed 5000 characters'],
		},

		// ===========================
		// PROPERTY TYPE & CATEGORY
		// ===========================
		propertyType: {
			type: String,
			enum: {
				values: [
					'self-con',           // Self contained
					'a-room',             // Single room
					'flat',               // General flat
					'room-parlour',       // 1 bedroom and parlour
					'2-bed-flat',         // 2 bedroom and parlour flat
					'3-bed-flat',         // 3 bedroom and parlour flat
					'duplex',
					'shared-apartment',
					'hostel',
					'house',
					'studio',
					'lodge',
					'other',
				],
				message: 'Invalid property type',
			},
			required: [true, 'Property type is required'],
			index: true,
		},

		category: {
			type: String,
			enum: {
				values: ['student', 'family', 'professional', 'any'],
				message: 'Invalid category',
			},
			default: 'any',
		},
		listType: {
			type: String,
			enum: {
				values: ['rent', 'sale'],
				message: 'Invalid list type',
			},
			default: 'rent',
		},

		// ===========================
		// LOCATION
		// ===========================
		location: {
			address: {
				type: String,
				required: [true, 'Address is required'],
				trim: true,
			},
			city: {
				type: String,
				required: [true, 'City is required'],
				trim: true,
				index: true,
			},
			state: {
				type: String,
				required: [true, 'State is required'],
				trim: true,
				index: true,
			},
			country: {
				type: String,
				default: 'Nigeria',
				trim: true,
			},
			landmark: {
				type: String,
				trim: true,
			},
			// For future map integration
			coordinates: {
				latitude: Number,
				longitude: Number,
			},
		},

		// ===========================
		// PRICING
		// ===========================
		pricing: {
			amount: {
				type: Number,
				required: [true, 'Price is required'],
				min: [0, 'Price cannot be negative'],
			},
			currency: {
				type: String,
				default: 'NGN',
			},
			period: {
				type: String,
				enum: ['per-year', 'per-semester', 'per-month', 'one-time'],
				default: 'per-year',
			},
			negotiable: {
				type: Boolean,
				default: false,
			},
		},

		// ===========================
		// PROPERTY DETAILS
		// ===========================
		details: {
			bedrooms: {
				type: String,
			},
			bathrooms: {
				type: String,
			},
			toilets: {
				type: String,
			},
			furnishingStatus: {
				type: String,
				enum: ['furnished', 'semi-furnished', 'unfurnished'],
				default: 'unfurnished',
			},
			floorNumber: {
				type: String,
			},
			totalFloors: {
				type: String,
			},
			squareMeters: {
				type: String,
			},
		},

		// ===========================
		// AMENITIES
		// ===========================
		amenities: [
			{
				type: String,
				enum: [
					'electricity',
					"swimming-pool",
					"furnished",
					'water',
					'wifi',
					'parking',
					'security',
					'generator',
					'water-supply',
					'air-conditioning',
					'kitchen',
					'laundry',
					'balcony',
					'pool',
					'gym',
					'elevator',
					'cctv',
					'fence',
					'gate',
					'garden',
					'storage',
					'study-area',
				],
			},
		],

		// ===========================
		// MEDIA
		// ===========================
		media: {
			images: [
				{
					url: {
						type: String,
						required: true,
					},
					publicId: {
						type: String,
						required: true,
					},
					caption: String,
					isPrimary: {
						type: Boolean,
						default: false,
					},
				},
			],
			videos: [
				{
					url: {
						type: String,
						required: true,
					},
					publicId: {
						type: String,
						required: true,
					},
					thumbnail: String,
					duration: Number,
				},
			],
			virtualTour: {
				url: String,
				provider: String, // e.g., 'matterport', 'google-street-view'
			},
		},

		// ===========================
		// PAID-TO-VIEW SETTINGS
		// ===========================
		paidToView: {
			enabled: {
				type: Boolean,
				default: false,
			},
			unlockPrice: {
				type: Number,
				min: 0,
				default: 0,
			},
			currency: {
				type: String,
				default: 'NGN',
			},
			// Users who have unlocked this property
			unlockedBy: [
				{
					userId: {
						type: mongoose.Schema.Types.ObjectId,
						ref: 'User',
					},
					unlockedAt: {
						type: Date,
						default: Date.now,
					},
					transactionId: String,
				},
			],
		},

		// ===========================
		// VACANCY STATUS
		// ===========================
		vacancy: {
			status: {
				type: String,
				enum: ['vacant', 'occupied', 'reserved'],
				default: 'vacant',
				index: true,
			},
			availableFrom: {
				type: Date,
			},
			currentTenant: {
				moveInDate: Date,
				leaseDuration: Number, // in months
				leaseExpiryDate: Date,
			},
		},

		// ===========================
		// AGENT INFORMATION
		// ===========================
		agent: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'Agent reference is required'],
			index: true,
		},

		// ===========================
		// ENGAGEMENT METRICS
		// ===========================
		metrics: {
			views: {
				type: Number,
				default: 0,
			},
			uniqueViews: {
				type: Number,
				default: 0,
			},
			// Track unique viewers
			viewedBy: [
				{
					userId: {
						type: mongoose.Schema.Types.ObjectId,
						ref: 'User',
					},
					viewedAt: {
						type: Date,
						default: Date.now,
					},
					viewCount: {
						type: Number,
						default: 1,
					},
				},
			],
			bookmarks: {
				type: Number,
				default: 0,
			},
			shares: {
				type: Number,
				default: 0,
			},
			comments: {
				type: Number,
				default: 0,
			},
		},

		// ===========================
		// RATINGS & REVIEWS
		// ===========================
		ratings: {
			average: {
				type: Number,
				default: 0,
				min: 0,
				max: 5,
			},
			count: {
				type: Number,
				default: 0,
			},
		},

		// ===========================
		// STATUS & MODERATION
		// ===========================
		status: {
			type: String,
			enum: {
				values: ['active', 'inactive', 'pending', 'suspended', 'deleted'],
				message: 'Invalid status',
			},
			default: 'active',
			index: true,
		},
		isVerified: {
			type: Boolean,
			default: false, // Admin can verify quality listings
		},
		isFeatured: {
			type: Boolean,
			default: false, // For promoted/sponsored listings
		},

		// ===========================
		// PAYMENT & LISTING FEE
		// ===========================
		listingFee: {
			paid: {
				type: Boolean,
				default: false,
			},
			amount: {
				type: Number,
				default: 0,
			},
			transactionId: String,
			paidAt: Date,
		},

		// ===========================
		// ADDITIONAL INFO
		// ===========================
		rules: {
			type: String,
			maxlength: [1000, 'Rules cannot exceed 1000 characters'],
		},
		nearbyFacilities: [
			{
				type: {
					type: String,
					enum: ['university', 'school', 'hospital', 'market', 'bus-stop', 'restaurant', 'other'],
				},
				name: String,
				distance: String, // e.g., "500m", "2km"
			},
		],

		// ===========================
		// TIMESTAMPS
		// ===========================
		publishedAt: {
			type: Date,
		},
		expiresAt: {
			type: Date,
			index: true,
		},
	},
	{
		timestamps: true, // createdAt, updatedAt
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// Pre-save hook: validate media shape and ensure url/publicId are present when provided
propertySchema.pre('validate', function (next) {
	try {
		const doc = this;
		if (doc.media) {
			// images
			if (Array.isArray(doc.media.images)) {
				doc.media.images = doc.media.images.map((img) => {
					if (!img || !img.url) throw new Error('Each image must include a url');
					// publicId is required by schema; allow nulls but normalize to string if present
					if (!img.publicId) img.publicId = null;
					if (typeof img.caption === 'undefined') img.caption = null;
					if (typeof img.isPrimary === 'undefined') img.isPrimary = false;
					return img;
				});
			} else {
				doc.media.images = [];
			}

			// videos
			if (Array.isArray(doc.media.videos)) {
				doc.media.videos = doc.media.videos.map((v) => {
					if (!v || !v.url) throw new Error('Each video must include a url');
					if (!v.publicId) v.publicId = null;
					if (typeof v.thumbnail === 'undefined') v.thumbnail = null;
					if (typeof v.duration === 'undefined') v.duration = null;
					return v;
				});
			} else {
				doc.media.videos = [];
			}
		}
		next();
	} catch (err) {
		next(err);
	}
});

// ===========================
// INDEXES FOR SEARCH & PERFORMANCE
// ===========================
propertySchema.index({ title: 'text', description: 'text', 'location.city': 'text' });
propertySchema.index({ 'pricing.amount': 1, status: 1 });
propertySchema.index({ agent: 1, status: 1 });
propertySchema.index({ createdAt: -1 });

// ===========================
// VIRTUAL FIELDS
// ===========================

// Get primary image
propertySchema.virtual('primaryImage').get(function () {
	// Safely handle missing media/images to avoid runtime errors when documents are partially populated
	const images = this.media && Array.isArray(this.media.images) ? this.media.images : [];
	const primary = images.find((img) => img && img.isPrimary);
	return primary || images[0] || null;
});

// Check if property is available
propertySchema.virtual('isAvailable').get(function () {
	return this.vacancy.status === 'vacant' && this.status === 'active';
});

// ===========================
// METHODS
// ===========================

/**
	* Check if user has unlocked this property
	*/
propertySchema.methods.isUnlockedBy = function (userId) {
	if (!this.paidToView.enabled) return true;
	return this.paidToView.unlockedBy.some(
		(unlock) => unlock.userId.toString() === userId.toString()
	);
};

/**
	* Increment view count
	*/
propertySchema.methods.incrementViews = async function (userId = null) {
	this.metrics.views += 1;

	if (userId) {
		const existingView = this.metrics.viewedBy.find(
			(view) => view.userId.toString() === userId.toString()
		);

		if (existingView) {
			existingView.viewCount += 1;
			existingView.viewedAt = Date.now();
		} else {
			this.metrics.viewedBy.push({ userId, viewCount: 1 });
			this.metrics.uniqueViews += 1;
		}
	}

	await this.save();
};

/**
	* Unlock property for user
	*/
propertySchema.methods.unlockForUser = async function (userId, transactionId) {
	if (!this.paidToView.enabled) return;

	const alreadyUnlocked = this.paidToView.unlockedBy.some(
		(unlock) => unlock.userId.toString() === userId.toString()
	);

	if (!alreadyUnlocked) {
		this.paidToView.unlockedBy.push({
			userId,
			unlockedAt: Date.now(),
			transactionId,
		});
		await this.save();
	}
};

/**
	* Update average rating
	*/
propertySchema.methods.updateRating = async function (newRating, totalRatings) {
	this.ratings.count = totalRatings;
	this.ratings.average = newRating;
	await this.save();
};

// ===========================
// MIDDLEWARE
// ===========================

// Set publishedAt on first save
propertySchema.pre('save', function (next) {
	if (this.isNew && this.status === 'active' && !this.publishedAt) {
		this.publishedAt = Date.now();
	}
	next();
});

// Calculate lease expiry date
propertySchema.pre('save', function (next) {
	if (
		this.vacancy.currentTenant &&
		this.vacancy.currentTenant.moveInDate &&
		this.vacancy.currentTenant.leaseDuration
	) {
		const moveIn = new Date(this.vacancy.currentTenant.moveInDate);
		const duration = this.vacancy.currentTenant.leaseDuration;
		const expiry = new Date(moveIn);
		expiry.setMonth(expiry.getMonth() + duration);
		this.vacancy.currentTenant.leaseExpiryDate = expiry;
	}
	next();
});

// ===========================
// STATIC METHODS
// ===========================

/**
	* Search properties with filters
	*/
propertySchema.statics.searchProperties = async function (filters) {
	const query = { status: 'active' };

	// Text search
	if (filters.search) {
		query.$text = { $search: filters.search };
	}

	// Property type filter
	if (filters.propertyType) {
		query.propertyType = filters.propertyType;
	}

	// Location filter
	if (filters.city) {
		query['location.city'] = new RegExp(filters.city, 'i');
	}
	if (filters.state) {
		query['location.state'] = new RegExp(filters.state, 'i');
	}

	// Price range filter
	if (filters.minPrice || filters.maxPrice) {
		query['pricing.amount'] = {};
		if (filters.minPrice) {
			query['pricing.amount'].$gte = filters.minPrice;
		}
		if (filters.maxPrice) {
			query['pricing.amount'].$lte = filters.maxPrice;
		}
	}

	// Vacancy filter
	if (filters.availability) {
		query['vacancy.status'] = filters.availability;
	}

	// Amenities filter
	if (filters.amenities && filters.amenities.length > 0) {
		query.amenities = { $all: filters.amenities };
	}

	// Bedroom filter
	if (filters.bedrooms) {
		query['details.bedrooms'] = filters.bedrooms;
	}

	return query;
};

const Property = mongoose.model('Property', propertySchema);

module.exports = Property;
