'use strict';

const express = require('express');
const { monitorStatus, ingestWebhook } = require('../controllers/weatherController');

const router = express.Router();

// Public: monitor status + latest persisted precipitation observations
router.get('/status', monitorStatus);

// External ingest: accept a webhook-pushed observation and correlate it
router.post('/webhook', ingestWebhook);

module.exports = router;