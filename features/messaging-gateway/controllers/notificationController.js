'use strict';

/**
 * Messaging Gateway - admin + webhook request handlers.
 */

const notificationModel = require('../services/notificationModel');
const notificationService = require('../services/notificationService');
const { publicConfig } = require('../config');
const { validateMessage } = require('../services/validation');
const wrap = require('../../../src/utils/wrap');

/** Partial-mask a recipient for list responses (minimal PII exposure). */
function maskRecipient(recipient) {
  if (!recipient) return null;
  const value = String(recipient);
  if (value.includes('@')) {
    const [user, domain] = value.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return value.length > 6
    ? `${value.slice(0, 2)}****${value.slice(-4)}`
    : '*****';
}

function safeRows(message) {
  return {
    id: message.id,
    incidentId: message.incident_id,
    channel: message.channel,
    recipient: maskRecipient(message.recipient),
    recipientLast4: message.recipient ? String(message.recipient).slice(-4) : null,
    subject: message.subject,
    body: message.body,
    provider: message.provider,
    externalId: message.external_id,
    status: message.status,
    error: message.error,
    attempts: message.attempts,
    metadata: message.metadata,
    createdAt: message.created_at,
    sentAt: message.sent_at,
    deliveredAt: message.delivered_at,
  };
}

// GET /status - public, no secrets
const getStatus = wrap(async (_req, res) => {
  return res.json({
    ...publicConfig(),
    counts: await notificationModel.countByStatus(),
  });
});

// GET / - admin list of notifications (sent, failed, pending, delivery status)
const listNotifications = wrap(async (req, res) => {
  const { status, channel, provider, incident_id, limit, offset } = req.query;
  const rows = await notificationModel.listNotifications({
    status: status || null,
    channel: channel || null,
    provider: provider || null,
    incidentId: incident_id || null,
    limit,
    offset,
  });
  return res.json({ notifications: rows.map(safeRows), count: rows.length });
});

// GET /stats - aggregate views for the admin page
const stats = wrap(async (_req, res) => {
  const [byStatus, byProvider] = await Promise.all([
    notificationModel.countByStatus(),
    notificationModel.countByProvider(),
  ]);
  return res.json({ byStatus, byProvider, provider: publicConfig().provider });
});

// POST /test-send - admin manual dispatch through the real pipeline.
// Without provider credentials this yields a clearly-marked SIMULATED record.
const testSend = wrap(async (req, res) => {
  const { channel = 'sms', to, message } = req.body || {};
  const check = validateMessage({ channel, recipient: to, subject: '[NIEL] test', body: message });
  if (!check.ok) return res.status(400).json({ error: check.error });

  const result = await notificationService.sendMessage({
    channel: check.payload.channel,
    recipient: check.payload.recipient,
    subject: check.payload.subject,
    body: check.payload.body,
    createdBy: req.user.id,
  });

  const statusCode = result.simulated || result.sent ? 201 : 424; // 424 = failed dependency / provider error
  return res.status(statusCode).json(result);
});

// POST /webhook - provider delivery callbacks (external_id -> delivered/failed)
const webhook = wrap(async (req, res) => {
  const { external_id, status, error } = req.body || {};
  if (!external_id) return res.status(400).json({ error: 'external_id is required' });

  const row = await notificationModel.getByExternalId(String(external_id));
  if (!row) {
    return res.status(404).json({ error: 'No notification matches this external_id' });
  }

  if (String(status || '').toLowerCase() === 'delivered') {
    const updated = await notificationModel.markDelivered({
      id: row.id,
      deliveredAt: new Date().toISOString(),
    });
    return res.json({ ok: true, notification: safeRows(updated) });
  }

  // Non-delivered callback: treat as failure (but never as a silent drop).
  const failed = await notificationModel.markFailure({
    id: row.id,
    attempts: Number(row.attempts || 0) + 1,
    nextAttemptAtMs: Date.now() + 60 * 1000,
    error: error || 'provider reported non-delivery',
  });
  return res.json({ ok: true, notification: safeRows(failed) });
});

module.exports = {
  getStatus,
  listNotifications,
  stats,
  testSend,
  webhook,
  safeRows,
  maskRecipient,
};