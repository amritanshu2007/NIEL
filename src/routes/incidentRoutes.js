'use strict';

const express = require('express');
const { createIncident, listIncidents } = require('../controllers/incidentController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Protected: admins and field officers may report an incident
router.post('/', authenticate, requireRole('admin', 'field_officer'), createIncident);

// Protected: list incidents (optional ?severity, ?incident_type filters)
router.get('/', authenticate, listIncidents);

module.exports = router;