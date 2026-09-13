'use strict';

/**
 * Messaging Gateway - routes.
 * Mounted by the feature aggregator at /api/v1/features/messaging-gateway
 *
 *  GET  /status                    public provider/config summary (no secrets)
 *  GET  /admin/notifications       admin ledger (sent/failed/pending, delivery)
 *  GET  /admin/notifications/stats admin aggregate counts
 *  POST /admin/notifications/test-send  admin manual dispatch (dev = simulated)
 *  POST /webhook                   provider delivery callbacks (public)
 */

const express = require('express');
const {
  authenticate,
  requireRole,
} = require('../../../src/middleware/authMiddleware');
const controller = require('../controllers/notificationController');

const router = express.Router();

router.get('/status', controller.getStatus);
router.post('/webhook', controller.webhook);

router.get('/admin/notifications', authenticate, requireRole('admin'), controller.listNotifications);
router.get('/admin/notifications/stats', authenticate, requireRole('admin'), controller.stats);
router.post('/admin/notifications/test-send', authenticate, requireRole('admin'), controller.testSend);

module.exports = router;