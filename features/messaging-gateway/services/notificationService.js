'use strict';

/**
 * Messaging Gateway - notification service.
 *
 * Orchestrates the full pipeline on the existing feature_messages ledger:
 *   enqueue -> (async worker) -> dispatch to provider -> retry/backoff.
 *
 * Reliability guarantees:
 *   * idempotency     - deterministic dedupe_key per logical notification;
 *                       duplicate inserts are rejected at the DB layer and
 *                       short-circuited in-memory.
 *   * duplicate prevention - same incident, driver/channel does not double-notify.
 *   * retry/backoff   - up to maxAttempts with exponential next_attempt_at.
 *   * rate limiting   - hard cap on notifications/minute to avoid loops.
 *   * provider failure handling - failures are persisted with the error text.
 *   * simulation clarity - the dev adapter marks rows 'simulated', never sent.
 */

const notificationModel = require('./notificationModel');
const { providerFor } = require('../adapters');
const cfg = require('../config').config;
const types = require('../types');
const { STATUS } = types;

// Fast in-process duplicate guard (defense in depth - the DB unique index is
// the source of truth; this skips a wasted round-trip on a burst replay).
const seenKeys = new Set();

function remember(dedupeKey) {
  if (!dedupeKey) return false;
  if (seenKeys.has(dedupeKey)) return true;
  seenKeys.add(dedupeKey);
  return false;
}

// ---------------------------------------------------------------- rate limit
// Per-minute sliding window (process-local; DB-level checks add safety).
let windowStart = Date.now();
let dispatchCount = 0;

function resetWindow() {
  const now = Date.now();
  if (now - windowStart >= 60 * 1000) {
    windowStart = now;
    dispatchCount = 0;
  }
}

function rateLimitReached() {
  resetWindow();
  const cap = Math.max(cfg().rateLimitPerMinute, 1);
  if (dispatchCount >= cap) return true;
  dispatchCount += 1;
  return false;
}

// ---------------------------------------------------------------- retry math
/** Exponential backoff (ms) for the attempt number (1-based). */
function backoffMs(attempt, override) {
  const c = { ...cfg(), ...(override || {}) };
  return c.backoffBaseMs * Math.pow(c.backoffFactor || 2, Math.max(attempt - 1, 0));
}

/**
 * Enqueue a single notification (deduped). Returns { row, duplicate }.
 */
async function enqueueNotification({
  incidentId = null,
  channel,
  recipient,
  subject = null,
  body,
  provider = null,
  metadata = null,
  topic = 'incident-alert',
  createdBy = null,
  dedupeKey = null,
}) {
  const key = dedupeKey || types.dedupeKey({ incidentId, recipient, channel, topic });
  if (remember(key)) return { row: null, duplicate: true };

  const { row, duplicate } = await notificationModel.createNotification({
    incidentId,
    channel,
    recipient,
    subject,
    body,
    provider,
    metadata,
    dedupeKey: key,
    createdBy,
  });
  return { row, duplicate };
}

/**
 * Synchronous convenience used by other features (e.g. citizen-report
 * acknowledgements) and the admin test-send endpoint. Enqueues then attempts
 * an immediate dispatch so the caller sees an honest result.
 */
async function sendMessage({ channel, recipient, subject, body, metadata, createdBy, incidentId = null }) {
  const check = require('./validation').validateMessage({ channel, recipient, subject, body });
  if (!check.ok) {
    const err = new Error(check.error);
    err.isPublic = true;
    err.status = 400;
    throw err;
  }
  const { row, duplicate } = await enqueueNotification({
    incidentId,
    channel: check.payload.channel,
    recipient: check.payload.recipient,
    subject: check.payload.subject,
    body: check.payload.body,
    metadata,
    createdBy,
    topic: 'manual',
    dedupeKey: null, // manual messages are never deduped against incidents
  });
  if (duplicate) return { id: null, duplicate: true };
  const dispatched = await dispatchNotification(row);
  return {
    id: dispatched.id,
    channel: dispatched.channel,
    recipient: dispatched.recipient,
    status: dispatched.status,
    simulated: dispatched.status === STATUS.SIMULATED,
    sent: dispatched.status === STATUS.SENT,
    failed: dispatched.status === STATUS.FAILED,
    error: dispatched.error || null,
    provider: dispatched.provider || null,
  };
}

/**
 * Fan out one notification per (target, channel) with dedup + rate limiting.
 * Returns the persisted notification rows (skips duplicates).
 */
async function enqueueIncidentNotifications({ incident, targets, channels, providerName, createdBy = null }) {
  const c = cfg();
  const channelList = channels && channels.length ? channels : c.channels;
  const results = [];

  for (const target of targets) {
    for (const channel of channelList) {
      if (channel !== 'sms' && channel !== 'whatsapp') continue;
      const body = require('./messageBuilder').buildIncidentAlert({
        incidentType: incident.incident_type,
        severity: incident.severity,
        road: incident.road,
        locationName: incident.location_name || target.destination || 'the affected corridor',
        timestamp: incident.created_at,
      });
      const subject = require('./messageBuilder').buildSubject(incident.incident_type, incident.severity);

      const { row, duplicate } = await enqueueNotification({
        incidentId: incident.id,
        channel,
        recipient: target.phone,
        subject,
        body,
        provider: providerName || c.provider,
        metadata: {
          target: {
            vehicle_id: target.vehicleId,
            vehicle_number: target.vehicleNumber,
            driver_name: target.driverName,
            match_type: target.matchType,
            distance_km: target.distanceKm,
            status: target.status,
            cargo_type: target.cargoType,
          },
          incident: { id: incident.id, type: incident.incident_type },
        },
        createdBy,
      });
      results.push({ row, duplicate, target, channel });
    }
  }
  return results;
}

/**
 * Dispatch a single claimed row through the active provider.
 * Handles dev simulation, provider failures, backoff, and rate limiting.
 */
async function dispatchNotification(row) {
  const c = cfg();
  const provider = providerFor(c);

  // Rate limiting suppresses dispatch but keeps the row queued for the next
  // worker pass (never marks it as sent).
  if (rateLimitReached()) {
    await notificationModel.updateStatus(row.id, {
      status: STATUS.QUEUED,
      nextAttemptAt: new Date(Date.now() + c.workerMs).toISOString(),
    });
    return notificationModel.getNotification(row.id);
  }

  if (provider.name === 'dev') {
    const res = await provider.sendSMS({ to: row.recipient, body: row.body });
    if (res.simulated) {
      return notificationModel.markSimulated({ id: row.id, externalId: res.externalId });
    }
  }

  const method = provider.supportedChannels.includes(row.channel)
    ? row.channel === 'whatsapp'
      ? provider.sendWhatsApp.bind(provider)
      : provider.sendSMS.bind(provider)
    : null;

  if (!method) {
    return notificationModel.markFailure({
      id: row.id,
      attempts: Number(row.attempts || 0) + 1,
      nextAttemptAtMs: Date.now() + backoffMs(Number(row.attempts || 0) + 1),
      error: `Provider ${provider.name} does not support channel ${row.channel}`,
    });
  }

  try {
    const res = await method({ to: row.recipient, body: row.body });
    if (res.ok) {
      return notificationModel.markSent({
        id: row.id,
        externalId: res.externalId,
        providerStatus: res.providerStatus || undefined,
      });
    }
    return notificationModel.markFailure({
      id: row.id,
      attempts: Number(row.attempts || 0) + 1,
      nextAttemptAtMs: Date.now() + backoffMs(Number(row.attempts || 0) + 1),
      error: res.error || 'provider refused the message',
    });
  } catch (err) {
    return notificationModel.markFailure({
      id: row.id,
      attempts: Number(row.attempts || 0) + 1,
      nextAttemptAtMs: Date.now() + backoffMs(Number(row.attempts || 0) + 1),
      error: err.message.slice(0, 500),
    });
  }
}

module.exports = {
  enqueueNotification,
  enqueueIncidentNotifications,
  sendMessage,
  dispatchNotification,
  backoffMs,
  rateLimitReached,
  status: types.STATUS,
  _resetSession: () => {
    seenKeys.clear();
    windowStart = Date.now();
    dispatchCount = 0;
  },
};