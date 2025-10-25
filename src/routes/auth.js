/**
	* Authentication Routes
	* Routes for user registration, login, password reset, etc.
	*/

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-email', authController.verifyEmail);
router.post('/request-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);

// Protected routes (require authentication)
router.get('/me', auth, authController.getMe);
router.put('/me', auth, authController.updateProfile);
router.post('/logout', auth, authController.logout);

// Public: Get user by ID
router.get('/users/:id', authController.getUserById);

module.exports = router;
