const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

// Public list of active plans (could be public)
router.get('/', planController.listPlans);

// Admin CRUD
router.post('/', auth, requireAdmin, planController.createPlan);
router.get('/:id', planController.getPlan);
router.put('/:id', auth, requireAdmin, planController.updatePlan);
router.delete('/:id', auth, requireAdmin, planController.deletePlan);

module.exports = router;
