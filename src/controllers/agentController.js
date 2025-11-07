const User = require('../models/User');
const { uploadToCloudinary } = require('../config/cloudinary');

/**
 * @route   GET /api/agents/search
 * @desc    Search agents by school, rating, location, etc.
 * @access  Public
 */
exports.searchAgents = async (req, res) => {
  try {
    const { school, minRating, maxRating, location, name } = req.query;
    const query = { role: 'agent' };

    if (school) {
      const escapedSchool = school.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.school = { $regex: escapedSchool, $options: 'i' };
    }
    if (minRating || maxRating) {
      query.rating = {};
      if (minRating) query.rating.$gte = Number(minRating);
      if (maxRating) query.rating.$lte = Number(maxRating);
    }
    if (location) {
      const escapedLocation = location.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { 'location.country': { $regex: escapedLocation, $options: 'i' } },
        { 'location.state': { $regex: escapedLocation, $options: 'i' } },
        { 'location.city': { $regex: escapedLocation, $options: 'i' } },
        { 'location.landmark': { $regex: escapedLocation, $options: 'i' } }
      ];
    }
    if (name) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.name = { $regex: escapedName, $options: 'i' };
    }

    const agents = await User.find(query).select('-password');

    res.json({ status: 'success', data: agents });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Agent search failed', error: err.message });
  }
};

/**
 * @route   GET /api/agents/:username
 * @desc    Get public agent profile by username
 * @access  Public
 */
exports.getAgentByUsername = async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ status: 'error', message: 'Username is required' });

    const agent = await User.findOne({ username, role: 'agent' }).select('-password');
    if (!agent) return res.status(404).json({ status: 'error', message: 'Agent not found' });

    res.json({ status: 'success', data: agent });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch agent', error: err.message });
  }
};

/**
 * @route   PUT /api/agents/profile/avatar
 * @desc    Upload or update agent profile picture
 * @access  Private (Agent only)
 */
exports.uploadProfileImage = async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ status: 'error', message: 'Image data is required' });
    }

    // Validate that user is an agent
    if (req.user.role !== 'agent') {
      return res.status(403).json({ status: 'error', message: 'Only agents can upload profile images' });
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(image, {
      folder: `agents/${req.user._id}/profile`,
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto' }
      ],
      maxSizeMB: 5
    });

    // Update user avatar
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: uploadResult.url },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      status: 'success',
      message: 'Profile image uploaded successfully',
      data: {
        avatar: updatedUser.avatar,
        user: updatedUser
      }
    });
  } catch (err) {
    console.error('Profile image upload error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload profile image',
      error: err.message
    });
  }
};
