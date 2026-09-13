'use strict';

const incidentModel = require('../models/incidentModel');
const vehicleModel = require('../models/vehicleModel');
const roadModel = require('../models/roadModel');

const ITEM_TYPES = ['incident', 'vehicle_location', 'road_status'];

// In-memory idempotency + ordering state, keyed per device.
// NOTE: resets on server restart; fine for this phase, can be backed by
// a sync_log table later for multi-instance support.
const processed = new Map(); // deviceId -> Set<itemId>
const lastSeq = new Map();   // deviceId -> { [type]: lastSeq }

const isProcessed = (deviceId, itemId) =>
  processed.has(deviceId) && processed.get(deviceId).has(itemId);

const conflictCheck = (deviceId, type, seq) => {
  if (seq === undefined || seq === null) return false;
  const seen = lastSeq.has(deviceId) ? lastSeq.get(deviceId)[type] : undefined;
  if (seen !== undefined && seq <= seen) return true;
  if (!lastSeq.has(deviceId)) lastSeq.set(deviceId, {});
  lastSeq.get(deviceId)[type] = seq;
  return false;
};

const markProcessed = (deviceId, itemId) => {
  if (!processed.has(deviceId)) processed.set(deviceId, new Set());
  processed.get(deviceId).add(itemId);
};

const processIncident = async (user, payload) => {
  const { location, incident_type, severity = 'Medium', photo_url } = payload;
  const { lat, lng } = location || {};
  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (
    Number.isNaN(latNum) || Number.isNaN(lngNum) ||
    latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180
  ) {
    throw new Error('location must include lat in [-90, 90] and lng in [-180, 180]');
  }
  if (!incidentModel.INCIDENT_TYPES.includes(incident_type)) {
    throw new Error(`incident_type must be one of: ${incidentModel.INCIDENT_TYPES.join(', ')}`);
  }
  if (!incidentModel.SEVERITIES.includes(severity)) {
    throw new Error(`severity must be one of: ${incidentModel.SEVERITIES.join(', ')}`);
  }

  return incidentModel.createIncident({
    reportedByUserId: user.id,
    lng: lngNum,
    lat: latNum,
    incidentType: incident_type,
    photoUrl: photo_url || null,
    severity,
  });
};

const processVehicleLocation = async (payload) => {
  const { vehicle_number, location, status } = payload;
  const { lat, lng } = location || {};
  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!vehicle_number) throw new Error('vehicle_number is required');
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    throw new Error('location must include numeric lat and lng');
  }

  const vehicle = await vehicleModel.updateLocation({
    vehicleNumber: vehicle_number,
    lng: lngNum,
    lat: latNum,
    status,
  });
  if (!vehicle) throw new Error('Vehicle not found');
  return vehicle;
};

const processRoadStatus = async (payload) => {
  const { id, status } = payload;
  if (!roadModel.ROAD_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${roadModel.ROAD_STATUSES.join(', ')}`);
  }
  const road = await roadModel.updateStatus(id, status);
  if (!road) throw new Error('Road not found');
  return road;
};

const processItem = async ({ user, deviceId, item }) => {
  if (!item || typeof item !== 'object') {
    return { status: 'error', error: 'item must be an object' };
  }
  const { id, type, seq, payload } = item;

  if (!id) return { status: 'error', error: 'item.id is required' };
  if (!ITEM_TYPES.includes(type)) {
    return { status: 'error', error: `type must be one of: ${ITEM_TYPES.join(', ')}` };
  }
  if (!payload || typeof payload !== 'object') {
    return { status: 'error', error: 'item.payload is required' };
  }

  if (isProcessed(deviceId, id)) {
    return { status: 'duplicate' };
  }
  if (conflictCheck(deviceId, type, seq)) {
    return { status: 'conflict', error: 'stale sequence - newer state already synced' };
  }

  try {
    if (type === 'incident') await processIncident(user, payload);
    else if (type === 'vehicle_location') await processVehicleLocation(payload);
    else await processRoadStatus(payload);
    markProcessed(deviceId, id);
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
};

const processBatch = async ({ user, deviceId, items }) => {
  const device = deviceId || 'anonymous';
  const results = [];

  for (const item of items) {
    const r = await processItem({ user, deviceId: device, item });
    results.push({
      itemId: item && item.id,
      type: item && item.type,
      status: r.status,
      error: r.error,
    });
  }

  const summary = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return { results, summary };
};

module.exports = { processBatch, ITEM_TYPES };