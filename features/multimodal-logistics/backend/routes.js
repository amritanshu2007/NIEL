'use strict';

/**
 * Multimodal Logistics - routes.
 *
 *   GET    /api/v1/features/multimodal-logistics/nodes           list (any authenticated)
 *   POST   /api/v1/features/multimodal-logistics/nodes           create (admin)
 *   PATCH  /api/v1/features/multimodal-logistics/nodes/:id       update (admin)
 *   DELETE /api/v1/features/multimodal-logistics/nodes/:id       delete (admin)
 *
 *   GET    /api/v1/features/multimodal-logistics/edges           list (any authenticated)
 *   POST   /api/v1/features/multimodal-logistics/edges           create (admin)
 *   PATCH  /api/v1/features/multimodal-logistics/edges/:id       update (admin)
 *   DELETE /api/v1/features/multimodal-logistics/edges/:id       delete (admin)
 *
 *   GET    /api/v1/features/multimodal-logistics/routes/meta     enums (any authenticated)
 *   POST   /api/v1/features/multimodal-logistics/routes/plan     plan a route (any authenticated)
 *   GET    /api/v1/features/multimodal-logistics/routes/plans    plan history (admin = all)
 *   GET    /api/v1/features/multimodal-logistics/routes/plans/:id plan detail (owner/admin)
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../../../src/middleware/authMiddleware');
const wrap = require('../../../src/utils/wrap');
const ctrl = require('./controller');

router.get('/nodes', authenticate, wrap(ctrl.listNodes));
router.post('/nodes', authenticate, requireRole('admin'), wrap(ctrl.createNode));
router.patch('/nodes/:id', authenticate, requireRole('admin'), wrap(ctrl.updateNode));
router.delete('/nodes/:id', authenticate, requireRole('admin'), wrap(ctrl.deleteNode));

router.get('/edges', authenticate, wrap(ctrl.listEdges));
router.post('/edges', authenticate, requireRole('admin'), wrap(ctrl.createEdge));
router.patch('/edges/:id', authenticate, requireRole('admin'), wrap(ctrl.updateEdge));
router.delete('/edges/:id', authenticate, requireRole('admin'), wrap(ctrl.deleteEdge));

router.get('/routes/meta', authenticate, wrap(ctrl.meta));
router.post('/routes/plan', authenticate, wrap(ctrl.planRoute));
router.get('/routes/plans', authenticate, wrap(ctrl.listPlans));
router.get('/routes/plans/:id', authenticate, wrap(ctrl.getPlan));

module.exports = router;