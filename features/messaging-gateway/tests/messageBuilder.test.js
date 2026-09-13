'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildIncidentAlert, buildSubject, RECOMMENDED_ACTIONS } = require('../services/messageBuilder');

test('alert text contains type, severity, area, action and time', () => {
  const text = buildIncidentAlert({
    incidentType: 'Road_Block',
    severity: 'High',
    road: 'NH-27',
    locationName: 'Imphal',
    timestamp: '2026-09-14T08:00:00Z',
  });
  assert.match(text, /Road_Block/);
  assert.match(text, /HIGH/);
  assert.match(text, /NH-27/);
  assert.match(text, /Imphal/);
  assert.match(text, /ACTION|action|Action/i);
  assert.match(text, /IST/);
});

test('alert never contains coordinates or internal fields', () => {
  const text = buildIncidentAlert({
    incidentType: 'Landslide',
    severity: 'Critical',
    road: 'NH-29',
    locationName: 'Tawang',
    timestamp: null,
  });
  assert.ok(!/\[?[0-9]{2}\.?[0-9]{4,}/.test(text)); // no raw coordinate pairs
  assert.ok(!text.includes('[') && !text.includes(']'));
  assert.ok(!/\{"type":/.test(text)); // no geojson dump
});

test('road-agnostic alerts still mention the area', () => {
  const text = buildIncidentAlert({ incidentType: 'Flood', severity: 'Medium', road: '', locationName: 'Silchar' });
  assert.match(text, /Silchar/);
});

test('subject is concise and severity-labelled', () => {
  assert.strictEqual(buildSubject('Road_Block', 'High'), '[NIEL] HIGH Road_Block advisory');
});

test('every known incident type has a recommended action', () => {
  for (const type of Object.keys(RECOMMENDED_ACTIONS)) {
    assert.ok(RECOMMENDED_ACTIONS[type].length > 10, `action for ${type} too short`);
  }
});