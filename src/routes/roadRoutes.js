'use strict';

const express = require('express');
const { listRoads, updateRoadStatus } = require('../controllers/roadController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Public: fetch all roads with status and geographic paths
router.get('/', listRoads);

// Protected: update a road's status (OPEN, RISKY, BLOCKED)
router.put('/:id/status', authenticate, updateRoadStatus);

module.exports = router;