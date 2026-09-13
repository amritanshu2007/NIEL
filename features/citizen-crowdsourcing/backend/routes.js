'use strict';

/**
 * Citizen Crowdsourcing Portal - routes.
 * Mounted by the feature aggregator at /api/v1/features/citizen-crowdsourcing
 *
 * Public endpoints (rate-limited, owner-gated private data):
 *   POST   /reports          create a report (photo optional)
 *   GET    /reports          public VERIFIED/RESOLVED community feed
 *   GET    /reports/:id      one report (owns/lifecycle-gated)
 *   POST   /reports/:id/sync replay an offline draft (owner/identifier-gated)
 *
 * Admin endpoints (JWT + requireRole('admin')):
 *   GET    /admin/reports         review queue
 *   GET    /admin/reports/stats   status counts
 *   PATCH  /admin/reports/:id/status  verify | reject | resolve | ...
 */

const express = require('express');
const {
  authenticate,
  requireRole,
} = require('../../../src/middleware/authMiddleware');
const { uploadSingleSafe } = require('./upload');
const controller = require('./controller');

const router = express.Router();

// Citizen entry points (photo upload protected by session/gating in handlers).
router.post('/reports', uploadSingleSafe, controller.createReport);
router.get('/reports', controller.listPublic);
router.get('/reports/:id', controller.getReport);
router.post('/reports/:id/sync', uploadSingleSafe, controller.syncReport);

// Admin review interface (reuses the existing JWT/RBAC system).
router.get('/admin/reports', authenticate, requireRole('admin'), controller.adminList);
router.get('/admin/reports/stats', authenticate, requireRole('admin'), controller.adminStats);
router.patch('/admin/reports/:id/status', authenticate, requireRole('admin'), controller.adminPatchStatus);

module.exports = router;