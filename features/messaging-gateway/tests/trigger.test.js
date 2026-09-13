'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateTrigger, isStructural } = require('../services/triggerService');

const TRIGGER = {
  severities: ['HIGH', 'CRITICAL'],
  structuralBlockage: true,
  structuralOnlyTriggers: true,
};

test('high severity incident triggers a notification', () => {
  const verdict = evaluateTrigger(
    { incident_type: 'Road_Block', severity: 'High' },
    TRIGGER
  );
  assert.strictEqual(verdict.ok, true);
  assert.ok(verdict.reasons.some((r) => r.includes('severity')));
});

test('critical severity triggers', () => {
  assert.strictEqual(evaluateTrigger({ severity: 'Critical' }, TRIGGER).ok, true);
});

test('low severity non-structural incident does NOT trigger', () => {
  const verdict = evaluateTrigger(
    { incident_type: 'Landslide', severity: 'Low' },
    TRIGGER
  );
  assert.strictEqual(verdict.ok, false);
});

test('low severity but structural blockage (Road_Block) triggers', () => {
  const verdict = evaluateTrigger(
    { incident_type: 'Road_Block', severity: 'Low' },
    TRIGGER
  );
  assert.strictEqual(verdict.ok, true);
  assert.ok(verdict.reasons.some((r) => r.includes('structural')));
});

test('structural boolean flag alone triggers', () => {
  assert.strictEqual(
    evaluateTrigger({ incident_type: 'Other', severity: 'Low', structural_blockage: true }, TRIGGER).ok,
    true
  );
});

test('when structure-only triggers are disabled, low severity non-triggering', () => {
  const verdict = evaluateTrigger(
    { incident_type: 'Road_Block', severity: 'Low' },
    { ...TRIGGER, structuralOnlyTriggers: false }
  );
  assert.strictEqual(verdict.ok, false);
});

test('structural blockage detection recognises blocked types', () => {
  assert.strictEqual(isStructural({ incident_type: 'Road_Block' }), true);
  assert.strictEqual(isStructural({ incident_type: 'Bridge_Damage' }), true);
  assert.strictEqual(isStructural({ incident_type: 'Flood' }), false);
  assert.strictEqual(isStructural({ structural_blockage: true }), true);
});

test('empty payload never triggers', () => {
  assert.strictEqual(evaluateTrigger(null, TRIGGER).ok, false);
  assert.strictEqual(evaluateTrigger({}, TRIGGER).ok, false);
});