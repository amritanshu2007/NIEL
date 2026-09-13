'use strict';

/**
 * Predictive Monsoon - routes.
 *
 *   GET /api/v1/features/predictive-monsoon/heatmap   (any authenticated)
 *   GET /api/v1/features/predictive-monsoon/risk      (any authenticated)
 *   GET /api/v1/features/predictive-monsoon/metrics   (any authenticated)
 *   POST /api/v1/features/predictive-monsoon/run      (admin)
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../../../src/middleware/authMiddleware');
const wrap = require('../../../src/utils/wrap');
const ctrl = require('../controllers/monsoonController');

router.get('/heatmap', authenticate, wrap(ctrl.heatmap));
router.get('/risk', authenticate, wrap(ctrl.risk));
router.get('/metrics', authenticate, wrap(ctrl.metrics));
router.post('/run', authenticate, requireRole('admin'), wrap(ctrl.run));

module.exports = router;