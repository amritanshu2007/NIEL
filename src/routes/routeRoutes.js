'use strict';

const express = require('express');
const { optimize } = require('../controllers/routeController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Protected: optimize the safest route between start and end coordinates
router.post('/optimize', authenticate, optimize);

module.exports = router;