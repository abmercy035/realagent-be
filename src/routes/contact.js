/**
 * Contact Routes
 * Public routes for contact form submission
 */

const express = require('express');
const router = express.Router();
const { submitContactForm } = require('../controllers/contactController');

/**
 * @route   POST /api/contact
 * @desc    Submit contact form
 * @access  Public
 */
router.post('/', submitContactForm);

module.exports = router;
