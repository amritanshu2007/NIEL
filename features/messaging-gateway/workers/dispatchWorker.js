'use strict';

/**
 * Messaging Gateway - background dispatch worker.
 *
 * Runs on the SAME setInterval pattern as the existing alert engine /
 * weather monitor (no competing worker framework). Claims notifications that
 * are due (first attempt or retry window) and dispatches them through the
 * active provider. Emits the additive `message:status` Socket.io event so
 * dashboards can follow delivery in real time.
 *
 * Dispatch is asynchronous to the incident pipeline by design: incidents
 * trigger enqueues, this worker performs the sends.
 */

const notificationModel = require('../services/notificationModel');
const notificationService = require('../services/notificationService');
const cfg = require('../config').config;

let timer = null;
let running = false;

function emitMessageStatus(io, message) {
  if (!io || !message) return;
  try {
    io.emit('message:status', {
      id: message.id,
      channel: message.channel,
      recipient: message.recipient ? `${message.recipient.slice(0, 3)}****${message.recipient.slice(-4)}` : null,
      status: message.status,
      error: message.error || null,
      at: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  }
}

async function processPending(io) {
  if (running) return;
  running = true;
  try {
    const c = cfg();
    const due = await notificationModel.claimDue({ limit: 50, maxAttempts: c.maxAttempts });
    for (const row of due) {
      const updated = await notificationService.dispatchNotification(row);
      emitMessageStatus(io, updated || row);
    }
  } catch (err) {
    console.warn('[messaging-gateway] dispatch worker cycle failed:', err.message);
  } finally {
    running = false;
  }
}

function startMessagingWorkers(io) {
  if (timer) return;
  const c = cfg();
  setTimeout(() => processPending(io), 2000);
  timer = setInterval(() => processPending(io), c.workerMs);
  timer.unref?.();
  console.log(
    `[messaging-gateway] dispatch worker started (provider=${c.provider}, every ${c.workerMs}ms)`
  );
}

function stopMessagingWorkers() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startMessagingWorkers, stopMessagingWorkers, processPending };