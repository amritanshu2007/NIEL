'use strict';

/**
 * Feature aggregator.
 *
 * Mounts every feature module's router under one namespace and starts every
 * feature background worker. All mounts are STRICTLY additive - existing
 * platform routes, sockets and engines are untouched.
 *
 *   GET/POST /api/v1/features/citizen-crowdsourcing/...   citizen portal
 *   GET/POST /api/v1/features/messaging-gateway/...       messaging gateway
 *   (more features register here additively)
 */

const { Router } = require('express');

const citizenRoutes = require('./citizen-crowdsourcing/backend/routes');
const messagingRoutes = require('./messaging-gateway/routes');

const featuresRouter = Router();
featuresRouter.use('/citizen-crowdsourcing', citizenRoutes);
featuresRouter.use('/messaging-gateway', messagingRoutes);

/**
 * Start all feature background workers (same setInterval style as the
 * existing alert engine / weather monitor - no competing worker framework).
 * Called from server.js alongside startAlertEngine / startWeatherMonitor.
 */
function startFeatureWorkers(io) {
  const { startMessagingWorkers } = require('./messaging-gateway/workers/dispatchWorker');
  startMessagingWorkers(io);
}

/**
 * Start feature listeners that observe EXISTING Socket.io events.
 * Should be invoked once the HTTP/Socket server is listening.
 */
function startFeatureListeners() {
  const { startListener } = require('./messaging-gateway/services/triggerService');
  return startListener();
}

/** Registry used by tests and documentation. */
const REGISTRY = [['citizen-crowdsourcing', 'Citizen Crowdsourcing Portal'], ['messaging-gateway', 'Messaging Gateway']];

module.exports = {
  featuresRouter,
  startFeatureWorkers,
  startFeatureListeners,
  REGISTRY,
};