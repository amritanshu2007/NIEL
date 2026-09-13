'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const pool = require('../../../src/config/db');
const { createNotification, getByDedupeKey, claimDue, getNotification } = require('../services/notificationModel');
const notificationService = require('../services/notificationService');
const driverTargeting = require('../services/driverTargeting');
const vehicleModel = require('../../../src/models/vehicleModel');
const incidentModel = require('../../../src/models/incidentModel');

const runSalt = `${Date.now()}`;

test('notification persistence across the full ledger', async (t) => {
  t.after(() => pool.end());
  const dedupeKey = `it-persist-${runSalt}`;
  const { row, duplicate } = await createNotification({
    incidentId: 900001,
    channel: 'sms',
    recipient: '+919900000001',
    subject: '[NIEL] test',
    body: 'integration test body',
    provider: 'dev',
    dedupeKey,
  });
  assert.strictEqual(duplicate, false);
  assert.ok(row.id);
  assert.strictEqual(row.status, 'queued');
  assert.strictEqual(row.incident_id, 900001);

  const fetched = await getByDedupeKey(dedupeKey);
  assert.ok(fetched);
  assert.strictEqual(fetched.external_id, null); // delivered_at/error start null

  // cleanup
  await pool.query('DELETE FROM feature_messages WHERE dedupe_key = $1', [dedupeKey]);
});

test('duplicate prevention via unique dedupe_key and in-memory guard', async (t) => {
  t.after(() => pool.end());
  const dedupeKey = `it-dup-${runSalt}`;
  notificationService._resetSession();

  const first = await notificationService.enqueueNotification({
    incidentId: 900002,
    channel: 'sms',
    recipient: '+919900000002',
    subject: 'dup',
    body: 'duplicate test',
    provider: 'dev',
    dedupeKey,
  });
  assert.strictEqual(first.row.id !== undefined, true);

  const second = await notificationService.enqueueNotification({
    incidentId: 900002,
    channel: 'sms',
    recipient: '+919900000002',
    subject: 'dup',
    body: 'duplicate test',
    provider: 'dev',
    dedupeKey,
  });
  assert.strictEqual(second.duplicate, true);

  await pool.query('DELETE FROM feature_messages WHERE dedupe_key = $1', [dedupeKey]);
});

test('dev-adapter dispatch results in a clearly-marked SIMULATED status', async (t) => {
  t.after(() => pool.end());
  notificationService._resetSession();
  const { row } = await createNotification({
    channel: 'sms',
    recipient: '+919900000003',
    subject: 'sim',
    body: 'simulated delivery test',
    provider: 'dev',
    dedupeKey: `it-sim-${runSalt}`,
  });
  const dispatched = await notificationService.dispatchNotification(row);
  assert.strictEqual(dispatched.status, 'simulated');
  assert.match(dispatched.external_id, /^sim-/);
  assert.strictEqual(dispatched.delivered_at, null); // never reported as delivered

  await pool.query('DELETE FROM feature_messages WHERE id = $1', [dispatched.id]);
});

test('worker claim path picks up queued notifications', async (t) => {
  t.after(() => pool.end());
  const { row } = await createNotification({
    channel: 'sms',
    recipient: '+919900000004',
    subject: 'claim',
    body: 'claim test',
    provider: 'dev',
    dedupeKey: `it-claim-${runSalt}`,
  });
  const claimed = await claimDue({ limit: 50, maxAttempts: 3 });
  assert.ok(claimed.some((c) => c.id === row.id));
  assert.strictEqual(claimed.find((c) => c.id === row.id).status, 'sending');

  await pool.query('DELETE FROM feature_messages WHERE id = $1', [row.id]);
});

test('driver corridor targeting finds active vehicles near the incident (PostGIS)', async (t) => {
  t.after(() => pool.end());
  const vehicleNumber = `TEST-${runSalt}`;
  let vehicleId = null;
  let incidentId = null;
  try {
    const vehicle = await vehicleModel.registerVehicle({
      vehicleNumber,
      driverName: 'Test Driver',
      phone: '+919900000005',
      cargoType: 'Medicine',
      lng: 91.7362,
      lat: 26.1445,
      destination: 'Guwahati',
      status: 'IN_TRANSIT',
    });
    vehicleId = vehicle.id;

    const targets = await driverTargeting.findTargets(
      { incident_type: 'Road_Block', severity: 'High', lng: 91.7362, lat: 26.1445 },
      { enabled: true, radiusKm: 10, corridorRadiusM: 20000, maxTargets: 8, vehicleStatuses: ['IN_TRANSIT'] }
    );

    assert.ok(targets.length >= 1, 'expected at least one nearby active vehicle');
    const hit = targets.find((x) => x.vehicleNumber === vehicleNumber);
    assert.ok(hit, 'the registered test vehicle should be targeted');
    assert.strictEqual(hit.matchType, 'corridor', 'corridor matching should take precedence');

    // Activate the full pipeline for the found target.
    const enqueued = await notificationService.enqueueIncidentNotifications({
      incident: { id: 900003, incident_type: 'Road_Block', severity: 'High' },
      targets: [hit],
      channels: ['sms'],
      providerName: 'dev',
    });
    assert.strictEqual(enqueued.length, 1);
    const notif = enqueued[0].row;
    assert.ok(notif);
    assert.strictEqual(notif.incident_id, 900003);
    assert.strictEqual(notif.recipient, '+919900000005');
    assert.match(notif.body, /Road_Block/);
    await pool.query('DELETE FROM feature_messages WHERE id = $1', [notif.id]);
  } finally {
    if (vehicleId) await pool.query('DELETE FROM vehicles WHERE id = $1', [vehicleId]);
    if (incidentId) await pool.query('DELETE FROM incidents WHERE id = $1', [incidentId]);
  }
});

test('non-triggering incident report is refused by trigger evaluation', async () => {
  const { evaluateTrigger } = require('../services/triggerService');
  const verdict = evaluateTrigger(
    { incident_type: 'Flood', severity: 'Low' },
    { severities: ['HIGH', 'CRITICAL'], structuralBlockage: true, structuralOnlyTriggers: true }
  );
  assert.strictEqual(verdict.ok, false);
});