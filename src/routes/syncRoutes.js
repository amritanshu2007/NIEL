'use strict';

const express = require('express');
const { syncBatch } = require('../controllers/syncController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Protected: ingest offline mutation logs from low-connectivity clients
router.post('/batch', authenticate, syncBatch);

module.exports = router;