const express = require('express');
const router = express.Router();
const feeController = require('../controllers/feeController');

// GET /api/fees/roommate-post - get roommate post fee
router.get('/roommate-post', feeController.getRoommatePostFee);

module.exports = router;
