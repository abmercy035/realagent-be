/**
 * routes/users.js
 *
 * GET /api/users/me — retrieves the current user's profile fields.
 * PATCH /api/users/me — updates fullName, phone, and avatarUrl.
 *
 * Migrated from: app/api/users/me/route.ts
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authNew } = require('../middleware/auth');
const { rateLimit } = require('express-rate-limit');

const profileReadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

const profileUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// ---------------------------------------------------------------------------
// GET /api/users/me — Fetch profile
// ---------------------------------------------------------------------------
router.get('/me', profileReadLimiter, authNew, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, status: 'error', message: 'Account not found.' });
    }

    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Profile retrieved.',
      data: user.toPublicProfile(),
    });
  } catch (error) {
    console.error('Get profile me error:', error);
    res.status(500).json({ success: false, status: 'error', message: 'Failed to retrieve profile.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/users/me — Update profile
// ---------------------------------------------------------------------------
router.patch('/me', profileUpdateLimiter, authNew, async (req, res) => {
  try {
    const { fullName, phone, avatarUrl, username } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, status: 'error', message: 'Account not found.' });
    }

    if (username !== undefined) {
      const cleanUsername = username.trim().toLowerCase();
      if (cleanUsername) {
        if (!/^[a-z0-9_-]{3,30}$/.test(cleanUsername)) {
          return res.status(400).json({
            success: false,
            status: 'error',
            message: 'Username must be between 3 and 30 characters and contain only lowercase letters, numbers, hyphens, or underscores.',
          });
        }
        // Check uniqueness
        const exists = await User.findOne({ username: cleanUsername, _id: { $ne: req.user._id } });
        if (exists) {
          return res.status(409).json({
            success: false,
            status: 'error',
            message: 'Username is already taken.',
          });
        }
        user.username = cleanUsername;
      }
    }

    if (fullName !== undefined) {
      if (fullName.trim().length < 2 || fullName.trim().length > 100) {
        return res.status(400).json({ success: false, status: 'error', message: 'Name must be between 2 and 100 characters.' });
      }
      user.fullName = fullName.trim();
      user.name = fullName.trim(); // Sync legacy name field as well
    }

    if (phone !== undefined) {
      if (phone.trim() && !/^\+?[0-9\s-]{7,20}$/.test(phone.trim())) {
        return res.status(400).json({ success: false, status: 'error', message: 'Invalid phone number format.' });
      }
      user.phone = phone.trim();
    }

    if (avatarUrl !== undefined) {
      user.avatarUrl = avatarUrl;
      user.avatar = avatarUrl; // Sync legacy avatar field as well
    }

    await user.save();

    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Profile updated.',
    });
  } catch (error) {
    console.error('Update profile me error:', error);
    res.status(500).json({ success: false, status: 'error', message: 'Failed to update profile.' });
  }
});

module.exports = router;
