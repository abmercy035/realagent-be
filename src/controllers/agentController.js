const User = require('../models/User');

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
      query.school = { $regex: school, $options: 'i' };
    }
    if (minRating || maxRating) {
      query.rating = {};
      if (minRating) query.rating.$gte = Number(minRating);
      if (maxRating) query.rating.$lte = Number(maxRating);
    }
    if (location) {
      query['location.city'] = { $regex: location, $options: 'i' };
    }
    if (name) {
      query.name = { $regex: name, $options: 'i' };
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
