'use strict';

const express = require('express');
const {
  registerVehicle,
  updateLocation,
  listVehicles,
} = require('../controllers/vehicleController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);

// Register a new transport vehicle
router.post('/register', requireRole('admin', 'transporter'), registerVehicle);

// Update a driver's live GPS coordinates (triggers Socket.io broadcast)
router.post('/location', updateLocation);

// Fetch all active vehicle locations for dashboards
router.get('/', listVehicles);

module.exports = router;