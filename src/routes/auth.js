/**
	* Authentication Routes
	* Routes for user registration, login, password reset, etc.
	*/

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const {
	loginLimiter,
	registerLimiter,
	passwordResetLimiter,
	authLimiter
} = require('../middleware/authRateLimiter');
const profileUpdateLimiter = require('../middleware/profileRateLimiter');

// Public routes with rate limiting
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/verify-email', authLimiter, authController.verifyEmail);
router.post('/request-reset', passwordResetLimiter, authController.requestPasswordReset);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

// Protected routes (require authentication)
router.get('/me', auth, authController.getMe);
router.put('/me', auth, profileUpdateLimiter, authController.updateProfile);
router.post('/logout', auth, authController.logout);

// Public: Get user by ID
router.get('/users/:id', authController.getUserById);

module.exports = router;
