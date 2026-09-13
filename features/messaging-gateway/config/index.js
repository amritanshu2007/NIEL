'use strict';

/**
 * Messaging Gateway - environment-driven configuration.
 *
 * Credentials are read ONLY from environment variables (or a .env file
 * loaded by dotenv in the backend). This module never hard-codes secrets,
 * never logs them, and never exposes them (see publicConfig()).
 */

const DEFAULT_TRIGGER_SEVERITIES = 'HIGH,CRITICAL';

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

/**
 * Reads all messaging configuration from process.env.
 * Callers should treat this as the single source of truth.
 */
function config() {
  return {
    // Active provider: twilio | fast2sms | dev   (spelled exactly like this)
    provider: String(process.env.MESSAGING_PROVIDER || 'dev').toLowerCase(),

    // --- Twilio credentials (never surfaced outside this module) ---
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      smsFrom: process.env.TWILIO_SMS_FROM || '',
      whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    },

    // --- Fast2SMS credentials ---
    fast2sms: {
      apiKey: process.env.FAST2SMS_API_KEY || '',
      route: process.env.FAST2SMS_ROUTE || 'q',
      senderId: process.env.FAST2SMS_SENDER_ID || '',
    },

    // --- Incident trigger thresholds ---
    trigger: {
      // CSV of severities that must notify (case-insensitive) HIGH,CRITICAL
      severities: (process.env.MESSAGING_TRIGGER_SEVERITIES || DEFAULT_TRIGGER_SEVERITIES)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      structuralBlockage: bool(process.env.MESSAGING_TRIGGER_STRUCTURAL_BLOCKAGE, true),
      // Whether a structural blockage alone (any severity) triggers.
      structuralOnlyTriggers: bool(process.env.MESSAGING_TRIGGER_STRUCTURE_OR_SEVERITY, true),
    },

    // --- Driver targeting (PostGIS geographic corridor matching) ---
    targeting: {
      enabled: bool(process.env.MESSAGING_DRIVER_TARGETING, true),
      radiusKm: Number(process.env.MESSAGING_RADIUS_KM) || 15,
      corridorRadiusM: Number(process.env.MESSAGING_CORRIDOR_RADIUS_M) || 20000,
      maxTargets: Number(process.env.MESSAGING_MAX_TARGETS_PER_INCIDENT) || 8,
      vehicleStatuses: (process.env.MESSAGING_VEHICLE_STATUSES || 'IN_TRANSIT')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    },

    // --- Channels delivered for a triggered incident ---
    channels: (process.env.MESSAGING_CHANNELS || 'sms')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),

    // --- Reliability / rate limiting (notifications per 60s window) ---
    rateLimitPerMinute: Number(process.env.MESSAGING_RATE_PER_MINUTE) || 30,
    maxAttempts: Number(process.env.MESSAGING_MAX_ATTEMPTS) || 3,
    backoffBaseMs: Number(process.env.MESSAGING_BACKOFF_BASE_MS) || 10000,
    backoffFactor: 2,
    workerMs: Number(process.env.MESSAGING_WORKER_MS) || 20000,
    timeoutMs: Number(process.env.MESSAGING_TIMEOUT_MS) || 8000,

    // Self-listener: the feature connects a small socket.io-client to the
    // EXISTING server so it can observe 'incident:new' broadcasts exactly as
    // an external integration would. No part of the alert engine is modified.
    listener: {
      host: process.env.MESSAGING_LISTENER_HOST || '127.0.0.1',
      port: Number(process.env.MESSAGING_LISTENER_PORT) || Number(process.env.PORT) || 5000,
      path: process.env.MESSAGING_LISTENER_PATH || '/socket.io/',
    },
  };
}

/**
 * Safe, public summary - NEVER contains credentials or provider secrets.
 * Safe to return from GET /status and to send to the front end.
 */
function publicConfig() {
  const cfg = config();
  const recordsReady = {
    credentials: cfg.provider !== 'dev',
    simulated: cfg.provider === 'dev',
    note:
      cfg.provider === 'dev'
        ? 'No provider credentials configured - all notifications are SIMULATED and clearly marked, never reported as delivered.'
        : `Dispatch enabled via ${cfg.provider}.`,
  };
  return {
    provider: cfg.provider,
    channels: cfg.channels,
    trigger: {
      severities: cfg.trigger.severities,
      structuralBlockage: cfg.trigger.structuralBlockage,
      structuralOnlyTriggers: cfg.trigger.structuralOnlyTriggers,
    },
    targeting: {
      enabled: cfg.targeting.enabled,
      radiusKm: cfg.targeting.radiusKm,
      maxTargets: cfg.targeting.maxTargets,
    },
    reliability: {
      maxAttempts: cfg.maxAttempts,
      backoffBaseMs: cfg.backoffBaseMs,
      rateLimitPerMinute: cfg.rateLimitPerMinute,
    },
    mode: cfg.provider === 'dev' ? 'simulation' : 'live',
    ...recordsReady,
  };
}

module.exports = { config, publicConfig };