const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
	* Validates file size for base64 encoded files
	* @param {string} filePath - Path to the file or base64 string
	* @param {number} maxSizeMB - Maximum allowed size in MB
	* @throws {Error} If file size exceeds the limit
	*/
const validateFileSize = (filePath, maxSizeMB = 2) => {
	if (!filePath || !filePath.startsWith('data:')) return;

	// Calculate base64 file size: (base64 length * 3) / 4 - padding
	const base64Data = filePath.split(',')[1] || filePath;
	const fileSizeInBytes = (base64Data.length * 3) / 4 -
		(base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);
	const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

	if (fileSizeInMB > maxSizeMB) {
		throw new Error(`File size exceeds the maximum allowed limit of ${maxSizeMB}MB`);
	}
};

/**
	* Upload file to Cloudinary
	* @param {string} filePath - Path to the file or base64 string
	* @param {object} options - Upload options
	* @returns {Promise<object>} Upload result
	*/
const uploadToCloudinary = async (filePath, options = {}) => {
	try {
		// Validate file size with custom or default limit
		validateFileSize(filePath, options.maxSizeMB || 2);

		const defaultOptions = {
			folder: 'realagent',
			resource_type: 'auto',
			...options,
		};

		const result = await cloudinary.uploader.upload(filePath, defaultOptions);

		return {
			url: result.secure_url,
			publicId: result.public_id,
			format: result.format,
			width: result.width,
			height: result.height,
		};
	} catch (error) {
		console.error('Cloudinary upload error:', error);
		throw new Error('Failed to upload file to Cloudinary');
	}
};

/**
	* Upload agent verification document using preset
	* @param {string} filePath - Path to the file or base64 string
	* @param {string} agentId - Agent's user ID for folder organization
	* @returns {Promise<object>} Upload result
	*/
const uploadAgentDocument = async (filePath, agentId) => {
	try {
		// Validate agent ID
		if (!agentId) {
			throw new Error('Agent ID is required for document upload');
		}

		// Validate file size (2MB limit)
		validateFileSize(filePath, 2);

		const result = await cloudinary.uploader.upload(filePath, {
			upload_preset: 'ml_default', // Agent docs preset
			folder: `agent/docs/${agentId}`, // Create agent-specific folder
			resource_type: 'auto',
		});

		return {
			url: result.secure_url,
			publicId: result.public_id,
			format: result.format,
			width: result.width,
			height: result.height,
		};
	} catch (error) {
		console.error('Agent document upload error:', error);
		throw new Error('Failed to upload agent document to Cloudinary');
	}
};

/**
	* Upload property media (images/videos) using preset
	* @param {string} filePath - Path to the file or base64 string
	* @param {string} agentId - Agent's user ID for folder organization
	* @param {string} propertyId - Property ID for further organization
	* @returns {Promise<object>} Upload result
	*/
const uploadPropertyMedia = async (filePath, agentId, propertyId) => {
	try {
		// Validate required IDs
		if (!agentId) {
			throw new Error('Agent ID is required for property media upload');
		}

		// Determine file type and set size limit
		let maxSizeMB = 3;
		if (filePath && filePath.startsWith('data:video')) {
			maxSizeMB = 15;
		}
		validateFileSize(filePath, maxSizeMB);

		// Construct folder path - using propertyId if available
		const folder = propertyId
			? `agent/properties/${agentId}/${propertyId}`
			: `agent/properties/${agentId}`;

		const result = await cloudinary.uploader.upload(filePath, {
			upload_preset: 'blkd1c3b', // Agent medias preset
			folder: folder,
			resource_type: 'auto',
		});

		return {
			url: result.secure_url,
			publicId: result.public_id,
			format: result.format,
			width: result.width,
			height: result.height,
		};
	} catch (error) {
		console.error('Property media upload error:', error);
		throw new Error('Failed to upload property media to Cloudinary');
	}
};

/**
	* Delete file from Cloudinary
	* @param {string} publicId - Public ID of the file
	* @returns {Promise<object>} Deletion result
	*/
const deleteFromCloudinary = async (publicId) => {
	try {
		const result = await cloudinary.uploader.destroy(publicId);
		return result;
	} catch (error) {
		console.error('Cloudinary delete error:', error);
		throw new Error('Failed to delete file from Cloudinary');
	}
};

/**
	* Upload roommate post media using preset
	* @param {string} filePath - Path to the file or base64 string
	* @param {string} userId - User's ID for folder organization
	* @param {string} postId - Roommate post ID for further organization
	* @returns {Promise<object>} Upload result
	*/
const uploadRoommatePostMedia = async (filePath, userId, postId) => {
	try {
		// Validate required IDs
		if (!userId) {
			throw new Error('User ID is required for roommate post media upload');
		}

		// Validate file size (2MB limit)
		validateFileSize(filePath, 2);

		// Construct folder path - using postId if available
		const folder = postId
			? `user/roommate-posts/${userId}/${postId}`
			: `user/roommate-posts/${userId}`;

		const result = await cloudinary.uploader.upload(filePath, {
			upload_preset: 'xlqs0c3b', // Roommate post media preset
			folder: folder,
			resource_type: 'auto',
		});

		return {
			url: result.secure_url,
			publicId: result.public_id,
			format: result.format,
			width: result.width,
			height: result.height,
		};
	} catch (error) {
		console.error('Roommate post media upload error:', error);
		throw new Error('Failed to upload roommate post media to Cloudinary');
	}
};

/**
	* Upload user profile images
	* @param {string} filePath - Path to the file or base64 string
	* @param {string} userId - User's ID for folder organization
	* @param {string} type - Type of profile image (e.g., 'avatar', 'cover', 'gallery')
	* @returns {Promise<object>} Upload result
	*/
const uploadUserProfileImage = async (filePath, userId, type = 'avatar') => {
	try {
		// Validate required IDs
		if (!userId) {
			throw new Error('User ID is required for profile image upload');
		}

		// Validate file size (2MB limit)
		validateFileSize(filePath, 2);

		// Create folder structure based on user ID and type
		const folder = `user/profiles/${userId}/${type}`;

		const result = await cloudinary.uploader.upload(filePath, {
			upload_preset: 'wkcp2b3b', // User profile preset
			folder: folder,
			resource_type: 'image', // Force image type only
			transformation: [
				{ quality: 'auto', fetch_format: 'auto' } // Auto optimize
			]
		});

		return {
			url: result.secure_url,
			publicId: result.public_id,
			format: result.format,
			width: result.width,
			height: result.height,
		};
	} catch (error) {
		console.error('User profile image upload error:', error);
		throw new Error('Failed to upload user profile image to Cloudinary');
	}
};

module.exports = {
	cloudinary,
	uploadToCloudinary,
	uploadAgentDocument,
	uploadPropertyMedia,
	uploadRoommatePostMedia,
	uploadUserProfileImage,
	deleteFromCloudinary,
};
